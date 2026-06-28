"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { PDFDocument } from "pdf-lib";
import { canCreateJobs } from "@/lib/access";
import { getEmailProvider, type EmailAttachment } from "@/lib/email";
import { getCurrentContext } from "@/lib/current-organization";
import { logReportDeliveryInZoho } from "@/lib/crm/zoho";
import {
  getZohoSignRequestStatus,
  isZohoSignConfigured,
  normalizeZohoSignStatus,
  sendZohoSignDocument,
} from "@/lib/zoho/sign";

type RecipientInput = {
  contactId: string | null;
  email: string;
  name: string;
  type: "to" | "cc" | "bcc";
};

type DeliveryFile = EmailAttachment & {
  version: number;
};

type DeliveryAttempt = {
  attemptId: string;
  attemptNumber: number;
  idempotencyKey: string;
};

function sendUrl(
  jobId: string,
  message: string,
  kind: "saved" | "sent" | "error",
  deliveryId?: string,
) {
  const params = new URLSearchParams({ [kind]: message });
  if (deliveryId) params.set("draft", deliveryId);
  return `/jobs/${jobId}/send?${params.toString()}`;
}

function signatureUrl(jobId: string, message: string, kind: "saved" | "sent" | "error") {
  return sendUrl(jobId, message, kind);
}

function parseSigner(value: FormDataEntryValue | null) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(String(value)) as {
      contactId?: string | null;
      name?: string | null;
      email?: string | null;
    };
    const email = parsed.email?.trim().toLowerCase();
    if (!email) return null;
    return {
      contactId: parsed.contactId || null,
      name: parsed.name?.trim() || email,
      email,
    };
  } catch {
    return null;
  }
}

function cleanRecipient(value: FormDataEntryValue): RecipientInput | null {
  try {
    const parsed = JSON.parse(String(value)) as RecipientInput;
    const email = parsed.email.trim().toLowerCase();
    if (!email) return null;
    return {
      contactId: parsed.contactId || null,
      email,
      name: parsed.name.trim(),
      type: ["to", "cc", "bcc"].includes(parsed.type) ? parsed.type : "to",
    };
  } catch {
    return null;
  }
}

function normalizeRecipients(values: FormDataEntryValue[]) {
  const recipients = values.flatMap((value) => {
    const recipient = cleanRecipient(value);
    return recipient ? [recipient] : [];
  });
  return Array.from(
    new Map(recipients.map((recipient) => [`${recipient.email}:${recipient.type}`, recipient])).values(),
  );
}

async function appendPdfs(files: DeliveryFile[]) {
  const output = await PDFDocument.create();
  for (const file of files) {
    const source = await PDFDocument.load(file.bytes);
    const pages = await output.copyPages(source, source.getPageIndices());
    pages.forEach((page) => output.addPage(page));
  }
  return output.save();
}

async function loadSignatureDocument(
  supabase: Awaited<ReturnType<typeof getCurrentContext>>["supabase"],
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
  if (error || !version) {
    throw new Error(error?.message ?? "The selected contract PDF could not be found.");
  }
  const document = Array.isArray(version.documents) ? version.documents[0] : version.documents;
  if (!document || !["contract", "proposal"].includes(document.kind)) {
    throw new Error("Select a generated contract or proposal PDF for signature.");
  }
  if (version.status !== "ready") {
    throw new Error("The selected contract PDF is not ready yet.");
  }
  const asset = Array.isArray(version.assets) ? version.assets[0] : version.assets;
  if (!asset?.provider_file_id) {
    throw new Error("The selected contract PDF file is missing from storage.");
  }

  const { data: pdf, error: downloadError } = await supabase.storage
    .from("report-pdfs")
    .download(asset.provider_file_id);
  if (downloadError || !pdf) {
    throw new Error(downloadError?.message ?? "Unable to download the selected contract PDF.");
  }
  return {
    bytes: new Uint8Array(await pdf.arrayBuffer()),
    filename: asset.original_filename || `${document.kind}-v${version.version}.pdf`,
    title: document.title,
    version: version.version,
  };
}

async function recordSignatureEvent(input: {
  supabase: Awaited<ReturnType<typeof getCurrentContext>>["supabase"];
  organizationId: string;
  userId: string;
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
    created_by: input.userId,
  });
}

async function loadAttachments(
  supabase: Awaited<ReturnType<typeof getCurrentContext>>["supabase"],
  versionId: string,
  supportingVersionIds: string[],
  packageMode: string,
  jobId: string,
) {
  const versionIds = [versionId, ...supportingVersionIds];
  const { data: deliveryVersions, error } = await supabase
    .from("document_versions")
    .select("id, version, assets(provider_file_id, original_filename, content_type)")
    .in("id", versionIds);
  if (error || !deliveryVersions?.length) {
    throw new Error(error?.message ?? "The selected PDF files could not be found.");
  }

  const versionFiles = new Map(deliveryVersions.map((version) => {
    const asset = Array.isArray(version.assets) ? version.assets[0] : version.assets;
    return [version.id, {
      path: asset?.provider_file_id ?? "",
      filename: asset?.original_filename ?? `document-v${version.version}.pdf`,
      contentType: asset?.content_type ?? "application/pdf",
      version: version.version,
    }];
  }));
  const reportFile = versionFiles.get(versionId);
  if (!reportFile?.path) throw new Error("The approved PDF file could not be found.");

  const files: DeliveryFile[] = [];
  for (const selectedVersionId of versionIds) {
    const file = versionFiles.get(selectedVersionId);
    if (!file?.path) throw new Error("A selected attachment file could not be found.");
    const { data: pdf, error: downloadError } = await supabase.storage
      .from("report-pdfs")
      .download(file.path);
    if (downloadError || !pdf) {
      throw new Error(downloadError?.message ?? "Unable to download a selected PDF.");
    }
    files.push({
      filename: file.filename,
      contentType: file.contentType,
      version: file.version,
      bytes: new Uint8Array(await pdf.arrayBuffer()),
    });
  }

  if (packageMode === "append_contract") {
    return {
      reportVersion: reportFile.version,
      attachments: [{
        filename: `Inspection_Report_${jobId}_with_contract.pdf`,
        contentType: "application/pdf",
        bytes: await appendPdfs(files),
      }],
    };
  }
  if (packageMode === "contract_only") {
    return { reportVersion: reportFile.version, attachments: files.slice(1) };
  }
  if (packageMode === "separate_attachments") {
    return { reportVersion: reportFile.version, attachments: files };
  }
  return { reportVersion: reportFile.version, attachments: files.slice(0, 1) };
}

export async function prepareReportDelivery(formData: FormData) {
  const jobId = String(formData.get("jobId") ?? "");
  const deliveryIdInput = String(formData.get("deliveryId") ?? "");
  const versionId = String(formData.get("versionId") ?? "");
  const subject = String(formData.get("subject") ?? "").trim();
  const message = String(formData.get("message") ?? "").trim();
  const replyTo = String(formData.get("replyTo") ?? "").trim();
  const intent = String(formData.get("intent") ?? "draft");
  const packageMode = String(formData.get("packageMode") ?? "report_only");
  const supportingVersionId = String(formData.get("supportingVersionId") ?? "");
  const supportingVersionIds = packageMode === "report_only" || !supportingVersionId
    ? []
    : [supportingVersionId];
  const recipients = normalizeRecipients(formData.getAll("recipient"));

  if (!jobId || !versionId) redirect("/jobs");
  if (!subject || !message) {
    redirect(sendUrl(jobId, "Enter an email subject and message.", "error", deliveryIdInput));
  }
  if (intent === "send" && !recipients.some((recipient) => recipient.type === "to")) {
    redirect(sendUrl(jobId, "Select at least one To recipient.", "error", deliveryIdInput));
  }

  const { supabase, organization, user } = await getCurrentContext();
  const { data: savedDeliveryId, error } = await supabase.rpc("save_report_delivery_v3", {
    target_organization_id: organization.id,
    target_job_id: jobId,
    target_version_id: versionId,
    target_delivery_id: deliveryIdInput || null,
    email_subject: subject,
    email_message: message,
    email_reply_to: replyTo || null,
    recipient_items: recipients,
    delivery_package_mode: packageMode,
    supporting_version_ids: supportingVersionIds,
    allow_empty_recipients: intent !== "send",
  });
  if (error || !savedDeliveryId) {
    redirect(sendUrl(
      jobId,
      error?.message ?? "Unable to save the delivery.",
      "error",
      deliveryIdInput,
    ));
  }

  if (intent !== "send") {
    revalidatePath(`/jobs/${jobId}/send`);
    redirect(sendUrl(jobId, "Delivery draft saved.", "saved", savedDeliveryId));
  }

  let provider;
  try {
    provider = getEmailProvider();
  } catch (providerError) {
    redirect(sendUrl(
      jobId,
      providerError instanceof Error ? providerError.message : "Email delivery is not configured.",
      "error",
      savedDeliveryId,
    ));
  }

  const { data: attemptData, error: attemptError } = await supabase.rpc(
    "begin_report_delivery_attempt",
    {
      target_organization_id: organization.id,
      target_delivery_id: savedDeliveryId,
      delivery_provider: provider.name,
    },
  );
  if (attemptError || !attemptData) {
    redirect(sendUrl(
      jobId,
      attemptError?.message ?? "Unable to start the delivery attempt.",
      "error",
      savedDeliveryId,
    ));
  }
  const attempt = attemptData as DeliveryAttempt;

  let reportVersion: number;
  let result: Awaited<ReturnType<typeof provider.send>>;
  try {
    const packageFiles = await loadAttachments(
      supabase,
      versionId,
      supportingVersionIds,
      packageMode,
      jobId,
    );
    reportVersion = packageFiles.reportVersion;
    const { attachments } = packageFiles;
    if (!attachments.length) throw new Error("No files were available for this delivery package.");

    result = await provider.send({
      to: recipients.filter((recipient) => recipient.type === "to"),
      cc: recipients.filter((recipient) => recipient.type === "cc"),
      bcc: recipients.filter((recipient) => recipient.type === "bcc"),
      subject,
      text: message,
      replyTo: replyTo || null,
      attachments,
      idempotencyKey: attempt.idempotencyKey,
    });
  } catch (sendError) {
    const failure = sendError instanceof Error ? sendError.message : "Report delivery failed.";
    await supabase.rpc("complete_report_delivery_attempt", {
      target_organization_id: organization.id,
      target_delivery_id: savedDeliveryId,
      target_attempt_id: attempt.attemptId,
      attempt_status: "failed",
      provider_message: null,
      failure_text: failure,
    });
    revalidatePath(`/jobs/${jobId}/send`);
    redirect(sendUrl(jobId, failure, "error", savedDeliveryId));
  }

  const { error: completionError } = await supabase.rpc("complete_report_delivery_attempt", {
    target_organization_id: organization.id,
    target_delivery_id: savedDeliveryId,
    target_attempt_id: attempt.attemptId,
    attempt_status: "sent",
    provider_message: result.messageId,
    failure_text: null,
  });
  if (completionError) {
    revalidatePath(`/jobs/${jobId}/send`);
    redirect(sendUrl(
      jobId,
      "The email provider accepted this message, but delivery history could not be finalized. Do not resend it; an administrator should reconcile this delivery.",
      "error",
      savedDeliveryId,
    ));
  }

  await supabase.from("audit_events").insert({
    organization_id: organization.id,
    actor_user_id: user.id,
    action: "report_sent",
    entity_type: "delivery",
    entity_id: savedDeliveryId,
    summary: `Inspection report version ${reportVersion} sent.`,
    changes: {
      recipients: recipients.map((recipient) => ({
        email: recipient.email,
        type: recipient.type,
      })),
      provider: result.provider,
      providerMessageId: result.messageId,
      packageMode,
      supportingVersionIds,
      attemptNumber: attempt.attemptNumber,
    },
  });

  const contactIds = recipients.flatMap((recipient) => recipient.contactId ? [recipient.contactId] : []);
  const { data: crmContacts } = contactIds.length
    ? await supabase
        .from("contacts")
        .select("zoho_crm_contact_id")
        .in("id", contactIds)
        .eq("organization_id", organization.id)
    : { data: [] };
  try {
    const crmResult = await logReportDeliveryInZoho({
      contactRecordIds: (crmContacts ?? []).flatMap((contact) =>
        contact.zoho_crm_contact_id ? [contact.zoho_crm_contact_id] : [],
      ),
      subject,
      provider: result.provider,
      providerMessageId: result.messageId,
      sentAt: new Date().toISOString(),
      recipients: recipients.map((recipient) => ({
        email: recipient.email,
        type: recipient.type,
      })),
    });
    await supabase
      .from("deliveries")
      .update({
        crm_sync_status: crmResult.status,
        crm_activity_id: crmResult.activityIds.join(",") || null,
        crm_failure_message: null,
      })
      .eq("id", savedDeliveryId);
  } catch (crmError) {
    await supabase
      .from("deliveries")
      .update({
        crm_sync_status: "failed",
        crm_failure_message: crmError instanceof Error ? crmError.message : "Zoho CRM sync failed.",
      })
      .eq("id", savedDeliveryId);
  }

  revalidatePath(`/jobs/${jobId}`);
  revalidatePath(`/jobs/${jobId}/send`);
  redirect(sendUrl(jobId, "Approved report sent and recorded in delivery history.", "sent"));
}

export async function sendContractForSignature(formData: FormData) {
  const jobId = String(formData.get("jobId") ?? "");
  const documentVersionId = String(formData.get("documentVersionId") ?? "");
  const selectedSigner = parseSigner(formData.get("signer"));
  const signerNameOverride = String(formData.get("signerName") ?? "").trim();
  const signerEmailOverride = String(formData.get("signerEmail") ?? "").trim().toLowerCase();
  if (!jobId || !documentVersionId) redirect("/jobs");
  if (!isZohoSignConfigured()) {
    redirect(signatureUrl(jobId, "Zoho Sign is not configured.", "error"));
  }

  const signer = {
    contactId: selectedSigner?.contactId ?? null,
    name: signerNameOverride || selectedSigner?.name || signerEmailOverride,
    email: signerEmailOverride || selectedSigner?.email || "",
  };
  if (!signer.email || !signer.email.includes("@")) {
    redirect(signatureUrl(jobId, "Select or enter a valid signer email.", "error"));
  }
  if (!signer.name) signer.name = signer.email;

  const { supabase, organization, user, membership } = await getCurrentContext();
  if (!canCreateJobs(membership.role)) redirect(`/jobs/${jobId}`);

  let documentFile: Awaited<ReturnType<typeof loadSignatureDocument>>;
  try {
    documentFile = await loadSignatureDocument(supabase, organization.id, jobId, documentVersionId);
  } catch (error) {
    redirect(signatureUrl(jobId, error instanceof Error ? error.message : "Unable to load the contract PDF.", "error"));
  }

  const requestName = `${documentFile.title} v${documentFile.version} - ${signer.name}`;
  const { data: signatureRequest, error: insertError } = await supabase
    .from("signature_requests")
    .insert({
      organization_id: organization.id,
      inspection_job_id: jobId,
      document_version_id: documentVersionId,
      contact_id: signer.contactId,
      signer_name: signer.name,
      signer_email: signer.email,
      status: "sending",
      request_name: requestName,
      created_by: user.id,
    })
    .select("id")
    .single();
  if (insertError || !signatureRequest) {
    redirect(signatureUrl(jobId, insertError?.message ?? "Unable to record the signature request.", "error"));
  }

  let successMessage: string | null = null;
  let submissionFailure: string | null = null;
  try {
    const result = await sendZohoSignDocument({
      filename: documentFile.filename,
      pdfBytes: documentFile.bytes,
      requestName,
      signerName: signer.name,
      signerEmail: signer.email,
      notes: "Please review and sign the attached work authorization.",
    });
    const nextStatus = result.submitted
      ? normalizeZohoSignStatus(result.providerStatus)
      : "failed";
    await supabase
      .from("signature_requests")
      .update({
        status: nextStatus,
        provider_request_id: result.requestId,
        provider_action_id: result.actionId,
        provider_document_id: result.documentId,
        provider_status: result.providerStatus,
        failure_message: result.submissionError,
        sent_at: result.submitted ? new Date().toISOString() : null,
        last_status_checked_at: new Date().toISOString(),
      })
      .eq("id", signatureRequest.id)
      .eq("organization_id", organization.id);
    await recordSignatureEvent({
      supabase,
      organizationId: organization.id,
      userId: user.id,
      signatureRequestId: signatureRequest.id,
      eventType: result.submitted ? "zoho_sign_sent" : "zoho_sign_submission_failed",
      providerStatus: result.providerStatus,
      summary: result.submitted
        ? `Contract sent for signature to ${signer.email}.`
        : `Zoho Sign draft created, but submission failed for ${signer.email}.`,
      payload: result.raw,
    });
    await supabase.from("audit_events").insert({
      organization_id: organization.id,
      actor_user_id: user.id,
      action: result.submitted ? "contract_signature_sent" : "contract_signature_failed",
      entity_type: "signature_request",
      entity_id: signatureRequest.id,
      summary: result.submitted
        ? `Contract signature request sent to ${signer.email}.`
        : `Contract signature request failed for ${signer.email}.`,
      changes: {
        documentVersionId,
        signerEmail: signer.email,
        providerRequestId: result.requestId,
        providerStatus: result.providerStatus,
      },
    });

    revalidatePath(`/jobs/${jobId}/send`);
    if (result.submitted) {
      successMessage = "Contract sent through Zoho Sign.";
    } else {
      submissionFailure = result.submissionError || "Zoho Sign created a draft but could not send it.";
    }
  } catch (error) {
    const failure = error instanceof Error ? error.message : "Zoho Sign request failed.";
    await supabase
      .from("signature_requests")
      .update({
        status: "failed",
        failure_message: failure,
        last_status_checked_at: new Date().toISOString(),
      })
      .eq("id", signatureRequest.id)
      .eq("organization_id", organization.id);
    await recordSignatureEvent({
      supabase,
      organizationId: organization.id,
      userId: user.id,
      signatureRequestId: signatureRequest.id,
      eventType: "zoho_sign_failed",
      providerStatus: null,
      summary: failure,
    });
    revalidatePath(`/jobs/${jobId}/send`);
    redirect(signatureUrl(jobId, failure, "error"));
  }
  if (successMessage) {
    redirect(signatureUrl(jobId, successMessage, "sent"));
  }
  redirect(signatureUrl(jobId, submissionFailure || "Zoho Sign created a draft but could not send it.", "error"));
}

export async function refreshSignatureRequestStatus(formData: FormData) {
  const jobId = String(formData.get("jobId") ?? "");
  const signatureRequestId = String(formData.get("signatureRequestId") ?? "");
  if (!jobId || !signatureRequestId) redirect("/jobs");
  if (!isZohoSignConfigured()) {
    redirect(signatureUrl(jobId, "Zoho Sign is not configured.", "error"));
  }

  const { supabase, organization, user, membership } = await getCurrentContext();
  if (!canCreateJobs(membership.role)) redirect(`/jobs/${jobId}`);

  const { data: signatureRequest, error } = await supabase
    .from("signature_requests")
    .select("id, provider_request_id")
    .eq("id", signatureRequestId)
    .eq("organization_id", organization.id)
    .eq("inspection_job_id", jobId)
    .single();
  if (error || !signatureRequest?.provider_request_id) {
    redirect(signatureUrl(jobId, error?.message ?? "Zoho Sign request id is missing.", "error"));
  }

  let refreshMessage: string | null = null;
  try {
    const result = await getZohoSignRequestStatus(signatureRequest.provider_request_id);
    const nextStatus = normalizeZohoSignStatus(result.providerStatus, result.actionStatus);
    const completedAt = nextStatus === "completed"
      ? result.completedAt || new Date().toISOString()
      : null;
    await supabase
      .from("signature_requests")
      .update({
        status: nextStatus,
        provider_action_id: result.actionId,
        provider_status: result.actionStatus || result.providerStatus,
        completed_at: completedAt,
        last_status_checked_at: new Date().toISOString(),
        failure_message: null,
      })
      .eq("id", signatureRequestId)
      .eq("organization_id", organization.id);
    await recordSignatureEvent({
      supabase,
      organizationId: organization.id,
      userId: user.id,
      signatureRequestId,
      eventType: "zoho_sign_status_refreshed",
      providerStatus: result.actionStatus || result.providerStatus,
      summary: `Zoho Sign status refreshed: ${nextStatus}.`,
      payload: result.raw,
    });
    revalidatePath(`/jobs/${jobId}/send`);
    refreshMessage = `Zoho Sign status refreshed: ${nextStatus}.`;
  } catch (statusError) {
    const failure = statusError instanceof Error ? statusError.message : "Unable to refresh Zoho Sign status.";
    await supabase
      .from("signature_requests")
      .update({
        failure_message: failure,
        last_status_checked_at: new Date().toISOString(),
      })
      .eq("id", signatureRequestId)
      .eq("organization_id", organization.id);
    revalidatePath(`/jobs/${jobId}/send`);
    redirect(signatureUrl(jobId, failure, "error"));
  }
  redirect(signatureUrl(jobId, refreshMessage || "Zoho Sign status refreshed.", "saved"));
}
