"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { PDFDocument } from "pdf-lib";
import { getEmailProvider, type EmailAttachment } from "@/lib/email";
import { getCurrentContext } from "@/lib/current-organization";
import { logReportDeliveryInZoho } from "@/lib/crm/zoho";

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
