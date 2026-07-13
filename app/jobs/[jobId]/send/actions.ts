"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { PDFDocument } from "pdf-lib";
import { canCreateJobs } from "@/lib/access";
import { getEmailProvider, type EmailAttachment } from "@/lib/email";
import { getCurrentContext } from "@/lib/current-organization";
import { logReportDeliveryInZoho } from "@/lib/crm/zoho";
import { createReviewToken, customerReviewUrl, hashReviewToken } from "@/lib/proposals/review-links";
import { loadProposalSnapshot } from "@/lib/proposals/load-proposal-snapshot";
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

function appOrigin() {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`.replace(/\/$/, "");
  return "http://localhost:3000";
}

function proposalSnapshotHash(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const hash = (value as { contentHash?: unknown }).contentHash;
  return typeof hash === "string" && hash ? hash : null;
}

async function assertCurrentProposalSnapshot(
  supabase: Awaited<ReturnType<typeof getCurrentContext>>["supabase"],
  organization: { id: string; name: string },
  jobId: string,
  versionSnapshot: unknown,
) {
  const { data: proposal, error } = await supabase
    .from("job_proposals")
    .select("id, status")
    .eq("inspection_job_id", jobId)
    .eq("organization_id", organization.id)
    .maybeSingle();
  if (error || !proposal) {
    throw new Error(error?.message ?? "The work authorization could not be found.");
  }
  if (proposal.status !== "approved") {
    throw new Error("Approve the current work authorization before delivering it.");
  }

  const currentSnapshot = await loadProposalSnapshot(supabase, organization, jobId, proposal.id);
  const versionHash = proposalSnapshotHash(versionSnapshot);
  if (!versionHash || versionHash !== currentSnapshot.contentHash) {
    throw new Error(
      "The work authorization changed after this PDF was generated. Approve and generate a current PDF before delivering it.",
    );
  }
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
      id, version, status, approval_status, snapshot,
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
  if (version.approval_status !== "approved") {
    throw new Error("Approve the current work authorization before sending it for signature.");
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
    snapshot: version.snapshot,
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
  organization: { id: string; name: string },
) {
  const versionIds = [versionId, ...supportingVersionIds];
  const { data: deliveryVersions, error } = await supabase
    .from("document_versions")
    .select(`
      id, version, status, approval_status, snapshot,
      assets(provider_file_id, original_filename, content_type),
      documents!inner(kind, inspection_job_id)
    `)
    .in("id", versionIds)
    .eq("documents.inspection_job_id", jobId);
  if (error || !deliveryVersions?.length) {
    throw new Error(error?.message ?? "The selected PDF files could not be found.");
  }

  const versionFiles = new Map(deliveryVersions.map((version) => {
    const asset = Array.isArray(version.assets) ? version.assets[0] : version.assets;
    const document = Array.isArray(version.documents) ? version.documents[0] : version.documents;
    return [version.id, {
      path: asset?.provider_file_id ?? "",
      filename: asset?.original_filename ?? `document-v${version.version}.pdf`,
      contentType: asset?.content_type ?? "application/pdf",
      version: version.version,
      status: version.status,
      approvalStatus: version.approval_status,
      kind: document?.kind ?? "",
      snapshot: version.snapshot,
    }];
  }));
  const reportFile = versionFiles.get(versionId);
  if (!reportFile?.path) throw new Error("The approved PDF file could not be found.");
  if (reportFile.status !== "ready" || reportFile.approvalStatus !== "approved" || reportFile.kind !== "inspection_report") {
    throw new Error("Only the current approved inspection report can be delivered.");
  }

  for (const supportingVersionId of supportingVersionIds) {
    const supportingFile = versionFiles.get(supportingVersionId);
    if (!supportingFile || supportingFile.status !== "ready" || supportingFile.approvalStatus !== "approved") {
      throw new Error("Only an approved supporting document can be delivered.");
    }
    if (!["contract", "proposal"].includes(supportingFile.kind)) {
      throw new Error("The selected supporting document is not a work authorization.");
    }
    await assertCurrentProposalSnapshot(supabase, organization, jobId, supportingFile.snapshot);
  }

  const { data: currentReportVersion, error: currentReportError } = await supabase
    .from("document_versions")
    .select("id, documents!inner(kind, inspection_job_id)")
    .eq("organization_id", organization.id)
    .eq("status", "ready")
    .eq("approval_status", "approved")
    .eq("documents.kind", "inspection_report")
    .eq("documents.inspection_job_id", jobId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (currentReportError || !currentReportVersion || currentReportVersion.id !== versionId) {
    throw new Error("The inspection report has a newer approved version. Use the current report before delivering it.");
  }

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
      organization,
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

export async function sendCustomerReviewPackage(formData: FormData) {
  const jobId = String(formData.get("jobId") ?? "");
  const reportVersionId = String(formData.get("reportVersionId") ?? "");
  const proposalVersionId = String(formData.get("proposalVersionId") ?? "");
  const selectedSigner = parseSigner(formData.get("signer"));
  const signerNameOverride = String(formData.get("signerName") ?? "").trim();
  const signerEmailOverride = String(formData.get("signerEmail") ?? "").trim().toLowerCase();
  if (!jobId || !reportVersionId || !proposalVersionId) redirect("/jobs");

  const signer = {
    contactId: selectedSigner?.contactId ?? null,
    name: signerNameOverride || selectedSigner?.name || signerEmailOverride,
    email: signerEmailOverride || selectedSigner?.email || "",
  };
  if (!signer.email || !signer.email.includes("@")) {
    redirect(sendUrl(jobId, "Select or enter a valid customer email for the review package.", "error"));
  }
  if (!signer.name) signer.name = signer.email;

  const { supabase, organization, user, membership } = await getCurrentContext();
  if (!canCreateJobs(membership.role)) redirect(`/jobs/${jobId}`);

  const [{ data: proposal }, { data: job }, { data: proposalVersion }] = await Promise.all([
    supabase
      .from("job_proposals")
      .select("id, status, customer_summary")
      .eq("inspection_job_id", jobId)
      .eq("organization_id", organization.id)
      .maybeSingle(),
    supabase
      .from("inspection_jobs")
      .select("job_number, properties(street_line_1, city, region, postal_code)")
      .eq("id", jobId)
      .eq("organization_id", organization.id)
      .single(),
    supabase
      .from("document_versions")
      .select("id, status, approval_status, snapshot, documents!inner(kind, inspection_job_id)")
      .eq("id", proposalVersionId)
      .eq("organization_id", organization.id)
      .eq("documents.inspection_job_id", jobId)
      .single(),
  ]);
  const document = proposalVersion
    ? Array.isArray(proposalVersion.documents) ? proposalVersion.documents[0] : proposalVersion.documents
    : null;
  if (!proposal?.id || !job || !proposalVersion || !document || !["proposal", "contract"].includes(document.kind)) {
    redirect(sendUrl(jobId, "Generate a proposal/work authorization PDF before sending a customer review package.", "error"));
  }
  if (proposalVersion.status !== "ready") {
    redirect(sendUrl(jobId, "The selected proposal PDF is not ready yet.", "error"));
  }
  if (proposal.status !== "approved" || proposalVersion.approval_status !== "approved") {
    redirect(sendUrl(jobId, "Approve the current work authorization before sending the review package.", "error"));
  }
  try {
    await assertCurrentProposalSnapshot(supabase, organization, jobId, proposalVersion.snapshot);
  } catch (snapshotError) {
    redirect(sendUrl(
      jobId,
      snapshotError instanceof Error ? snapshotError.message : "Unable to verify the current work authorization.",
      "error",
    ));
  }

  let provider;
  try {
    provider = getEmailProvider();
  } catch (providerError) {
    redirect(sendUrl(
      jobId,
      providerError instanceof Error ? providerError.message : "Email delivery is not configured.",
      "error",
    ));
  }

  const token = createReviewToken();
  const reviewUrl = customerReviewUrl(token);
  const property = Array.isArray(job.properties) ? job.properties[0] : job.properties;
  const propertyLabel = [
    property?.street_line_1,
    property?.city,
    [property?.region, property?.postal_code].filter(Boolean).join(" "),
  ].filter(Boolean).join(", ");
  const subject = `Your termite inspection report and recommended next steps`;
  const message = [
    `Hello ${signer.name},`,
    "",
    `Thank you for choosing ${organization.name}. Your termite inspection report is attached, along with an easy-to-review proposal/work authorization document.`,
    "",
    proposal.customer_summary
      ? `We also prepared a plain-English review page that summarizes the recommended next steps and lets you open the electronic authorization when you are ready:`
      : `We also prepared a review page that lets you read the documents and open the electronic authorization when you are ready:`,
    reviewUrl,
    "",
    "There is no pressure to sign before you have reviewed the documents. If anything is unclear, reply to this email and our team will help walk through it.",
    "",
    "Regards,",
    organization.name,
  ].join("\n");

  const { data: savedDeliveryId, error: deliveryError } = await supabase.rpc("save_report_delivery_v3", {
    target_organization_id: organization.id,
    target_job_id: jobId,
    target_version_id: reportVersionId,
    target_delivery_id: null,
    email_subject: subject,
    email_message: message,
    email_reply_to: process.env.REPORT_EMAIL_FROM ?? null,
    recipient_items: [{
      contactId: signer.contactId,
      email: signer.email,
      name: signer.name,
      type: "to",
    }],
    delivery_package_mode: "separate_attachments",
    supporting_version_ids: [proposalVersionId],
    allow_empty_recipients: false,
  });
  if (deliveryError || !savedDeliveryId) {
    redirect(sendUrl(jobId, deliveryError?.message ?? "Unable to create customer review delivery.", "error"));
  }

  const { data: reviewLink, error: linkError } = await supabase
    .from("proposal_review_links")
    .insert({
      organization_id: organization.id,
      inspection_job_id: jobId,
      proposal_id: proposal.id,
      report_document_version_id: reportVersionId,
      proposal_document_version_id: proposalVersionId,
      contact_id: signer.contactId,
      delivery_id: savedDeliveryId,
      signer_name: signer.name,
      signer_email: signer.email,
      token_hash: hashReviewToken(token),
      created_by: user.id,
    })
    .select("id")
    .single();
  if (linkError || !reviewLink) {
    redirect(sendUrl(jobId, linkError?.message ?? "Unable to create the customer review link.", "error", savedDeliveryId));
  }

  const { data: attemptData, error: attemptError } = await supabase.rpc("begin_report_delivery_attempt", {
    target_organization_id: organization.id,
    target_delivery_id: savedDeliveryId,
    delivery_provider: provider.name,
  });
  if (attemptError || !attemptData) {
    redirect(sendUrl(jobId, attemptError?.message ?? "Unable to start the customer review delivery attempt.", "error", savedDeliveryId));
  }
  const attempt = attemptData as DeliveryAttempt;

  let result: Awaited<ReturnType<typeof provider.send>>;
  try {
    const packageFiles = await loadAttachments(
      supabase,
      reportVersionId,
      [proposalVersionId],
      "separate_attachments",
      jobId,
      organization,
    );
    result = await provider.send({
      to: [{ email: signer.email, name: signer.name }],
      cc: [],
      bcc: [],
      subject,
      text: message,
      replyTo: process.env.REPORT_EMAIL_FROM ?? null,
      attachments: packageFiles.attachments,
      idempotencyKey: attempt.idempotencyKey,
    });
  } catch (sendError) {
    const failure = sendError instanceof Error ? sendError.message : "Customer review email failed.";
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

  await supabase.rpc("complete_report_delivery_attempt", {
    target_organization_id: organization.id,
    target_delivery_id: savedDeliveryId,
    target_attempt_id: attempt.attemptId,
    attempt_status: "sent",
    provider_message: result.messageId,
    failure_text: null,
  });
  await supabase.from("audit_events").insert({
    organization_id: organization.id,
    actor_user_id: user.id,
    action: "customer_review_package_sent",
    entity_type: "proposal_review_link",
    entity_id: reviewLink.id,
    summary: `Customer review package sent to ${signer.email}.`,
    changes: {
      jobNumber: job.job_number,
      property: propertyLabel,
      reportVersionId,
      proposalVersionId,
      provider: result.provider,
      providerMessageId: result.messageId,
    },
  });

  revalidatePath(`/jobs/${jobId}/send`);
  redirect(sendUrl(jobId, "Customer review package sent with report, proposal, and review link.", "sent"));
}

export async function sendContractForSignature(formData: FormData) {
  return submitContractSignatureRequest(formData, "remote");
}

export async function startEmbeddedContractSigning(formData: FormData) {
  return submitContractSignatureRequest(formData, "embedded");
}

async function submitContractSignatureRequest(formData: FormData, mode: "remote" | "embedded") {
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
    await assertCurrentProposalSnapshot(supabase, organization, jobId, documentFile.snapshot);
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
  let embeddedRedirectUrl: string | null = null;
  try {
    const result = await sendZohoSignDocument({
      filename: documentFile.filename,
      pdfBytes: documentFile.bytes,
      requestName,
      signerName: signer.name,
      signerEmail: signer.email,
      notes: mode === "embedded"
        ? "Please review and sign the work authorization."
        : "Please review and sign the attached work authorization.",
      embedded: mode === "embedded",
      embeddedHost: mode === "embedded" ? appOrigin() : undefined,
    });
    const nextStatus = result.submitted
      ? normalizeZohoSignStatus(result.providerStatus)
      : "draft";
    const draftFailure = result.submissionError
      ? `${result.submissionError} The Zoho Sign request was created as a draft. Open Zoho Sign, find this request id, and send it manually, or upgrade the Zoho Sign license for API sending.`
      : null;
    await supabase
      .from("signature_requests")
      .update({
        status: nextStatus,
        provider_request_id: result.requestId,
        provider_action_id: result.actionId,
        provider_document_id: result.documentId,
        provider_status: result.providerStatus,
        failure_message: draftFailure,
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
      eventType: result.submitted ? "zoho_sign_sent" : "zoho_sign_draft_created",
      providerStatus: result.providerStatus,
      summary: result.submitted
        ? mode === "embedded"
          ? `Embedded contract signing opened for ${signer.email}.`
          : `Contract sent for signature to ${signer.email}.`
        : `Zoho Sign draft created for ${signer.email}.`,
      payload: result.raw,
    });
    await supabase.from("audit_events").insert({
      organization_id: organization.id,
      actor_user_id: user.id,
      action: result.submitted
        ? mode === "embedded" ? "contract_signature_embedded_started" : "contract_signature_sent"
        : "contract_signature_draft_created",
      entity_type: "signature_request",
      entity_id: signatureRequest.id,
      summary: result.submitted
        ? mode === "embedded"
          ? `Embedded contract signature request opened for ${signer.email}.`
          : `Contract signature request sent to ${signer.email}.`
        : `Contract signature request draft created for ${signer.email}.`,
      changes: {
        documentVersionId,
        signerEmail: signer.email,
        providerRequestId: result.requestId,
        providerStatus: result.providerStatus,
        mode,
      },
    });

    revalidatePath(`/jobs/${jobId}/send`);
    if (mode === "embedded" && result.submitted && result.embeddedSignUrl) {
      embeddedRedirectUrl = result.embeddedSignUrl;
    } else if (mode === "embedded" && result.submitted) {
      submissionFailure = "Zoho Sign created the embedded request but did not return a signing URL.";
    } else if (result.submitted) {
      successMessage = "Contract sent through Zoho Sign.";
    } else {
      submissionFailure = "Zoho Sign draft created. Open Zoho Sign to send it manually, or upgrade Zoho Sign for API sending.";
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
  if (embeddedRedirectUrl) {
    redirect(embeddedRedirectUrl);
  }
  if (successMessage) {
    redirect(signatureUrl(jobId, successMessage, "sent"));
  }
  redirect(signatureUrl(jobId, submissionFailure || "Zoho Sign draft created.", "saved"));
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
