"use server";

import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { hashReviewToken } from "@/lib/proposals/review-links";
import {
  isZohoSignConfigured,
  normalizeZohoSignStatus,
  sendZohoSignDocument,
} from "@/lib/zoho/sign";

function portalUrl(token: string, message?: string) {
  const params = new URLSearchParams();
  if (message) params.set("error", message);
  return `/customer/proposals/${token}${params.toString() ? `?${params.toString()}` : ""}`;
}

function appOrigin() {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`.replace(/\/$/, "");
  return "http://localhost:3000";
}

async function loadPublicSignatureDocument(
  supabase: ReturnType<typeof createAdminClient>,
  organizationId: string,
  jobId: string,
  documentVersionId: string,
) {
  const { data: version, error } = await supabase
    .from("document_versions")
    .select(`
      id, version, status, approval_status,
      assets(provider_file_id, original_filename, content_type),
      documents!inner(id, kind, title, inspection_job_id)
    `)
    .eq("id", documentVersionId)
    .eq("organization_id", organizationId)
    .eq("documents.inspection_job_id", jobId)
    .single();
  if (error || !version) throw new Error(error?.message ?? "The signing document could not be found.");
  const document = Array.isArray(version.documents) ? version.documents[0] : version.documents;
  if (!document || !["contract", "proposal"].includes(document.kind)) {
    throw new Error("The selected document is not available for signature.");
  }
  if (version.status !== "ready") throw new Error("The signing document is not ready yet.");
  if (version.approval_status !== "approved") {
    throw new Error("The work authorization is no longer approved for signature.");
  }
  const asset = Array.isArray(version.assets) ? version.assets[0] : version.assets;
  if (!asset?.provider_file_id) throw new Error("The signing document file is missing.");

  const { data: pdf, error: downloadError } = await supabase.storage
    .from("report-pdfs")
    .download(asset.provider_file_id);
  if (downloadError || !pdf) throw new Error(downloadError?.message ?? "Unable to download the signing document.");

  return {
    bytes: new Uint8Array(await pdf.arrayBuffer()),
    filename: asset.original_filename || `${document.kind}-v${version.version}.pdf`,
    title: document.title,
    version: version.version,
  };
}

async function recordSignatureEvent(input: {
  supabase: ReturnType<typeof createAdminClient>;
  organizationId: string;
  signatureRequestId: string;
  eventType: string;
  providerStatus: string | null;
  summary: string;
  payload?: unknown;
}) {
  await input.supabase.from("signature_request_events").insert({
    organization_id: input.organizationId,
    signature_request_id: input.signatureRequestId,
    event_type: input.eventType,
    provider_status: input.providerStatus,
    summary: input.summary,
    payload: input.payload ?? {},
    created_by: null,
  });
}

export async function startCustomerProposalSigning(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  if (!token) redirect("/");
  if (!isZohoSignConfigured()) {
    redirect(portalUrl(token, "Electronic signing is not configured. Please reply to the email for help."));
  }

  const supabase = createAdminClient();
  const { data: link, error: linkError } = await supabase
    .from("proposal_review_links")
    .select(`
      id, organization_id, inspection_job_id, proposal_document_version_id,
      contact_id, signer_name, signer_email, status, expires_at
    `)
    .eq("token_hash", hashReviewToken(token))
    .single();
  if (linkError || !link) redirect(portalUrl(token, "This review link could not be found."));
  if (link.status !== "active") redirect(portalUrl(token, "This review link is no longer active."));
  if (new Date(link.expires_at).getTime() < Date.now()) {
    await supabase.from("proposal_review_links").update({ status: "expired" }).eq("id", link.id);
    redirect(portalUrl(token, "This review link has expired. Please ask our team for a fresh link."));
  }
  if (!link.proposal_document_version_id) {
    redirect(portalUrl(token, "The signing document is missing. Please reply to the email for help."));
  }

  let documentFile: Awaited<ReturnType<typeof loadPublicSignatureDocument>>;
  try {
    documentFile = await loadPublicSignatureDocument(
      supabase,
      link.organization_id,
      link.inspection_job_id,
      link.proposal_document_version_id,
    );
  } catch (error) {
    redirect(portalUrl(token, error instanceof Error ? error.message : "Unable to open the signing document."));
  }

  const requestName = `${documentFile.title} v${documentFile.version} - ${link.signer_name}`;
  const { data: signatureRequest, error: insertError } = await supabase
    .from("signature_requests")
    .insert({
      organization_id: link.organization_id,
      inspection_job_id: link.inspection_job_id,
      document_version_id: link.proposal_document_version_id,
      contact_id: link.contact_id,
      signer_name: link.signer_name,
      signer_email: link.signer_email,
      status: "sending",
      request_name: requestName,
      created_by: null,
    })
    .select("id")
    .single();
  if (insertError || !signatureRequest) {
    redirect(portalUrl(token, insertError?.message ?? "Unable to prepare electronic signing."));
  }

  try {
    const result = await sendZohoSignDocument({
      filename: documentFile.filename,
      pdfBytes: documentFile.bytes,
      requestName,
      signerName: link.signer_name,
      signerEmail: link.signer_email,
      notes: "Please review and sign the work authorization.",
      embedded: true,
      embeddedHost: appOrigin(),
    });
    const nextStatus = result.submitted ? normalizeZohoSignStatus(result.providerStatus) : "draft";
    const failure = result.submissionError
      ? `${result.submissionError} The electronic signing request was created as a draft. Please reply to the email for help.`
      : null;
    await supabase
      .from("signature_requests")
      .update({
        status: nextStatus,
        provider_request_id: result.requestId,
        provider_action_id: result.actionId,
        provider_document_id: result.documentId,
        provider_status: result.providerStatus,
        failure_message: failure,
        sent_at: result.submitted ? new Date().toISOString() : null,
        last_status_checked_at: new Date().toISOString(),
      })
      .eq("id", signatureRequest.id)
      .eq("organization_id", link.organization_id);
    await recordSignatureEvent({
      supabase,
      organizationId: link.organization_id,
      signatureRequestId: signatureRequest.id,
      eventType: result.submitted ? "zoho_sign_embedded_customer_started" : "zoho_sign_draft_created",
      providerStatus: result.providerStatus,
      summary: result.submitted
        ? `Customer embedded signing opened for ${link.signer_email}.`
        : `Zoho Sign draft created for ${link.signer_email}.`,
      payload: result.raw,
    });
    if (result.submitted && result.embeddedSignUrl) redirect(result.embeddedSignUrl);
    redirect(portalUrl(token, failure || "Electronic signing could not be opened. Please reply to the email for help."));
  } catch (error) {
    const failure = error instanceof Error ? error.message : "Electronic signing could not be opened.";
    await supabase
      .from("signature_requests")
      .update({
        status: "failed",
        failure_message: failure,
        last_status_checked_at: new Date().toISOString(),
      })
      .eq("id", signatureRequest.id)
      .eq("organization_id", link.organization_id);
    await recordSignatureEvent({
      supabase,
      organizationId: link.organization_id,
      signatureRequestId: signatureRequest.id,
      eventType: "zoho_sign_failed",
      providerStatus: null,
      summary: failure,
    });
    redirect(portalUrl(token, failure));
  }
}
