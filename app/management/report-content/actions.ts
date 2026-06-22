"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

function clean(formData: FormData, name: string) {
  return String(formData.get(name) ?? "").trim();
}

function contentUrl(message: string, kind: "saved" | "error" = "saved") {
  return `/management/report-content?${kind}=${encodeURIComponent(message)}`;
}

export async function saveReportContentBlock(formData: FormData) {
  const organizationId = clean(formData, "organizationId");
  const blockId = clean(formData, "blockId");
  const title = clean(formData, "title");
  const body = clean(formData, "body");
  if (!organizationId || !title || !body) {
    redirect(contentUrl("Title and content are required.", "error"));
  }
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const values = {
    organization_id: organizationId,
    title,
    body,
    placement: clean(formData, "placement") || "before_findings",
    sort_order: Number(clean(formData, "sortOrder") || 0),
    is_active: formData.get("isActive") === "on",
    is_required: formData.get("isRequired") === "on",
    report_types: formData.getAll("reportType").map(String),
    effective_from: clean(formData, "effectiveFrom") || null,
    updated_by: user?.id ?? null,
  };
  const result = blockId
    ? await supabase.from("report_content_blocks").update({
        ...values,
        version: Number(clean(formData, "currentVersion") || 1) + 1,
      }).eq("id", blockId).eq("organization_id", organizationId)
    : await supabase.from("report_content_blocks").insert(values);
  if (result.error) redirect(contentUrl(result.error.message, "error"));
  revalidatePath("/management/report-content");
  redirect(contentUrl(blockId ? "Report content updated. Future reports will use the new version." : "Report content added."));
}

export async function deleteReportContentBlock(formData: FormData) {
  const organizationId = clean(formData, "organizationId");
  const blockId = clean(formData, "blockId");
  const supabase = await createClient();
  const { error } = await supabase
    .from("report_content_blocks")
    .delete()
    .eq("id", blockId)
    .eq("organization_id", organizationId);
  if (error) redirect(contentUrl(error.message, "error"));
  revalidatePath("/management/report-content");
  redirect(contentUrl("Report content removed."));
}
