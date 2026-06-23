import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import {
  DrawingWorkspaceLoader,
} from "@/components/drawing-workspace-loader";
import { JobAuthoringNav } from "@/components/job-authoring-nav";
import { JobWorkspaceHeader } from "@/components/job-workspace-header";
import { getJobWorkflowStates } from "@/lib/job-workflow";
import type {
  DrawingVersion,
  DrawingWorkspaceProps,
} from "@/components/drawing-workspace";
import { getCurrentContext } from "@/lib/current-organization";

type DrawingPageProps = {
  params: Promise<{ jobId: string }>;
};

export default async function DrawingPage({ params }: DrawingPageProps) {
  const { jobId } = await params;
  const { supabase, organization, userName, membership } = await getCurrentContext();
  const [
    { data: job, error: jobError },
    { data: draft, error: draftError },
    { data: findings, error: findingsError },
    { data: versions, error: versionsError },
  ] = await Promise.all([
    supabase
      .from("inspection_jobs")
      .select("id, job_number, report_type, properties(street_line_1, city, region, postal_code)")
      .eq("id", jobId)
      .eq("organization_id", organization.id)
      .single(),
    supabase
      .from("diagram_drafts")
      .select("source_json, status")
      .eq("inspection_job_id", jobId)
      .eq("organization_id", organization.id)
      .maybeSingle(),
    supabase
      .from("findings")
      .select("id, code, title, classification")
      .eq("inspection_job_id", jobId)
      .eq("organization_id", organization.id)
      .eq("entry_type", "finding")
      .is("archived_at", null)
      .order("sort_order"),
    supabase
      .from("diagrams")
      .select("id, version, status, created_at")
      .eq("inspection_job_id", jobId)
      .eq("organization_id", organization.id)
      .order("version", { ascending: false }),
  ]);

  if (jobError || !job) notFound();
  if (draftError) throw new Error(draftError.message);
  if (findingsError) throw new Error(findingsError.message);
  if (versionsError) throw new Error(versionsError.message);

  const property = Array.isArray(job.properties) ? job.properties[0] : job.properties;
  const sourceJson = draft?.source_json as { objects?: DrawingWorkspaceProps["initialObjects"] } | null;
  const initialStatus = draft?.status === "complete" || draft?.status === "skipped"
    ? draft.status
    : "draft";
  const workflowStates = await getJobWorkflowStates(supabase, organization.id, jobId);

  return (
    <AppShell organizationName={organization.name} userName={userName} membershipRole={membership.role}>
      <JobWorkspaceHeader
        jobId={jobId}
        jobNumber={job.job_number}
        address={property?.street_line_1 ?? ""}
        locality={[
          property?.city,
          [property?.region, property?.postal_code].filter(Boolean).join(" "),
        ].filter(Boolean).join(", ")}
        reportType={job.report_type}
      />
      <JobAuthoringNav jobId={jobId} current="drawing" states={workflowStates} />
      <DrawingWorkspaceLoader
        organizationId={organization.id}
        jobId={jobId}
        jobNumber={job.job_number}
        initialObjects={Array.isArray(sourceJson?.objects) ? sourceJson.objects : []}
        initialStatus={initialStatus}
        findings={(findings ?? []).filter((finding) => finding.code).map((finding) => ({
          id: finding.id,
          code: finding.code as string,
          title: finding.title,
          classification: finding.classification,
        }))}
        versions={(versions ?? []).map((version) => ({
          id: version.id,
          version: version.version,
          status: version.status as DrawingVersion["status"],
          createdAt: version.created_at,
        }))}
      />
    </AppShell>
  );
}
