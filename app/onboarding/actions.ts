"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export async function createOrganization(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const slug = slugify(String(formData.get("slug") ?? name));

  if (!name || !slug) {
    redirect("/onboarding?error=Enter%20an%20organization%20name.");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("create_organization", {
    organization_name: name,
    organization_slug: slug,
  });

  if (error) {
    redirect(`/onboarding?error=${encodeURIComponent(error.message)}`);
  }

  redirect("/jobs");
}
