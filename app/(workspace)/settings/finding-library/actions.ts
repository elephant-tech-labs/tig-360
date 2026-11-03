"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

function clean(formData: FormData, name: string) {
  return String(formData.get(name) ?? "").trim();
}

export async function saveFindingTemplate(formData: FormData) {
  const organizationId = clean(formData, "organizationId");
  const templateId = clean(formData, "templateId");
  const code = clean(formData, "templateCode");
  const findingText = clean(formData, "findingText");
  const recommendationText = clean(formData, "recommendationText");
  if (!organizationId || !code || (!findingText && !recommendationText)) {
    redirect("/settings/finding-library?error=Code%20and%20template%20wording%20are%20required.");
  }

  const supabase = await createClient();
  const payload = {
    organization_id: organizationId,
    template_code: code,
    title: clean(formData, "title") || null,
    area_code: clean(formData, "areaCode") ? Number(clean(formData, "areaCode")) : null,
    finding_text: findingText || null,
    recommendation_text: recommendationText || null,
    default_classification: clean(formData, "classification") || null,
    default_quote_price: clean(formData, "quotePrice") ? Number(clean(formData, "quotePrice")) : null,
    is_active: formData.get("isActive") === "on",
  };

  const result = templateId
    ? await supabase.from("finding_templates").update(payload).eq("id", templateId).eq("organization_id", organizationId)
    : await supabase.from("finding_templates").insert(payload);
  if (result.error) redirect(`/settings/finding-library?error=${encodeURIComponent(result.error.message)}`);

  revalidatePath("/settings/finding-library");
  redirect("/settings/finding-library?saved=1");
}
