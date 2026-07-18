import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveCurrentWorkAuthorization } from "./proposals/current-work-authorization";
import { loadProposalSnapshot } from "./proposals/load-proposal-snapshot";

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
    { data: organization },
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
      .from("organizations")
      .select("id, name")
      .eq("id", organizationId)
      .maybeSingle(),
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
      .select("document_versions(id, status, approval_status, version)")
      .eq("inspection_job_id", jobId)
      .eq("organization_id", organizationId)
      .eq("kind", "inspection_report")
      .maybeSingle(),
    supabase
      .from("job_proposals")
      .select("id, status, customer_summary, customer_summary_generated_at, proposal_line_items(id, included, updated_at)")
      .eq("inspection_job_id", jobId)
      .eq("organization_id", organizationId)
      .maybeSingle(),
    supabase
      .from("documents")
      .select("kind, document_versions(id, status, approval_status, version, snapshot, generated_at)")
      .eq("inspection_job_id", jobId)
      .eq("organization_id", organizationId)
      .in("kind", ["proposal", "contract"]),
    supabase
      .from("deliveries")
      .select("status, document_version_id, attachment_version_ids")
      .eq("inspection_job_id", jobId)
      .eq("organization_id", organizationId),
    supabase
      .from("signature_requests")
      .select("status, document_version_id")
      .eq("inspection_job_id", jobId)
      .eq("organization_id", organizationId),
    supabase
      .from("proposal_review_links")
      .select("status, report_document_version_id, proposal_document_version_id, last_viewed_at")
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
  const currentReport = reportVersions.find(
    (version) => version.status === "ready" && version.approval_status === "approved",
  ) ?? null;
  const proposalLines = (proposal?.proposal_line_items ?? []) as { included: boolean | null }[];
  const hasIncludedProposalLines = proposalLines.some((line) => line.included);
  const proposalDocuments = Array.isArray(proposalDocument) ? proposalDocument : [];
  const proposalVersions = proposalDocuments
    .flatMap((document) =>
      (document.document_versions ?? []).map((version) => ({
        ...version,
        kind: document.kind,
      })),
    )
    .sort((a, b) => b.version - a.version);
  let currentProposalHash: string | null = null;
  if (organization && proposal?.id && proposal.status === "approved" && hasIncludedProposalLines) {
    currentProposalHash = (await loadProposalSnapshot(
      supabase,
      organization,
      jobId,
      proposal.id,
    ).catch(() => null))?.contentHash ?? null;
  }
  const proposalContentUpdatedAt = Math.max(
    0,
    ...((proposal?.proposal_line_items ?? []) as { updated_at?: string | null }[]).map((line) =>
      line.updated_at ? new Date(line.updated_at).getTime() : 0,
    ),
    proposal?.customer_summary_generated_at
      ? new Date(proposal.customer_summary_generated_at).getTime()
      : 0,
  );
  const workAuthorization = resolveCurrentWorkAuthorization({
    currentContentHash: currentProposalHash,
    contentUpdatedAt: proposalContentUpdatedAt,
    versions: proposalVersions.map((version) => ({
      id: version.id,
      version: version.version,
      status: version.status,
      approvalStatus: version.approval_status,
      snapshot: version.snapshot,
      generatedAt: version.generated_at,
      kind: version.kind,
    })),
  });
  const currentWorkAuthorization = workAuthorization.currentVersion;
  const attachmentIncludes = (value: unknown, id: string | undefined) =>
    Boolean(id && Array.isArray(value) && value.includes(id));
  const currentDeliveries = (deliveryStates ?? []).filter(
    (delivery) =>
      delivery.document_version_id === currentReport?.id
      && attachmentIncludes(delivery.attachment_version_ids, currentWorkAuthorization?.id),
  );
  const currentSignatures = (signatureStates ?? []).filter(
    (signature) => signature.document_version_id === currentWorkAuthorization?.id,
  );
  const currentReviewLinks = (reviewLinkStates ?? []).filter(
    (link) =>
      link.report_document_version_id === currentReport?.id
      && link.proposal_document_version_id === currentWorkAuthorization?.id,
  );
  const hasCurrentDeliveryActivity = Boolean(
    currentDeliveries.length || currentSignatures.length || currentReviewLinks.length,
  );
  const sendComplete = Boolean(
    currentDeliveries.some((delivery) => ["sent", "delivered"].includes(delivery.status))
    || currentSignatures.some((signature) => signature.status === "completed"),
  );
  const sendInProgress = Boolean(
    currentSignatures.some((signature) => ["pending", "sending", "sent"].includes(signature.status))
    || currentReviewLinks.some((link) => ["active", "viewed"].includes(link.status) || link.last_viewed_at),
  );
  const sendNeedsAttention = Boolean(
    currentDeliveries.some((delivery) => ["failed", "cancelled"].includes(delivery.status))
    || currentSignatures.some((signature) => ["failed", "declined", "expired", "cancelled"].includes(signature.status))
    || ((deliveryStates?.length || signatureStates?.length || reviewLinkStates?.length)
      && (!currentReport || !currentWorkAuthorization)),
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
    proposal: proposal?.status === "approved" && workAuthorization.state === "ready"
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
        : sendInProgress || hasCurrentDeliveryActivity
          ? "in_progress"
          : "not_started",
  };
}
