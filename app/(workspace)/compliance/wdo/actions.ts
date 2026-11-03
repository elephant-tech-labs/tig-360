"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { canAccessWdoCompliance } from "@/lib/access";
import { getCurrentContext } from "@/lib/current-organization";
import { mapCaliforniaWdoActivity } from "@/lib/wdo/california/mapper";
import {
  CALIFORNIA_WDO_SERIALIZER_VERSION,
} from "@/lib/wdo/california/config";
import {
  californiaWdoFilename,
  californiaWdoTxtChecksum,
} from "@/lib/wdo/california/txt-serializer";

function clean(formData: FormData, name: string) {
  return String(formData.get(name) ?? "").trim();
}

function wdoUrl(message: string, kind: "saved" | "error" = "saved") {
  return `/compliance/wdo?${kind}=${encodeURIComponent(message)}`;
}

function activityUrl(activityId: string, message: string, kind: "saved" | "error" = "saved") {
  return `/compliance/wdo/activities/${activityId}?${kind}=${encodeURIComponent(message)}`;
}

function batchUrl(batchId: string, message: string, kind: "saved" | "error" = "saved") {
  return `/compliance/wdo/batches/${batchId}?${kind}=${encodeURIComponent(message)}`;
}

async function requireWdoContext() {
  const context = await getCurrentContext();
  if (!canAccessWdoCompliance(context.membership.role)) redirect("/jobs");
  return context;
}

export async function reconcileWdoActivities() {
  const { supabase, organization } = await requireWdoContext();
  const { data, error } = await supabase.rpc("reconcile_wdo_inspection_activities", {
    target_organization_id: organization.id,
  });
  if (error) redirect(wdoUrl(error.message, "error"));

  const result = (data ?? {}) as {
    jobsExamined?: number;
    activitiesCreated?: number;
    alreadyExisting?: number;
    needsAttention?: number;
    skipped?: number;
  };
  revalidatePath("/compliance/wdo");
  redirect(wdoUrl(
    `Reconciliation complete: ${result.jobsExamined ?? 0} jobs examined, ${result.activitiesCreated ?? 0} activities created, ${result.alreadyExisting ?? 0} already present, ${result.needsAttention ?? 0} need attention, ${result.skipped ?? 0} skipped.`,
  ));
}

export async function createWdoActivity(formData: FormData) {
  const jobId = clean(formData, "jobId");
  const activityDate = clean(formData, "activityDate");
  const activityCode = Number(clean(formData, "activityCode"));
  const inspectorId = clean(formData, "inspectorId");
  const branchId = clean(formData, "branchId");
  if (!jobId || !activityDate || !Number.isInteger(activityCode) || !inspectorId) {
    redirect("/compliance/wdo/activities/new?error=Complete%20the%20required%20WDO%20activity%20fields.");
  }

  const { supabase, organization } = await requireWdoContext();
  const { data, error } = await supabase.rpc("create_wdo_activity", {
    target_organization_id: organization.id,
    target_job_id: jobId,
    regulatory_activity_date: activityDate,
    regulatory_activity_code: activityCode,
    regulatory_inspector_id: inspectorId,
    regulatory_branch_id: branchId || null,
  });
  if (error || !data) {
    redirect(`/compliance/wdo/activities/new?error=${encodeURIComponent(error?.message ?? "Unable to create WDO activity.")}`);
  }
  revalidatePath("/compliance/wdo");
  redirect(activityUrl(String(data), "WDO activity created. Review its regulatory representation before export."));
}

export async function updateWdoActivity(formData: FormData) {
  const activityId = clean(formData, "activityId");
  if (!activityId) redirect("/compliance/wdo");
  const activityDate = clean(formData, "activityDate");
  const activityCode = Number(clean(formData, "activityCode"));
  const inspectorId = clean(formData, "inspectorId");
  const branchId = clean(formData, "branchId");
  const useCanonicalAddress = formData.get("useCanonicalAddress") === "on";

  const { supabase, organization } = await requireWdoContext();
  const { error } = await supabase.rpc("update_wdo_activity", {
    target_organization_id: organization.id,
    target_activity_id: activityId,
    regulatory_activity_date: activityDate || null,
    regulatory_activity_code: activityCode,
    regulatory_inspector_id: inspectorId || null,
    regulatory_branch_id: branchId || null,
    regulatory_building_number: useCanonicalAddress ? null : clean(formData, "buildingNumber") || null,
    regulatory_street: useCanonicalAddress ? null : clean(formData, "street") || null,
    regulatory_city: useCanonicalAddress ? null : clean(formData, "city") || null,
    regulatory_zip_code: useCanonicalAddress ? null : clean(formData, "zipCode") || null,
  });
  if (error) redirect(activityUrl(activityId, error.message, "error"));
  revalidatePath("/compliance/wdo");
  revalidatePath(`/compliance/wdo/activities/${activityId}`);
  redirect(activityUrl(activityId, "WDO activity saved."));
}

export async function voidManualWdoActivity(formData: FormData) {
  const activityId = clean(formData, "activityId");
  const reason = clean(formData, "voidReason");
  if (!activityId || !reason) redirect(wdoUrl("A void reason is required.", "error"));
  const { supabase, organization } = await requireWdoContext();
  const { error } = await supabase.rpc("void_manual_wdo_activity", {
    target_organization_id: organization.id,
    target_activity_id: activityId,
    activity_void_reason: reason,
  });
  if (error) redirect(activityUrl(activityId, error.message, "error"));
  revalidatePath("/compliance/wdo");
  redirect(wdoUrl("WDO activity voided. Existing export history was retained."));
}

export async function generateWdoExport(formData: FormData) {
  const { supabase, organization } = await requireWdoContext();
  let selectedIds: string[] = [];
  try {
    const parsed = JSON.parse(clean(formData, "selectedActivityIds"));
    if (Array.isArray(parsed)) selectedIds = [...new Set(parsed.map(String))];
  } catch {
    selectedIds = [];
  }
  if (!selectedIds.length) redirect(wdoUrl("Select at least one ready WDO activity.", "error"));
  if (selectedIds.length > 5000) redirect(wdoUrl("Select no more than 5,000 WDO activities at once.", "error"));

  const [{ data: activities, error: activityError }, { data: profile, error: profileError }] = await Promise.all([
    supabase
      .from("wdo_activities")
      .select(`
        id, activity_date, activity_code, branch_id,
        override_building_number, override_street, override_city, override_zip_code,
        inspection_jobs(wdo_filing_requirement),
        properties(building_number, street_name, unit_or_suite, street_line_1, street_line_2, city, region, postal_code),
        inspectors(full_name, license_number),
        wdo_branches(name)
      `)
      .eq("organization_id", organization.id)
      .eq("status", "active")
      .in("id", selectedIds),
    supabase
      .from("organization_report_profiles")
      .select("legal_name, registration_number")
      .eq("organization_id", organization.id)
      .maybeSingle(),
  ]);
  if (activityError) redirect(wdoUrl(activityError.message, "error"));
  if (profileError) redirect(wdoUrl(profileError.message, "error"));
  if ((activities?.length ?? 0) !== selectedIds.length) {
    redirect(wdoUrl("One or more selected activities are no longer available.", "error"));
  }

  const activityById = new Map((activities ?? []).map((activity) => [activity.id, activity]));
  const mapped = selectedIds.map((activityId) => {
    const activity = activityById.get(activityId)!;
    const property = Array.isArray(activity.properties) ? activity.properties[0] : activity.properties;
    const job = Array.isArray(activity.inspection_jobs) ? activity.inspection_jobs[0] : activity.inspection_jobs;
    const inspector = Array.isArray(activity.inspectors) ? activity.inspectors[0] : activity.inspectors;
    const branch = Array.isArray(activity.wdo_branches) ? activity.wdo_branches[0] : activity.wdo_branches;
    return {
      activityId,
      excluded: Boolean(job && job.wdo_filing_requirement !== "required"),
      mapped: mapCaliforniaWdoActivity({
        activityId,
        activityDate: activity.activity_date,
        activityCode: activity.activity_code,
        branchId: activity.branch_id,
        branchName: branch?.name ?? null,
        companyName: profile?.legal_name ?? null,
        registrationNumber: profile?.registration_number ?? null,
        inspectorLicenseNumber: inspector?.license_number ?? null,
        inspectorName: inspector?.full_name ?? null,
        address: {
          buildingNumber: property?.building_number ?? null,
          streetName: property?.street_name ?? null,
          unitOrSuite: property?.unit_or_suite ?? null,
          streetLine1: property?.street_line_1 ?? null,
          streetLine2: property?.street_line_2 ?? null,
          city: property?.city ?? null,
          region: property?.region ?? null,
          zipCode: property?.postal_code ?? null,
          overrideBuildingNumber: activity.override_building_number,
          overrideStreet: activity.override_street,
          overrideCity: activity.override_city,
          overrideZipCode: activity.override_zip_code,
        },
        links: {
          activity: `/compliance/wdo/activities/${activityId}`,
          inspector: "/team/inspectors",
          companySettings: "/management",
        },
      }),
    };
  });
  if (mapped.some((item) => item.excluded)) {
    redirect(wdoUrl("One or more selected jobs no longer require WDO filing. Refresh the queue.", "error"));
  }
  const issues = mapped.flatMap(({ mapped: result }) => result.issues);
  if (issues.length) {
    const summary = issues.slice(0, 4).map((issue) => issue.message).join(" ");
    redirect(wdoUrl(`${mapped.filter((item) => item.mapped.issues.length).length} selected activities need attention before generation. ${summary}`, "error"));
  }

  const { count: priorExportCount, error: priorError } = await supabase
    .from("wdo_export_batch_items")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organization.id)
    .in("wdo_activity_id", selectedIds);
  if (priorError) redirect(wdoUrl(priorError.message, "error"));
  const reexportReason = clean(formData, "reexportReason");
  if ((priorExportCount ?? 0) > 0 && !reexportReason) {
    redirect(wdoUrl("Enter a re-export reason for activities that were generated previously.", "error"));
  }

  const records = mapped.map((item) => item.mapped.record);
  const checksum = californiaWdoTxtChecksum(records);
  const filename = californiaWdoFilename(profile?.registration_number ?? "", new Date());
  const idempotencyKey = clean(formData, "idempotencyKey") || randomUUID();
  const { data: batchId, error: batchError } = await supabase.rpc("create_wdo_export_batch", {
    target_organization_id: organization.id,
    export_date_from: clean(formData, "dateFrom") || null,
    export_date_to: clean(formData, "dateTo") || null,
    export_branch_id: null,
    export_filename: filename,
    export_serializer_version: CALIFORNIA_WDO_SERIALIZER_VERSION,
    export_checksum_sha256: checksum,
    export_idempotency_key: idempotencyKey,
    export_items: mapped.map((item) => ({
      activityId: item.activityId,
      normalizedRecord: item.mapped.record,
    })),
    export_reexport_reason: reexportReason || null,
  });
  if (batchError || !batchId) {
    redirect(wdoUrl(batchError?.message ?? "Unable to create WDO export batch.", "error"));
  }
  revalidatePath("/compliance/wdo");
  redirect(`/compliance/wdo/batches/${batchId}/download`);
}

export async function markWdoBatchFiled(formData: FormData) {
  const batchId = clean(formData, "batchId");
  if (!batchId) redirect("/compliance/wdo");
  const submittedOn = clean(formData, "submittedOn");
  const submittalNumber = clean(formData, "submittalNumber");
  if (!submittedOn || !submittalNumber) {
    redirect(batchUrl(batchId, "Submitted date and SPCB submittal number are required.", "error"));
  }
  const { supabase, organization } = await requireWdoContext();
  const { error } = await supabase.rpc("mark_wdo_export_batch_filed", {
    target_organization_id: organization.id,
    target_batch_id: batchId,
    filing_submitted_on: submittedOn,
    filing_submittal_number: submittalNumber,
    filing_notes: clean(formData, "notes") || null,
  });
  if (error) redirect(batchUrl(batchId, error.message, "error"));
  revalidatePath("/compliance/wdo");
  revalidatePath(`/compliance/wdo/batches/${batchId}`);
  redirect(batchUrl(batchId, "Batch marked filed with SPCB."));
}
