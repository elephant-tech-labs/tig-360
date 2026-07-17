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
  proposal: WorkflowStepState;
  send: WorkflowStepState;
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
    { data: findingSummary },
    { data: photoState },
    { count: photoCount },
    { data: reportDocument },
    { data: proposal },
    { data: proposalDocument },
    { data: deliveryStates },
    { data: signatureStates },
    { data: reviewLinkStates },
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
      .from("job_finding_summaries")
      .select("status")
      .eq("inspection_job_id", jobId)
      .eq("organization_id", organizationId)
      .maybeSingle(),
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
    supabase
      .from("job_proposals")
      .select("status, customer_summary, proposal_line_items(id, included)")
      .eq("inspection_job_id", jobId)
      .eq("organization_id", organizationId)
      .maybeSingle(),
    supabase
      .from("documents")
      .select("document_versions(status, approval_status, version)")
      .eq("inspection_job_id", jobId)
      .eq("organization_id", organizationId)
      .in("kind", ["proposal", "contract"]),
    supabase
      .from("deliveries")
      .select("status")
      .eq("inspection_job_id", jobId)
      .eq("organization_id", organizationId),
    supabase
      .from("signature_requests")
      .select("status")
      .eq("inspection_job_id", jobId)
      .eq("organization_id", organizationId),
    supabase
      .from("proposal_review_links")
      .select("status")
      .eq("inspection_job_id", jobId)
      .eq("organization_id", organizationId),
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
  const proposalLines = (proposal?.proposal_line_items ?? []) as { included: boolean | null }[];
  const hasIncludedProposalLines = proposalLines.some((line) => line.included);
  const proposalDocuments = Array.isArray(proposalDocument) ? proposalDocument : [];
  const proposalVersions = proposalDocuments
    .flatMap((document) => document.document_versions ?? [])
    .sort((a, b) => b.version - a.version);
  const latestProposalVersion = proposalVersions[0];
  const hasDeliveryActivity = Boolean(deliveryStates?.length || signatureStates?.length || reviewLinkStates?.length);
  const sendComplete = Boolean(
    deliveryStates?.some((delivery) => ["sent", "delivered"].includes(delivery.status))
    || signatureStates?.some((signature) => signature.status === "completed"),
  );
  const sendNeedsAttention = Boolean(
    deliveryStates?.some((delivery) => ["failed", "cancelled"].includes(delivery.status))
    || signatureStates?.some((signature) => ["failed", "declined", "expired", "cancelled"].includes(signature.status)),
  );

  return {
    setup: setupComplete ? "complete" : "attention",
    drawing: drawing?.status === "complete"
      ? "complete"
      : drawing?.status === "skipped"
        ? "not_required"
        : drawingObjects?.objects?.length
          ? "in_progress"
          : "not_started",
    findings: findingSummary?.status === "complete"
      ? "complete"
      : findingCount
        ? "in_progress"
        : "not_started",
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
    proposal: proposal?.status === "approved" && latestProposalVersion?.status === "ready"
      ? "complete"
      : proposal?.status === "approved"
        ? "attention"
        : proposal?.status === "ready" || proposal?.customer_summary || hasIncludedProposalLines
          ? "in_progress"
          : "not_started",
    send: sendComplete
      ? "complete"
      : sendNeedsAttention
        ? "attention"
        : hasDeliveryActivity
          ? "in_progress"
          : "not_started",
  };
}
