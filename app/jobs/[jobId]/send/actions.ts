"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getCurrentContext } from "@/lib/current-organization";

type RecipientInput = {
  contactId: string;
  email: string;
  name: string;
  type: "to" | "cc" | "bcc";
};

function sendUrl(jobId: string, message: string, kind: "saved" | "sent" | "error") {
  return `/jobs/${jobId}/send?${kind}=${encodeURIComponent(message)}`;
}

export async function prepareReportDelivery(formData: FormData) {
  const jobId = String(formData.get("jobId") ?? "");
  const versionId = String(formData.get("versionId") ?? "");
  const subject = String(formData.get("subject") ?? "").trim();
  const message = String(formData.get("message") ?? "").trim();
  const intent = String(formData.get("intent") ?? "draft");
  const recipients = formData.getAll("recipient").flatMap((value) => {
    try {
      return [JSON.parse(String(value)) as RecipientInput];
    } catch {
      return [];
    }
  });
  if (!jobId || !versionId) redirect("/jobs");
  if (!subject || !message) redirect(sendUrl(jobId, "Enter an email subject and message.", "error"));
  if (!recipients.length) redirect(sendUrl(jobId, "Select at least one recipient.", "error"));

  const { supabase, organization, user } = await getCurrentContext();
  const { data: deliveryId, error } = await supabase.rpc("create_report_delivery_draft", {
    target_organization_id: organization.id,
    target_job_id: jobId,
    target_version_id: versionId,
    email_subject: subject,
    email_message: message,
    recipient_items: recipients,
  });
  if (error || !deliveryId) {
    redirect(sendUrl(jobId, error?.message ?? "Unable to create the delivery.", "error"));
  }

  if (intent === "send") {
    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.REPORT_EMAIL_FROM;
    if (!apiKey || !from) {
      redirect(sendUrl(jobId, "Delivery draft saved. Configure RESEND_API_KEY and REPORT_EMAIL_FROM before sending.", "error"));
    }

    const { data: version } = await supabase
      .from("document_versions")
      .select("version, assets(provider_file_id, original_filename)")
      .eq("id", versionId)
      .single();
    const asset = Array.isArray(version?.assets) ? version.assets[0] : version?.assets;
    if (!asset?.provider_file_id) {
      redirect(sendUrl(jobId, "The approved PDF file could not be found.", "error"));
    }

    await supabase
      .from("deliveries")
      .update({ status: "sending", queued_at: new Date().toISOString(), sent_by: user.id, provider: "resend" })
      .eq("id", deliveryId);

    try {
      const { data: pdf, error: downloadError } = await supabase.storage
        .from("report-pdfs")
        .download(asset.provider_file_id);
      if (downloadError || !pdf) throw downloadError ?? new Error("Unable to download the PDF.");

      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from,
          to: recipients.filter((recipient) => recipient.type === "to").map((recipient) => recipient.email),
          cc: recipients.filter((recipient) => recipient.type === "cc").map((recipient) => recipient.email),
          bcc: recipients.filter((recipient) => recipient.type === "bcc").map((recipient) => recipient.email),
          subject,
          text: message,
          attachments: [{
            filename: asset.original_filename,
            content: Buffer.from(await pdf.arrayBuffer()).toString("base64"),
          }],
        }),
      });
      const result = await response.json() as { id?: string; message?: string };
      if (!response.ok || !result.id) throw new Error(result.message ?? "Email provider rejected the delivery.");

      await supabase
        .from("deliveries")
        .update({
          status: "sent",
          provider_message_id: result.id,
          sent_at: new Date().toISOString(),
          failure_message: null,
        })
        .eq("id", deliveryId);
      await supabase.from("audit_events").insert({
        organization_id: organization.id,
        actor_user_id: user.id,
        action: "report_sent",
        entity_type: "delivery",
        entity_id: deliveryId,
        summary: `Inspection report version ${version?.version} sent.`,
        changes: { recipients: recipients.map((recipient) => recipient.email), providerMessageId: result.id },
      });
    } catch (sendError) {
      const failure = sendError instanceof Error ? sendError.message : "Report delivery failed.";
      await supabase
        .from("deliveries")
        .update({ status: "failed", failure_message: failure })
        .eq("id", deliveryId);
      redirect(sendUrl(jobId, failure, "error"));
    }

    revalidatePath(`/jobs/${jobId}/send`);
    redirect(sendUrl(jobId, "Approved report sent and recorded in delivery history.", "sent"));
  }

  revalidatePath(`/jobs/${jobId}/send`);
  redirect(sendUrl(jobId, "Delivery draft saved.", "saved"));
}
