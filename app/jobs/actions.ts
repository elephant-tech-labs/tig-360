"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function createInspectionJob(formData: FormData) {
  const organizationId = String(formData.get("organizationId") ?? "");
  const streetLine1 = String(formData.get("streetLine1") ?? "").trim();
  const streetLine2 = String(formData.get("streetLine2") ?? "").trim();
  const city = String(formData.get("city") ?? "").trim();
  const region = String(formData.get("region") ?? "").trim().toUpperCase();
  const postalCode = String(formData.get("postalCode") ?? "").trim();
  const propertyType = String(formData.get("propertyType") ?? "").trim();
  const reportType = String(formData.get("reportType") ?? "complete");
  const inspectionAt = String(formData.get("inspectionAt") ?? "").trim();

  if (!organizationId || !streetLine1 || !city || !region || !postalCode) {
    redirect("/jobs/new?error=Complete%20the%20required%20property%20fields.");
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_inspection_job", {
    target_organization_id: organizationId,
    property_street_line_1: streetLine1,
    property_street_line_2: streetLine2 || null,
    property_city: city,
    property_region: region,
    property_postal_code: postalCode,
    property_type_name: propertyType || null,
    inspection_report_type: reportType,
    inspection_date: inspectionAt ? new Date(inspectionAt).toISOString() : null,
  });

  if (error) {
    redirect(`/jobs/new?error=${encodeURIComponent(error.message)}`);
  }

  redirect(`/jobs/${data}`);
}
