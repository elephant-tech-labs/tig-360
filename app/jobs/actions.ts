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
  const county = String(formData.get("county") ?? "").trim();
  const propertyType = String(formData.get("propertyType") ?? "").trim();
  const reportType = String(formData.get("reportType") ?? "complete");
  const inspectionAt = String(formData.get("inspectionAt") ?? "").trim();
  const priorJobId = String(formData.get("priorJobId") ?? "").trim();
  const generalDescription = String(formData.get("generalDescription") ?? "").trim();
  const escrowNumber = String(formData.get("escrowNumber") ?? "").trim();
  const inspectionTagPosted = String(formData.get("inspectionTagPosted") ?? "").trim();
  const otherTagsPosted = String(formData.get("otherTagsPosted") ?? "").trim();
  const garageDescription = String(formData.get("garageDescription") ?? "").trim();
  const inspectedById = String(formData.get("inspectedById") ?? "").trim();
  const includeInspectorSignature = formData.get("includeInspectorSignature") === "on";

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
    prior_inspection_job_id: priorJobId || null,
    job_general_description: generalDescription || null,
    job_escrow_number: escrowNumber || null,
    property_county: county || null,
    job_inspected_by_id: inspectedById || null,
    job_include_inspector_signature: includeInspectorSignature,
  });

  if (error) redirect(`/jobs/new?error=${encodeURIComponent(error.message)}`);
  const { error: reportFieldsError } = await supabase
    .from("inspection_jobs")
    .update({
      inspection_tag_posted: inspectionTagPosted || null,
      other_tags_posted: otherTagsPosted || null,
      garage_description: garageDescription || null,
    })
    .eq("id", data)
    .eq("organization_id", organizationId);
  if (reportFieldsError) redirect(`/jobs/${data}/edit?error=${encodeURIComponent(reportFieldsError.message)}`);
  redirect(`/jobs/${data}`);
}

export async function updateInspectionJob(formData: FormData) {
  const organizationId = String(formData.get("organizationId") ?? "");
  const jobId = String(formData.get("jobId") ?? "");
  const streetLine1 = String(formData.get("streetLine1") ?? "").trim();
  const streetLine2 = String(formData.get("streetLine2") ?? "").trim();
  const city = String(formData.get("city") ?? "").trim();
  const region = String(formData.get("region") ?? "").trim().toUpperCase();
  const postalCode = String(formData.get("postalCode") ?? "").trim();
  const county = String(formData.get("county") ?? "").trim();
  const propertyType = String(formData.get("propertyType") ?? "").trim();
  const reportType = String(formData.get("reportType") ?? "complete");
  const inspectionAt = String(formData.get("inspectionAt") ?? "").trim();
  const priorJobId = String(formData.get("priorJobId") ?? "").trim();
  const internalNotes = String(formData.get("internalNotes") ?? "").trim();
  const generalDescription = String(formData.get("generalDescription") ?? "").trim();
  const escrowNumber = String(formData.get("escrowNumber") ?? "").trim();
  const inspectionTagPosted = String(formData.get("inspectionTagPosted") ?? "").trim();
  const otherTagsPosted = String(formData.get("otherTagsPosted") ?? "").trim();
  const garageDescription = String(formData.get("garageDescription") ?? "").trim();
  const inspectedById = String(formData.get("inspectedById") ?? "").trim();
  const includeInspectorSignature = formData.get("includeInspectorSignature") === "on";

  if (!organizationId || !jobId || !streetLine1 || !city || !region || !postalCode) {
    redirect(`/jobs/${jobId}/edit?error=Complete%20the%20required%20property%20fields.`);
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("update_inspection_job", {
    target_organization_id: organizationId,
    target_job_id: jobId,
    property_street_line_1: streetLine1,
    property_street_line_2: streetLine2 || null,
    property_city: city,
    property_region: region,
    property_postal_code: postalCode,
    property_type_name: propertyType || null,
    inspection_report_type: reportType,
    inspection_date: inspectionAt ? new Date(inspectionAt).toISOString() : null,
    prior_inspection_job_id: priorJobId || null,
    job_internal_notes: internalNotes || null,
    job_general_description: generalDescription || null,
    job_escrow_number: escrowNumber || null,
    property_county: county || null,
    job_inspected_by_id: inspectedById || null,
    job_include_inspector_signature: includeInspectorSignature,
  });

  if (error) redirect(`/jobs/${jobId}/edit?error=${encodeURIComponent(error.message)}`);
  const { error: reportFieldsError } = await supabase
    .from("inspection_jobs")
    .update({
      inspection_tag_posted: inspectionTagPosted || null,
      other_tags_posted: otherTagsPosted || null,
      garage_description: garageDescription || null,
    })
    .eq("id", jobId)
    .eq("organization_id", organizationId);
  if (reportFieldsError) redirect(`/jobs/${jobId}/edit?error=${encodeURIComponent(reportFieldsError.message)}`);
  redirect(`/jobs/${jobId}?updated=1`);
}
