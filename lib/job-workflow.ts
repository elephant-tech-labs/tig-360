import type { SupabaseClient } from "@supabase/supabase-js";

export type WorkflowStepState =
  | "not_started"
  | "in_progress"
  | "complete"
  | "not_required"
  | "attention";

export type JobWorkflowStates = {
  setup: WorkflowStepState;
  drawing: WorkflowStepState;
  findings: WorkflowStepState;
  photos: WorkflowStepState;
  review: WorkflowStepState;
};

export async function getJobWorkflowStates(
  supabase: SupabaseClient,
  organizationId: string,
  jobId: string,
): Promise<JobWorkflowStates> {
  const [
    { data: job },
    { data: drawing },
    { count: findingCount },
    { data: photoState },
    { count: photoCount },
    { data: reportDocument },
  ] = await Promise.all([
    supabase
      .from("inspection_jobs")
      .select(`
        report_type, inspection_at, inspected_by_id, include_inspector_signature,
        prior_job_id, properties(street_line_1, city, region, postal_code),
        inspectors:inspectors!inspection_jobs_inspected_by_inspector_fkey(signature_path)
      `)
      .eq("id", jobId)
      .eq("organization_id", organizationId)
      .maybeSingle(),
    supabase
      .from("diagram_drafts")
      .select("status, source_json")
      .eq("inspection_job_id", jobId)
      .eq("organization_id", organizationId)
      .maybeSingle(),
    supabase
      .from("findings")
      .select("id", { count: "exact", head: true })
      .eq("inspection_job_id", jobId)
      .eq("organization_id", organizationId)
      .is("archived_at", null),
    supabase
      .from("job_photo_states")
      .select("status")
      .eq("inspection_job_id", jobId)
      .eq("organization_id", organizationId)
      .maybeSingle(),
    supabase
      .from("assets")
      .select("id", { count: "exact", head: true })
      .eq("inspection_job_id", jobId)
      .eq("organization_id", organizationId)
      .in("kind", ["property_photo", "inspection_photo"])
      .neq("status", "archived"),
    supabase
      .from("documents")
      .select("document_versions(status, approval_status, version)")
      .eq("inspection_job_id", jobId)
      .eq("organization_id", organizationId)
      .eq("kind", "inspection_report")
      .maybeSingle(),
  ]);

  const property = job
    ? (Array.isArray(job.properties) ? job.properties[0] : job.properties)
    : null;
  const inspector = job
    ? (Array.isArray(job.inspectors) ? job.inspectors[0] : job.inspectors)
    : null;
  const requiresPriorJob = job?.report_type === "supplemental" || job?.report_type === "reinspection";
  const setupComplete = Boolean(
    property?.street_line_1
    && property.city
    && property.region
    && property.postal_code
    && job?.inspection_at
    && job?.report_type
    && job?.inspected_by_id
    && (!job.include_inspector_signature || inspector?.signature_path)
    && (!requiresPriorJob || job.prior_job_id),
  );
  const drawingObjects = drawing?.source_json as { objects?: unknown[] } | null;
  const reportVersions = [...(reportDocument?.document_versions ?? [])]
    .sort((a, b) => b.version - a.version);
  const latestReport = reportVersions[0];

  return {
    setup: setupComplete ? "complete" : "attention",
    drawing: drawing?.status === "complete"
      ? "complete"
      : drawing?.status === "skipped"
        ? "not_required"
        : drawingObjects?.objects?.length
          ? "in_progress"
          : "not_started",
    findings: findingCount ? "in_progress" : "not_started",
    photos: photoState?.status === "complete"
      ? "complete"
      : photoState?.status === "not_required"
        ? "not_required"
        : photoCount
          ? "in_progress"
          : "not_started",
    review: latestReport?.approval_status === "approved"
      ? "complete"
      : latestReport?.status === "ready"
        ? "attention"
        : latestReport?.status === "generating"
          ? "in_progress"
          : "not_started",
  };
}
