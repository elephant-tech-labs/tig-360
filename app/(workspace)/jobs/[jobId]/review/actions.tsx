"use server";

import { createHash } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { renderToBuffer } from "@react-pdf/renderer";
import { getCurrentContext } from "@/lib/current-organization";
import { loadInspectionReportBundle } from "@/lib/reports/load-report";
import { InspectionReportPdf } from "@/lib/reports/pdf-document";

function reviewUrl(jobId: string, message: string, kind: "generated" | "approved" | "error") {
  return `/jobs/${jobId}/review?${kind}=${encodeURIComponent(message)}`;
}

export async function generateInspectionReport(formData: FormData) {
  const jobId = String(formData.get("jobId") ?? "");
  if (!jobId) redirect("/jobs");

  const { supabase, organization } = await getCurrentContext();
  const bundle = await loadInspectionReportBundle(supabase, organization, jobId);
  if (!bundle.readiness.canGenerate) {
    redirect(reviewUrl(jobId, "Resolve the blocking readiness issues before generating a report.", "error"));
  }

  const { data: started, error: startError } = await supabase.rpc("begin_inspection_report_version", {
    target_organization_id: organization.id,
    target_job_id: jobId,
    report_snapshot: bundle.snapshot,
  });
  if (startError || !started?.versionId) {
    redirect(reviewUrl(jobId, startError?.message ?? "Unable to start report generation.", "error"));
  }

  const versionId = String(started.versionId);
  const version = Number(started.version);
  const storagePath = `${organization.id}/${jobId}/report-${bundle.snapshot.job.number}-v${version}-${versionId}.pdf`;
  const filename = `Inspection_Report_${bundle.snapshot.job.number}_v${version}.pdf`;

  try {
    const pdfBuffer = await renderToBuffer(
      <InspectionReportPdf snapshot={bundle.snapshot} media={bundle.media} />,
    );
    const checksum = createHash("sha256").update(pdfBuffer).digest("hex");
    const { error: uploadError } = await supabase.storage
      .from("report-pdfs")
      .upload(storagePath, pdfBuffer, {
        contentType: "application/pdf",
        upsert: false,
      });
    if (uploadError) throw uploadError;

    const { error: completeError } = await supabase.rpc("complete_inspection_report_version", {
      target_organization_id: organization.id,
      target_job_id: jobId,
      target_version_id: versionId,
      storage_path: storagePath,
      original_name: filename,
      file_size: pdfBuffer.length,
      file_checksum: checksum,
    });
    if (completeError) {
      await supabase.storage.from("report-pdfs").remove([storagePath]);
      throw completeError;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Report generation failed.";
    await supabase.rpc("fail_inspection_report_version", {
      target_organization_id: organization.id,
      target_version_id: versionId,
      failure_text: message,
    });
    redirect(reviewUrl(jobId, message, "error"));
  }

  revalidatePath(`/jobs/${jobId}`);
  revalidatePath(`/jobs/${jobId}/review`);
  redirect(reviewUrl(jobId, `Report version ${version} generated.`, "generated"));
}

export async function approveInspectionReport(formData: FormData) {
  const jobId = String(formData.get("jobId") ?? "");
  const versionId = String(formData.get("versionId") ?? "");
  const note = String(formData.get("approvalNote") ?? "");
  if (!jobId || !versionId) redirect("/jobs");

  const { supabase, organization, membership } = await getCurrentContext();
  if (!["administrator", "manager"].includes(membership.role)) {
    redirect(reviewUrl(jobId, "Only an administrator or manager can approve a report.", "error"));
  }

  const { data: version, error: versionError } = await supabase
    .from("document_versions")
    .select("id, status, approval_status, organization_id, documents!inner(inspection_job_id)")
    .eq("id", versionId)
    .eq("organization_id", organization.id)
    .eq("documents.inspection_job_id", jobId)
    .maybeSingle();
  if (versionError || !version) {
    redirect(reviewUrl(jobId, versionError?.message ?? "The selected report version was not found.", "error"));
  }
  if (version.status !== "ready") {
    redirect(reviewUrl(jobId, "Only a ready PDF version can be approved.", "error"));
  }

  const { error } = await supabase.rpc("approve_inspection_report_version", {
    target_organization_id: organization.id,
    target_job_id: jobId,
    target_version_id: versionId,
    approval_comment: note || null,
  });
  if (error) redirect(reviewUrl(jobId, error.message, "error"));

  const { data: approvedVersion, error: approvalCheckError } = await supabase
    .from("document_versions")
    .select("approval_status")
    .eq("id", versionId)
    .eq("organization_id", organization.id)
    .maybeSingle();
  if (approvalCheckError || approvedVersion?.approval_status !== "approved") {
    redirect(reviewUrl(
      jobId,
      approvalCheckError?.message ?? "The report version was not approved. Please try again.",
      "error",
    ));
  }

  revalidatePath(`/jobs/${jobId}`);
  revalidatePath(`/jobs/${jobId}/review`);
  redirect(reviewUrl(jobId, "Report approved and ready for Send Center.", "approved"));
}
