"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function createInspectionJob(formData: FormData) {
  const organizationId = String(formData.get("organizationId") ?? "");
  const buildingNumber = String(formData.get("buildingNumber") ?? "").trim();
  const streetName = String(formData.get("streetName") ?? "").trim();
  const unitOrSuite = String(formData.get("unitOrSuite") ?? "").trim();
  const city = String(formData.get("city") ?? "").trim();
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
  const wdoFilingRequirement = String(formData.get("wdoFilingRequirement") ?? "required");
  const wdoExclusionReason = String(formData.get("wdoExclusionReason") ?? "").trim();
  const wdoExclusionNotes = String(formData.get("wdoExclusionNotes") ?? "").trim();

  if (!organizationId || !buildingNumber || !streetName || !city || !/^(\d{5}|\d{9})$/.test(postalCode)) {
    redirect("/jobs/new?error=Complete%20the%20required%20property%20fields.");
  }
  if (!['required', 'not_required'].includes(wdoFilingRequirement)
    || (wdoFilingRequirement === 'not_required' && !wdoExclusionReason)
    || (wdoExclusionReason === 'other_non_reportable' && !wdoExclusionNotes)) {
    redirect("/jobs/new?error=Complete%20the%20California%20WDO%20filing%20decision.");
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_california_inspection_job", {
    target_organization_id: organizationId,
    property_building_number: buildingNumber,
    property_street_name: streetName,
    property_unit_or_suite: unitOrSuite || null,
    property_city: city,
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
    job_wdo_filing_requirement: wdoFilingRequirement,
    job_wdo_exclusion_reason: wdoExclusionReason || null,
    job_wdo_exclusion_notes: wdoExclusionNotes || null,
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
  const buildingNumber = String(formData.get("buildingNumber") ?? "").trim();
  const streetName = String(formData.get("streetName") ?? "").trim();
  const unitOrSuite = String(formData.get("unitOrSuite") ?? "").trim();
  const city = String(formData.get("city") ?? "").trim();
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
  const wdoFilingRequirement = String(formData.get("wdoFilingRequirement") ?? "required");
  const wdoExclusionReason = String(formData.get("wdoExclusionReason") ?? "").trim();
  const wdoExclusionNotes = String(formData.get("wdoExclusionNotes") ?? "").trim();

  if (!['required', 'not_required'].includes(wdoFilingRequirement)
    || (wdoFilingRequirement === 'not_required' && !wdoExclusionReason)
    || (wdoExclusionReason === 'other_non_reportable' && !wdoExclusionNotes)) {
    redirect(`/jobs/${jobId}/edit?error=Complete%20the%20California%20WDO%20filing%20decision.`);
  }

  const supabase = await createClient();
  const addressReady = Boolean(buildingNumber && streetName && city && /^(\d{5}|\d{9})$/.test(postalCode));
  if (!organizationId || !jobId || (wdoFilingRequirement === "required" && !addressReady)) {
    redirect(`/jobs/${jobId}/edit?error=Complete%20the%20required%20property%20fields.`);
  }
  const { data: existingJob, error: existingJobError } = await supabase
    .from("inspection_jobs")
    .select("wdo_filing_requirement")
    .eq("organization_id", organizationId)
    .eq("id", jobId)
    .single();
  if (existingJobError) redirect(`/jobs/${jobId}/edit?error=${encodeURIComponent(existingJobError.message)}`);
  if (wdoFilingRequirement === "not_required"
    && (existingJob.wdo_filing_requirement !== "not_required" || !addressReady)) {
    const { error: requirementError } = await supabase.rpc("set_inspection_job_wdo_requirement", {
      target_organization_id: organizationId,
      target_job_id: jobId,
      job_wdo_filing_requirement: wdoFilingRequirement,
      job_wdo_exclusion_reason: wdoExclusionReason,
      job_wdo_exclusion_notes: wdoExclusionNotes || null,
    });
    if (requirementError) redirect(`/jobs/${jobId}/edit?error=${encodeURIComponent(requirementError.message)}`);
    redirect(`/jobs/${jobId}?updated=1`);
  }
  const { error } = await supabase.rpc("update_california_inspection_job", {
    target_organization_id: organizationId,
    target_job_id: jobId,
    property_building_number: buildingNumber,
    property_street_name: streetName,
    property_unit_or_suite: unitOrSuite || null,
    property_city: city,
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
    job_wdo_filing_requirement: wdoFilingRequirement,
    job_wdo_exclusion_reason: wdoExclusionReason || null,
    job_wdo_exclusion_notes: wdoExclusionNotes || null,
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
