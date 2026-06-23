import Link from "next/link";
import { notFound } from "next/navigation";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Clock3,
  Download,
  Eye,
  FileCheck2,
  FilePlus2,
  Mail,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { InspectionReportHtml } from "@/components/inspection-report-html";
import { JobAuthoringNav } from "@/components/job-authoring-nav";
import { JobWorkspaceHeader } from "@/components/job-workspace-header";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import { getCurrentContext } from "@/lib/current-organization";
import { getJobWorkflowStates } from "@/lib/job-workflow";
import {
  loadInspectionReportBundle,
  loadReportVersions,
} from "@/lib/reports/load-report";
import {
  approveInspectionReport,
  generateInspectionReport,
} from "@/app/jobs/[jobId]/review/actions";

type ReviewPageProps = {
  params: Promise<{ jobId: string }>;
  searchParams: Promise<{ generated?: string; approved?: string; error?: string }>;
};

export default async function ReviewPage({ params, searchParams }: ReviewPageProps) {
  const { jobId } = await params;
  const messages = await searchParams;
  const { supabase, organization, userName, membership } = await getCurrentContext();
  const [{ data: job, error }, bundle, versions, workflowStates] = await Promise.all([
    supabase
      .from("inspection_jobs")
      .select("id, job_number, report_type, properties(street_line_1, city, region, postal_code)")
      .eq("id", jobId)
      .eq("organization_id", organization.id)
      .single(),
    loadInspectionReportBundle(supabase, organization, jobId),
    loadReportVersions(supabase, organization.id, jobId),
    getJobWorkflowStates(supabase, organization.id, jobId),
  ]);
  if (error || !job) notFound();

  const property = Array.isArray(job.properties) ? job.properties[0] : job.properties;
  const latestVersion = versions[0] ?? null;
  const approvedVersion = versions.find((version) => version.approvalStatus === "approved") ?? null;
  const canApprove = membership.role === "administrator" || membership.role === "manager";
  const blockingIssues = bundle.readiness.issues.filter((issue) => issue.severity === "blocking");
  const advisoryIssues = bundle.readiness.issues.filter((issue) => issue.severity === "advisory");

  return (
    <AppShell organizationName={organization.name} userName={userName} membershipRole={membership.role}>
      <JobWorkspaceHeader
        address={property?.street_line_1 ?? ""}
        jobId={jobId}
        jobNumber={job.job_number}
        locality={[
          property?.city,
          [property?.region, property?.postal_code].filter(Boolean).join(" "),
        ].filter(Boolean).join(", ")}
        reportType={job.report_type}
      />
      <JobAuthoringNav jobId={jobId} current="review" states={workflowStates} />

      <div className="review-page">
        {messages.error ? <div className="form-alert error"><AlertTriangle size={17} /> {messages.error}</div> : null}
        {messages.generated ? <div className="form-alert success"><Check size={17} /> {messages.generated}</div> : null}
        {messages.approved ? <div className="form-alert success"><Check size={17} /> {messages.approved}</div> : null}

        <header className="review-heading">
          <div>
            <p className="eyebrow">Final quality control</p>
            <h1>Review and generate report</h1>
            <p>Resolve blockers, inspect the live report, then create an immutable PDF version.</p>
          </div>
          <div className="review-actions">
            {approvedVersion ? <Link className="secondary-button" href={`/jobs/${jobId}/send`}><Mail size={17} /> Send Center</Link> : null}
            {bundle.readiness.canGenerate ? (
              <form action={generateInspectionReport}>
                <input name="jobId" type="hidden" value={jobId} />
                <PendingSubmitButton className="primary-button" pendingLabel="Generating PDF">
                  <FilePlus2 size={17} /> Generate new PDF
                </PendingSubmitButton>
              </form>
            ) : (
              <Link
                className="primary-button review-blocked-action"
                href={blockingIssues[0]?.href ?? `#report-checks`}
                title={blockingIssues[0]?.detail ?? "Resolve report blockers before generating a PDF."}
              >
                <AlertTriangle size={17} /> Resolve blocker to generate
              </Link>
            )}
          </div>
        </header>

        <section className="review-status-grid">
          <div><CheckCircle2 size={20} /><span>Readiness</span><strong>{blockingIssues.length ? `${blockingIssues.length} blockers` : "Ready to generate"}</strong></div>
          <div><FileCheck2 size={20} /><span>Latest PDF</span><strong>{latestVersion ? `Version ${latestVersion.version}` : "Not generated"}</strong></div>
          <div><Clock3 size={20} /><span>Approval</span><strong>{approvedVersion ? `Version ${approvedVersion.version} approved` : "Pending"}</strong></div>
        </section>

        <div className="review-layout">
          <aside className="review-sidebar">
            <section className="review-panel" id="report-checks">
              <div className="section-heading compact"><div><p className="eyebrow">Readiness</p><h2>Report checks</h2></div></div>
              {!bundle.readiness.issues.length ? <div className="review-all-clear"><CheckCircle2 size={20} /><div><strong>All checks passed</strong><span>The current job data is ready to snapshot.</span></div></div> : null}
              <div className="review-issue-list">
                {[...blockingIssues, ...advisoryIssues].map((issue) => (
                  <Link className={`review-issue ${issue.severity}`} href={issue.href} key={issue.key}>
                    {issue.severity === "blocking" ? <AlertTriangle size={17} /> : <Eye size={17} />}
                    <div><strong>{issue.label}</strong><span>{issue.detail}</span></div>
                  </Link>
                ))}
              </div>
            </section>

            <section className="review-panel">
              <div className="section-heading compact"><div><p className="eyebrow">Immutable history</p><h2>PDF versions</h2></div></div>
              {versions.length ? <div className="report-version-list">
                {versions.map((version) => (
                  <article className="report-version" key={version.id}>
                    <div>
                      <strong>Version {version.version}</strong>
                      <span>{version.generatedAt ? new Date(version.generatedAt).toLocaleString() : version.status}</span>
                    </div>
                    <span className={`version-state ${version.approvalStatus === "approved" ? "approved" : version.status}`}>{version.approvalStatus === "approved" ? "Approved" : version.status}</span>
                    {version.assetPath ? <Link className="icon-button small" href={`/jobs/${jobId}/review/versions/${version.id}/download`} title={`Download version ${version.version}`}><Download size={15} /></Link> : null}
                  </article>
                ))}
              </div> : <p className="panel-empty-copy">No PDF versions have been generated.</p>}
            </section>

            {latestVersion?.status === "ready" && latestVersion.approvalStatus !== "approved" ? (
              <section className="review-panel approval-panel">
                <div className="section-heading compact"><div><p className="eyebrow">Manager control</p><h2>Approve version {latestVersion.version}</h2></div></div>
                {canApprove ? (
                  <form action={approveInspectionReport}>
                    <input name="jobId" type="hidden" value={jobId} />
                    <input name="versionId" type="hidden" value={latestVersion.id} />
                    <label>Approval note<textarea name="approvalNote" rows={3} placeholder="Optional internal note" /></label>
                    <button className="primary-button" type="submit"><CheckCircle2 size={17} /> Approve report</button>
                  </form>
                ) : <p className="panel-empty-copy">A manager or administrator must approve this version.</p>}
              </section>
            ) : null}
          </aside>

          <main className="report-preview-panel">
            <div className="report-preview-toolbar">
              <div><p className="eyebrow">Live HTML template</p><h2>Report preview</h2></div>
              <span>Preview reflects current job data. Generated PDFs preserve a snapshot.</span>
            </div>
            <div className="report-preview-canvas">
              <InspectionReportHtml snapshot={bundle.snapshot} media={bundle.media} />
            </div>
          </main>
        </div>
      </div>
    </AppShell>
  );
}
