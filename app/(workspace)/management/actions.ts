"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentContext } from "@/lib/current-organization";
import { CALIFORNIA_WDO_FIELD_WIDTHS } from "@/lib/wdo/california/config";

function clean(formData: FormData, name: string) {
  return String(formData.get(name) ?? "").trim();
}

function managementUrl(message: string, kind: "saved" | "error" = "saved") {
  return `/management?${kind}=${encodeURIComponent(message)}`;
}

export async function saveCompanyProfile(formData: FormData) {
  const organizationId = clean(formData, "organizationId");
  const legalName = clean(formData, "legalName");
  const registrationNumber = clean(formData, "registrationNumber");
  if (!legalName || !registrationNumber) {
    redirect(managementUrl("Legal company name and SPCB Principal Registration are required.", "error"));
  }
  if (legalName.length > CALIFORNIA_WDO_FIELD_WIDTHS.companyName
    || registrationNumber.length > CALIFORNIA_WDO_FIELD_WIDTHS.registrationNumber
    || !/^[\x20-\x7E]+$/.test(legalName)
    || !/^[\x20-\x7E]+$/.test(registrationNumber)) {
    redirect(managementUrl("Company name or Principal Registration exceeds the WDO TXT format.", "error"));
  }
  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("organization_report_profiles")
    .select("logo_path")
    .eq("organization_id", organizationId)
    .maybeSingle();

  const logo = formData.get("logo");
  let logoPath: string | null = null;
  let logoFilename: string | null = null;
  if (logo instanceof File && logo.size > 0) {
    if (!["image/png", "image/jpeg", "image/webp"].includes(logo.type)) {
      redirect(managementUrl("Logo must be a PNG, JPEG, or WebP image.", "error"));
    }
    if (logo.size > 10 * 1024 * 1024) {
      redirect(managementUrl("Logo must be 10 MB or smaller.", "error"));
    }
    const extension = logo.name.split(".").pop()?.toLowerCase() || "png";
    logoPath = `${organizationId}/logo-${Date.now()}.${extension}`;
    logoFilename = logo.name;
    const { error: uploadError } = await supabase.storage
      .from("organization-branding")
      .upload(logoPath, logo, { contentType: logo.type, upsert: false });
    if (uploadError) redirect(managementUrl(uploadError.message, "error"));
  }

  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase
    .from("organization_report_profiles")
    .upsert({
      organization_id: organizationId,
      legal_name: legalName,
      street_line_1: clean(formData, "streetLine1") || null,
      street_line_2: clean(formData, "streetLine2") || null,
      city: clean(formData, "city") || null,
      region: clean(formData, "region").toUpperCase() || null,
      postal_code: clean(formData, "postalCode") || null,
      phone: clean(formData, "phone") || null,
      email: clean(formData, "email") || null,
      website: clean(formData, "website") || null,
      registration_number: registrationNumber,
      operator_license: clean(formData, "operatorLicense") || null,
      contractor_license: clean(formData, "contractorLicense") || null,
      regulatory_contact: clean(formData, "regulatoryContact") || null,
      logo_path: logoPath || existing?.logo_path || null,
      logo_filename: logoFilename || null,
      updated_by: user?.id ?? null,
    }, { onConflict: "organization_id" });

  if (error) {
    if (logoPath) await supabase.storage.from("organization-branding").remove([logoPath]);
    redirect(managementUrl(error.message, "error"));
  }
  if (logoPath && existing?.logo_path) {
    await supabase.storage.from("organization-branding").remove([existing.logo_path]);
  }
  revalidatePath("/management");
  revalidatePath("/jobs");
  redirect(managementUrl("Company report profile saved."));
}

export async function removeCompanyLogo(formData: FormData) {
  const organizationId = clean(formData, "organizationId");
  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("organization_report_profiles")
    .select("logo_path")
    .eq("organization_id", organizationId)
    .single();
  if (profile?.logo_path) {
    const { error } = await supabase.storage.from("organization-branding").remove([profile.logo_path]);
    if (error) redirect(managementUrl(error.message, "error"));
  }
  await supabase
    .from("organization_report_profiles")
    .update({ logo_path: null, logo_filename: null })
    .eq("organization_id", organizationId);
  revalidatePath("/management");
  redirect(managementUrl("Company logo removed."));
}

export async function saveWdoBranch(formData: FormData) {
  const organizationId = clean(formData, "organizationId");
  const branchId = clean(formData, "branchId");
  const branchName = clean(formData, "branchName");
  const registrationNumber = clean(formData, "branchRegistrationNumber");
  const { supabase, organization, membership, user } = await getCurrentContext();
  if (
    organization.id !== organizationId
    || !["administrator", "manager"].includes(membership.role)
  ) {
    redirect(managementUrl("Administrator or manager access required.", "error"));
  }
  if (!branchName) redirect(managementUrl("Branch name is required.", "error"));

  const values = {
    organization_id: organizationId,
    name: branchName,
    registration_number: registrationNumber || null,
    is_active: formData.get("isActive") === "on",
    updated_by: user.id,
  };
  const { error } = branchId
    ? await supabase
        .from("wdo_branches")
        .update(values)
        .eq("organization_id", organizationId)
        .eq("id", branchId)
    : await supabase
        .from("wdo_branches")
        .insert({ ...values, created_by: user.id });
  if (error) redirect(managementUrl(error.message, "error"));
  revalidatePath("/management");
  revalidatePath("/compliance/wdo");
  redirect(managementUrl(branchId ? "WDO branch updated." : "WDO branch added."));
}
