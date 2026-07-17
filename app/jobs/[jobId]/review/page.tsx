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
  FilePenLine,
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
  const currentVersionReady = latestVersion?.status === "ready";
  const currentVersionApproved = latestVersion?.approvalStatus === "approved";
  const currentVersionNeedsApproval = Boolean(currentVersionReady && !currentVersionApproved);
  const approvedVersionIsCurrent = Boolean(latestVersion && approvedVersion?.id === latestVersion.id);
  const currentReportState = blockingIssues.length
    ? {
        tone: "blocked",
        label: "Needs attention",
        title: "Resolve report checks first",
        detail: "Fix the blocking checks before creating a customer-ready PDF snapshot.",
      }
    : !latestVersion
      ? {
          tone: "ready",
          label: "Ready",
          title: "Generate the first report PDF",
          detail: "The preview is live. Generate a fixed PDF when the report looks correct.",
        }
      : latestVersion.status === "failed"
        ? {
            tone: "blocked",
            label: "Generation failed",
            title: `Version ${latestVersion.version} did not generate`,
            detail: latestVersion.failureMessage ?? "Try generating the report PDF again.",
          }
        : currentVersionNeedsApproval
          ? {
              tone: "attention",
              label: "Approval needed",
              title: `Approve current PDF version ${latestVersion.version}`,
              detail: "This PDF is ready, but it will not be available in Send Center until it is approved.",
            }
          : approvedVersionIsCurrent
            ? {
                tone: "complete",
                label: "Approved",
                title: `Version ${latestVersion.version} is ready to send`,
                detail: "This approved PDF is the report customers will receive from Send Center.",
              }
            : approvedVersion
              ? {
                  tone: "attention",
                  label: "Newer PDF available",
                  title: `Version ${approvedVersion.version} is approved`,
                  detail: `Version ${latestVersion.version} exists but has not been approved. Send Center will use the approved version.`,
                }
              : {
                  tone: "attention",
                  label: "In progress",
                  title: `Version ${latestVersion.version} is ${latestVersion.status}`,
                  detail: "Wait for generation to finish, then approve the ready PDF.",
                };

  return (
    <AppShell organizationName={organization.name} userName={userName} membershipRole={membership.role}>
      <JobWorkspaceHeader
        address={property?.street_line_1 ?? ""}
        actions={<Link className="secondary-button" href={`/jobs/${jobId}/proposal`}><FilePenLine size={16} /> Open proposal</Link>}
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
            <h1>Final report review</h1>
            <p>Check the live preview, lock the report as a PDF, approve it, then move to proposal and delivery.</p>
          </div>
          <div className="review-actions">
            {approvedVersion ? <Link className="secondary-button" href={`/jobs/${jobId}/send`}><Mail size={17} /> Send Center</Link> : null}
            {bundle.readiness.canGenerate ? (
              <form action={generateInspectionReport}>
                <input name="jobId" type="hidden" value={jobId} />
                <PendingSubmitButton className="primary-button" pendingLabel="Generating PDF">
                  <FilePlus2 size={17} /> Generate report PDF
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
          <div><CheckCircle2 size={20} /><span>Checks</span><strong>{blockingIssues.length ? `${blockingIssues.length} blockers` : "All clear"}</strong></div>
          <div><FileCheck2 size={20} /><span>Current PDF</span><strong>{latestVersion ? `Version ${latestVersion.version}` : "Not generated"}</strong></div>
          <div><Clock3 size={20} /><span>Approved report</span><strong>{approvedVersion ? `Version ${approvedVersion.version}` : "Not approved"}</strong></div>
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

            <section className={`review-panel current-report-panel state-${currentReportState.tone}`}>
              <div className="section-heading compact"><div><p className="eyebrow">Current report</p><h2>{currentReportState.title}</h2></div></div>
              <div className="current-report-state">
                <span>{currentReportState.label}</span>
                <p>{currentReportState.detail}</p>
              </div>
              {latestVersion ? (
                <dl className="current-report-meta">
                  <div><dt>Latest generated</dt><dd>Version {latestVersion.version}</dd></div>
                  <div><dt>Approved for sending</dt><dd>{approvedVersion ? `Version ${approvedVersion.version}` : "None yet"}</dd></div>
                </dl>
              ) : null}
              <div className="current-report-actions">
                {blockingIssues.length ? (
                  <Link className="secondary-button" href={blockingIssues[0]?.href ?? "#report-checks"}>
                    <AlertTriangle size={16} /> Resolve first check
                  </Link>
                ) : !latestVersion || latestVersion.status === "failed" ? (
                  <form action={generateInspectionReport}>
                    <input name="jobId" type="hidden" value={jobId} />
                    <PendingSubmitButton className="primary-button" pendingLabel="Generating PDF">
                      <FilePlus2 size={16} /> Generate report PDF
                    </PendingSubmitButton>
                  </form>
                ) : currentVersionNeedsApproval ? (
                  canApprove ? (
                  <form action={approveInspectionReport}>
                    <input name="jobId" type="hidden" value={jobId} />
                    <input name="versionId" type="hidden" value={latestVersion.id} />
                    <label>Approval note<textarea name="approvalNote" rows={3} placeholder="Optional internal note" /></label>
                    <PendingSubmitButton className="primary-button" pendingLabel="Approving report">
                      <CheckCircle2 size={17} /> Approve report
                    </PendingSubmitButton>
                  </form>
                  ) : <p className="panel-empty-copy">A manager or administrator must approve this PDF before sending.</p>
                ) : approvedVersion ? (
                  <Link className="primary-button" href={`/jobs/${jobId}/send`}><Mail size={16} /> Open Send Center</Link>
                ) : <p className="panel-empty-copy">PDF generation is still in progress.</p>}
              </div>
            </section>

            <section className="review-panel report-history-panel">
              <div className="section-heading compact"><div><p className="eyebrow">Saved snapshots</p><h2>Report history</h2></div></div>
              {approvedVersion ? (
                <div className="report-history-summary">
                  <span>Customer-ready report</span>
                  <strong>Approved version {approvedVersion.version}</strong>
                  {approvedVersion.assetPath ? <Link className="text-button" href={`/jobs/${jobId}/review/versions/${approvedVersion.id}/download`}><Download size={14} /> Download approved PDF</Link> : null}
                </div>
              ) : (
                <p className="panel-empty-copy">No approved report yet. Approve the current PDF before using Send Center.</p>
              )}
              {versions.length ? (
                <details className="report-history-details">
                  <summary>Show generated PDFs ({versions.length})</summary>
                  <div className="report-version-list">
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
                  </div>
                </details>
              ) : null}
            </section>
          </aside>

          <main className="report-preview-panel">
            <div className="report-preview-toolbar">
              <div><p className="eyebrow">Live preview</p><h2>Report preview</h2></div>
              <span>This updates with current job data. Approved PDFs are saved snapshots.</span>
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
