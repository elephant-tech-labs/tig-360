import Link from "next/link";
import { notFound } from "next/navigation";
import {
  AlertTriangle,
  BadgeDollarSign,
  CheckCircle2,
  FilePenLine,
  FileText,
  Import,
  Plus,
  ReceiptText,
  Send,
  Trash2,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { JobAuthoringNav } from "@/components/job-authoring-nav";
import { JobWorkspaceHeader } from "@/components/job-workspace-header";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import { getCurrentContext } from "@/lib/current-organization";
import { getJobWorkflowStates } from "@/lib/job-workflow";
import {
  approveAndGenerateProposalContractDocument,
  deleteProposalLine,
  generateProposalSummary,
  importFindingProposalLines,
  saveProposalLine,
  saveProposalSettings,
  saveProposalSummary,
} from "@/app/jobs/[jobId]/proposal/actions";

type ProposalPageProps = {
  params: Promise<{ jobId: string }>;
  searchParams: Promise<{ saved?: string; error?: string }>;
};

type ProposalLine = {
  id: string;
  source_type: string;
  item_code: string | null;
  section: string | null;
  title: string;
  description: string | null;
  contract_scope: string | null;
  contract_scope_source: unknown;
  contract_scope_generated_at: string | null;
  quantity: number;
  unit_price: number;
  included: boolean;
  sort_order: number;
  updated_at: string | null;
  findings?: { code: string | null; title: string | null } | { code: string | null; title: string | null }[] | null;
};

type ProposalDocumentVersion = {
  id: string;
  version: number;
  status: string;
  approval_status: string;
  generated_at: string | null;
  asset_id: string | null;
};

function summarySourceLabel(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const source = value as { provider?: string; model?: string; reason?: string };
  if (source.provider === "openai") return `AI summary${source.model ? ` via ${source.model}` : ""}`;
  if (source.provider === "manual") return "Manual summary";
  if (source.provider === "fallback") return "Draft fallback summary";
  return source.provider ? `${source.provider} summary` : null;
}

function summarySourceProvider(value: unknown) {
  if (!value || typeof value !== "object") return null;
  return (value as { provider?: string }).provider ?? null;
}

const sectionOptions = [
  ["section_i", "Section I"],
  ["section_ii", "Section II"],
  ["further_inspection", "Further inspection"],
  ["other", "Other"],
  ["manual", "Manual"],
];

function money(value: number | string | null | undefined) {
  const numeric = Number(value ?? 0);
  return new Intl.NumberFormat("en-US", { currency: "USD", style: "currency" }).format(numeric);
}

function sectionLabel(value: string | null | undefined) {
  return sectionOptions.find(([id]) => id === value)?.[1] ?? "Manual";
}

function hiddenContext(organizationId: string, jobId: string, proposalId: string) {
  return (
    <>
      <input name="organizationId" type="hidden" value={organizationId} />
      <input name="jobId" type="hidden" value={jobId} />
      <input name="proposalId" type="hidden" value={proposalId} />
    </>
  );
}

export default async function ProposalPage({ params, searchParams }: ProposalPageProps) {
  const { jobId } = await params;
  const messages = await searchParams;
  const { supabase, organization, userName, membership } = await getCurrentContext();

  const [{ data: job, error: jobError }, { data: proposalId, error: ensureError }] = await Promise.all([
    supabase
      .from("inspection_jobs")
      .select("id, job_number, report_type, properties(street_line_1, city, region, postal_code)")
      .eq("id", jobId)
      .eq("organization_id", organization.id)
      .single(),
    supabase.rpc("ensure_job_proposal", {
      target_organization_id: organization.id,
      target_job_id: jobId,
    }),
  ]);

  if (jobError || !job) notFound();
  if (ensureError || !proposalId) throw new Error(ensureError?.message ?? "Unable to prepare proposal.");

  const [
    { data: proposal, error: proposalError },
    { count: findingRecommendationCount },
    { data: proposalDocument },
    workflowStates,
  ] = await Promise.all([
    supabase
      .from("job_proposals")
      .select(`
        id, status, title, customer_note, terms, tax_rate, discount_amount,
        customer_summary, customer_summary_generated_at, customer_summary_source,
        subtotal_amount, tax_amount,
        total_amount, approved_at, updated_at,
        proposal_line_items(
          id, source_type, item_code, section, title, description, quantity, unit_price,
          included, sort_order, contract_scope, contract_scope_source, contract_scope_generated_at,
          updated_at, findings(code, title)
        )
      `)
      .eq("id", proposalId)
      .eq("organization_id", organization.id)
      .single(),
    supabase
      .from("recommendations")
      .select("id, findings!inner(id)", { count: "exact", head: true })
      .eq("organization_id", organization.id)
      .eq("findings.inspection_job_id", jobId)
      .is("archived_at", null)
      .is("findings.archived_at", null),
    supabase
      .from("documents")
      .select("document_versions(id, version, status, approval_status, generated_at, asset_id)")
      .eq("inspection_job_id", jobId)
      .eq("organization_id", organization.id)
      .eq("kind", "proposal")
      .maybeSingle(),
    getJobWorkflowStates(supabase, organization.id, jobId),
  ]);

  if (proposalError || !proposal) throw new Error(proposalError?.message ?? "Proposal not found.");
  const property = Array.isArray(job.properties) ? job.properties[0] : job.properties;
  const lines = [...((proposal.proposal_line_items ?? []) as ProposalLine[])]
    .sort((a, b) => a.sort_order - b.sort_order);
  const includedLines = lines.filter((line) => line.included);
  const canApprove = membership.role === "administrator" || membership.role === "manager";
  const hasIncludedLines = includedLines.length > 0;
  const isApproved = proposal.status === "approved";
  const proposalVersionsRaw = proposalDocument?.document_versions ?? [];
  const proposalVersions = ([...(Array.isArray(proposalVersionsRaw) ? proposalVersionsRaw : [proposalVersionsRaw])] as ProposalDocumentVersion[])
    .sort((a, b) => b.version - a.version);
  const latestProposalVersion = proposalVersions[0] ?? null;
  const proposalUpdatedAt = proposal.updated_at ? new Date(proposal.updated_at).getTime() : 0;
  const summaryGeneratedAt = proposal.customer_summary_generated_at ? new Date(proposal.customer_summary_generated_at).getTime() : 0;
  const lineScopeIsOutdated = (line: ProposalLine) => {
    if (!line.contract_scope?.trim() || !line.contract_scope_generated_at) return true;
    const lineUpdatedAt = line.updated_at ? new Date(line.updated_at).getTime() : 0;
    return lineUpdatedAt - new Date(line.contract_scope_generated_at).getTime() > 5000;
  };
  const staleLineScopeCount = includedLines.filter(lineScopeIsOutdated).length;
  const summaryOutdated = Boolean(summaryGeneratedAt && proposalUpdatedAt - summaryGeneratedAt > 5000);
  const needsSummaryRefresh = hasIncludedLines && (!proposal.customer_summary || summaryOutdated || staleLineScopeCount > 0);
  const isVersionOutdated = (version: ProposalDocumentVersion) => {
    if (!version.generated_at || !proposalUpdatedAt) return false;
    return new Date(version.generated_at).getTime() < proposalUpdatedAt;
  };
  const latestProposalVersionOutdated = latestProposalVersion ? isVersionOutdated(latestProposalVersion) : false;
  const hasCurrentContractPdf = Boolean(latestProposalVersion && latestProposalVersion.status === "ready" && !latestProposalVersionOutdated);
  const customerSummarySource = summarySourceLabel(proposal.customer_summary_source);
  const customerSummaryProvider = summarySourceProvider(proposal.customer_summary_source);
  const nextAction = !hasIncludedLines
    ? {
        title: "Import recommended work",
        detail: "Bring in recommendations from Findings. TIG-360 will also prepare the customer summary and concise line-item scopes.",
        cta: "Import recommended work",
      }
    : needsSummaryRefresh
      ? {
          title: proposal.customer_summary ? "Refresh proposal wording" : "Prepare proposal wording",
          detail: "The customer summary or line-item scopes need to match the latest proposal details before generating the contract.",
          cta: "Refresh wording",
        }
      : !hasCurrentContractPdf
        ? !latestProposalVersion
          ? {
              title: isApproved ? "Generate contract PDF" : "Approve and generate contract PDF",
              detail: "Create the signature-ready work authorization snapshot from the current proposal.",
              cta: "Approve and generate",
            }
          : {
              title: "Regenerate contract PDF",
              detail: "Proposal details changed after the latest PDF. Generate a fresh contract before using Send Center.",
              cta: "Approve and generate",
            }
        : {
            title: "Ready for Send Center",
            detail: "The proposal is approved and the contract PDF is current. Send the review package or start signing.",
            cta: "Open Send Center",
          };

  return (
    <AppShell organizationName={organization.name} userName={userName} membershipRole={membership.role}>
      <JobWorkspaceHeader
        address={property?.street_line_1 ?? ""}
        actions={<Link className="secondary-button" href={`/jobs/${jobId}/send`}><Send size={16} /> Send Center</Link>}
        jobId={jobId}
        jobNumber={job.job_number}
        locality={[
          property?.city,
          [property?.region, property?.postal_code].filter(Boolean).join(" "),
        ].filter(Boolean).join(", ")}
        reportType={job.report_type}
      />
      <JobAuthoringNav jobId={jobId} current="proposal" states={workflowStates} />

      <main className="proposal-page">
        {messages.error ? <div className="form-alert error"><AlertTriangle size={17} /> {messages.error}</div> : null}
        {messages.saved ? <div className="form-alert success"><CheckCircle2 size={17} /> {messages.saved}</div> : null}

        <header className="proposal-heading">
          <div>
            <p className="eyebrow">Proposal and contract</p>
            <h1>Proposal and Work Authorization</h1>
            <p>Price the recommended work, prepare the customer explanation, approve the proposal, then generate the signature-ready contract.</p>
          </div>
          <div className="proposal-heading-actions">
            <form action={importFindingProposalLines}>
              {hiddenContext(organization.id, jobId, proposal.id)}
              <PendingSubmitButton className="secondary-button" pendingLabel="Importing">
                <Import size={16} /> Import recommended work
              </PendingSubmitButton>
            </form>
            <Link className="secondary-button" href={`/jobs/${jobId}/review`}><FileText size={16} /> Review report</Link>
          </div>
        </header>

        <section className="proposal-status-grid">
          <div><FilePenLine size={20} /><span>Status</span><strong>{proposal.status.replaceAll("_", " ")}</strong></div>
          <div><ReceiptText size={20} /><span>Included lines</span><strong>{includedLines.length}</strong></div>
          <div><BadgeDollarSign size={20} /><span>Total</span><strong>{money(proposal.total_amount)}</strong></div>
        </section>

        <div className="proposal-layout">
          <section className="proposal-panel proposal-lines-panel">
            <div className="proposal-customer-summary">
              <div className="section-heading compact">
                <div>
                  <p className="eyebrow">Customer clarity</p>
                  <h2>Easy-to-understand proposal summary</h2>
                </div>
                <form action={generateProposalSummary}>
                  {hiddenContext(organization.id, jobId, proposal.id)}
                  <PendingSubmitButton className="secondary-button" disabled={!hasIncludedLines} pendingLabel="Refreshing wording">
                    {proposal.customer_summary ? "Refresh wording" : "Prepare wording"}
                  </PendingSubmitButton>
                </form>
              </div>
              <p className="proposal-summary-help">
                This plain-English explanation appears on the customer review page, in the proposal email context, and before the formal work authorization.
              </p>
              {customerSummaryProvider === "fallback" ? (
                <div className="proposal-summary-notice">
                  <AlertTriangle size={16} />
                  <div>
                    <strong>Fallback draft</strong>
                    <span>This was generated without AI. Review and save it manually before sending it to a customer.</span>
                  </div>
                </div>
              ) : null}
              {needsSummaryRefresh ? (
                <div className="proposal-summary-notice warning">
                  <AlertTriangle size={16} />
                  <div>
                    <strong>{proposal.customer_summary ? "Proposal wording may be outdated" : "Proposal wording needed"}</strong>
                    <span>
                      {proposal.customer_summary
                        ? "Refresh the customer summary and line-item scopes before generating a fresh contract PDF."
                        : "Prepare the summary and line-item scopes before approving the contract PDF."}
                    </span>
                  </div>
                </div>
              ) : null}
              <form action={saveProposalSummary} className="proposal-summary-form">
                {hiddenContext(organization.id, jobId, proposal.id)}
                <textarea
                  name="customerSummary"
                  placeholder="A calm, helpful explanation of what was found, what is recommended, and what the customer should review next."
                  rows={7}
                  defaultValue={proposal.customer_summary ?? ""}
                />
                <div>
                  {proposal.customer_summary_generated_at ? (
                    <span>Last updated {new Date(proposal.customer_summary_generated_at).toLocaleString()}</span>
                  ) : (
                    <span>No customer summary prepared yet.</span>
                  )}
                  {customerSummarySource ? <span>{customerSummarySource}</span> : null}
                  <PendingSubmitButton className="secondary-button" pendingLabel="Saving">Save manual edits</PendingSubmitButton>
                </div>
              </form>
            </div>

            <div className="section-heading">
              <div>
                <p className="eyebrow">Scope and pricing</p>
                <h2>Proposal line items</h2>
              </div>
              <span className="proposal-count">{findingRecommendationCount ?? 0} recommendations available</span>
            </div>

            {lines.length ? (
              <div className="proposal-line-list">
                {lines.map((line) => {
                  const finding = Array.isArray(line.findings) ? line.findings[0] : line.findings;
                  const sourceLabel = line.source_type === "manual"
                    ? "Manual"
                    : [line.item_code || finding?.code, sectionLabel(line.section)].filter(Boolean).join(" · ");
                  return (
                    <details className={`proposal-line ${line.included ? "" : "excluded"}`} key={line.id}>
                      <summary>
                        <div>
                          <strong>{line.title}</strong>
                          <span>{sourceLabel}</span>
                        </div>
                        <div className="proposal-line-right">
                          <div className="proposal-line-price">
                            <strong>{money(Number(line.quantity) * Number(line.unit_price))}</strong>
                            <span>{line.included ? "Included" : "Excluded"}</span>
                          </div>
                          <span className="proposal-line-edit">Edit</span>
                        </div>
                      </summary>
                      <form action={saveProposalLine} className="proposal-line-form">
                        {hiddenContext(organization.id, jobId, proposal.id)}
                        <input name="lineId" type="hidden" value={line.id} />
                        <label>Title<input name="title" defaultValue={line.title} /></label>
                        <label className="proposal-span-2">Customer-facing scope<textarea name="contractScope" defaultValue={line.contract_scope ?? ""} rows={3} /></label>
                        <label className="proposal-span-2">Source recommendation<textarea name="description" defaultValue={line.description ?? ""} rows={4} /></label>
                        <label>Section<select name="section" defaultValue={line.section ?? "manual"}>
                          {sectionOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                        </select></label>
                        <label>Quantity<input min="0.01" name="quantity" step="0.01" type="number" defaultValue={line.quantity} /></label>
                        <label>Unit price<input min="0" name="unitPrice" step="0.01" type="number" defaultValue={line.unit_price} /></label>
                        <label className="proposal-checkbox"><input name="included" type="checkbox" defaultChecked={line.included} /> Include in contract total</label>
                        <div className="proposal-line-actions">
                          <PendingSubmitButton className="primary-button" pendingLabel="Saving">Save line</PendingSubmitButton>
                        </div>
                      </form>
                      <form action={deleteProposalLine} className="proposal-delete-form">
                        {hiddenContext(organization.id, jobId, proposal.id)}
                        <input name="lineId" type="hidden" value={line.id} />
                        <PendingSubmitButton className="text-button danger" pendingLabel="Removing">
                          <Trash2 size={14} /> Remove line
                        </PendingSubmitButton>
                      </form>
                    </details>
                  );
                })}
              </div>
            ) : (
              <div className="compact-empty">
                <ReceiptText size={22} />
                <div>
                  <strong>No proposal lines yet</strong>
                  <span>Import recommendations from Findings, or add a manual scope item below.</span>
                </div>
              </div>
            )}

            <details className="proposal-new-line">
              <summary><Plus size={16} /> Add manual item</summary>
              <form action={saveProposalLine} className="proposal-new-line-form">
                {hiddenContext(organization.id, jobId, proposal.id)}
                <div className="proposal-line-form">
                  <label>Title<input name="title" placeholder="Localized treatment, repair allowance, disclosure fee..." /></label>
                  <label>Section<select name="section" defaultValue="manual">
                    {sectionOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select></label>
                  <label className="proposal-span-2">Customer-facing scope<textarea name="contractScope" rows={3} placeholder="Concise scope shown in the work authorization." /></label>
                  <label className="proposal-span-2">Source / internal detail<textarea name="description" rows={3} placeholder="Optional internal source text or detail." /></label>
                  <label>Quantity<input min="0.01" name="quantity" step="0.01" type="number" defaultValue="1" /></label>
                  <label>Unit price<input min="0" name="unitPrice" step="0.01" type="number" defaultValue="0" /></label>
                  <label className="proposal-checkbox"><input name="included" type="checkbox" defaultChecked /> Include in contract total</label>
                  <div className="proposal-line-actions">
                    <PendingSubmitButton className="secondary-button" pendingLabel="Adding">
                      <Plus size={16} /> Add line
                    </PendingSubmitButton>
                  </div>
                </div>
              </form>
            </details>
          </section>

          <aside className="proposal-side">
            <section className="proposal-panel proposal-next-action">
              <p className="eyebrow">Next action</p>
              <h2>{nextAction.title}</h2>
              <p>{nextAction.detail}</p>
              {nextAction.cta === "Import recommended work" ? (
                <form action={importFindingProposalLines}>
                  {hiddenContext(organization.id, jobId, proposal.id)}
                  <PendingSubmitButton className="primary-button" pendingLabel="Importing recommendations">
                    <Import size={16} /> {nextAction.cta}
                  </PendingSubmitButton>
                </form>
              ) : nextAction.cta === "Refresh wording" ? (
                <form action={generateProposalSummary}>
                  {hiddenContext(organization.id, jobId, proposal.id)}
                  <PendingSubmitButton className="primary-button" pendingLabel="Refreshing wording">
                    {nextAction.cta}
                  </PendingSubmitButton>
                </form>
              ) : nextAction.cta === "Approve and generate" ? (
                <form action={approveAndGenerateProposalContractDocument}>
                  {hiddenContext(organization.id, jobId, proposal.id)}
                  <PendingSubmitButton className="primary-button" disabled={!hasIncludedLines || needsSummaryRefresh || (!canApprove && !isApproved)} pendingLabel="Generating contract PDF">
                    {nextAction.cta}
                  </PendingSubmitButton>
                </form>
              ) : (
                <Link className="primary-button" href={`/jobs/${jobId}/send`}><Send size={16} /> {nextAction.cta}</Link>
              )}
            </section>

            <section className="proposal-panel totals-panel">
              <p className="eyebrow">Totals</p>
              <dl>
                <div><dt>Subtotal</dt><dd>{money(proposal.subtotal_amount)}</dd></div>
                <div><dt>Discount</dt><dd>-{money(proposal.discount_amount)}</dd></div>
                <div><dt>Tax</dt><dd>{money(proposal.tax_amount)}</dd></div>
                <div className="total"><dt>Total</dt><dd>{money(proposal.total_amount)}</dd></div>
              </dl>
            </section>

            <section className="proposal-panel">
              <div className="section-heading compact"><div><p className="eyebrow">Approval flow</p><h2>Contract readiness</h2></div></div>
              <div className={`proposal-readiness ${hasCurrentContractPdf ? "ready" : ""}`}>
                {hasCurrentContractPdf ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
                <div>
                  <strong>
                    {!hasIncludedLines
                      ? "Add priced scope first"
                      : needsSummaryRefresh
                        ? "Refresh proposal wording"
                        : hasCurrentContractPdf
                          ? "Current contract ready"
                          : "Contract PDF needed"}
                  </strong>
                  <span>
                    {!hasIncludedLines
                      ? "Import or add at least one included proposal line."
                      : needsSummaryRefresh
                        ? "Summary and line scopes should match the latest pricing and scope."
                        : hasCurrentContractPdf
                          ? "Use Send Center to email the report package or send the contract for signature."
                          : "Generate the signature-ready PDF before using it with Zoho Sign."}
                  </span>
                </div>
              </div>
              {!canApprove && !isApproved ? (
                <p className="proposal-action-help">A manager or administrator must approve and generate the contract PDF.</p>
              ) : null}
            </section>

            <section className="proposal-panel">
              <div className="section-heading compact"><div><p className="eyebrow">Contract document</p><h2>Current PDF</h2></div></div>
              {latestProposalVersion ? (
                <div className={`proposal-document-state ${latestProposalVersionOutdated ? "outdated" : ""}`}>
                  <strong>{latestProposalVersionOutdated ? "Outdated contract PDF" : "Contract PDF ready"}</strong>
                  <span>Latest generated snapshot: version {latestProposalVersion.version}</span>
                  {latestProposalVersionOutdated ? (
                    <p className="proposal-document-warning">Proposal details changed after this PDF was generated.</p>
                  ) : null}
                  {latestProposalVersion.asset_id ? (
                    <Link className="text-button" href={`/jobs/${jobId}/review/versions/${latestProposalVersion.id}/download`}>Download latest PDF</Link>
                  ) : null}
                </div>
              ) : (
                <p className="panel-empty-copy">No proposal or contract PDF generated yet.</p>
              )}
              {proposalVersions.length ? (
                <details className="proposal-history">
                  <summary>View PDF history</summary>
                  <div className="proposal-mini-version-list">
                  {proposalVersions.map((version) => {
                    const outdated = isVersionOutdated(version);
                    return (
                      <Link className={outdated ? "outdated" : ""} href={`/jobs/${jobId}/review/versions/${version.id}/download`} key={version.id}>
                        Version {version.version}{outdated ? " · Outdated" : ""}
                        <span>{version.generated_at ? new Date(version.generated_at).toLocaleString() : version.status}</span>
                      </Link>
                    );
                  })}
                  </div>
                </details>
              ) : null}
            </section>

            <section className="proposal-panel">
              <div className="section-heading compact"><div><p className="eyebrow">Settings</p><h2>Proposal terms</h2></div></div>
              <form action={saveProposalSettings} className="proposal-settings-form">
                {hiddenContext(organization.id, jobId, proposal.id)}
                <label>Title<input name="title" defaultValue={proposal.title} /></label>
                <label>Customer note<textarea name="customerNote" rows={4} defaultValue={proposal.customer_note ?? ""} /></label>
                <label>Terms<textarea name="terms" rows={5} defaultValue={proposal.terms ?? ""} placeholder="Authorization, payment terms, exclusions, warranty terms..." /></label>
                <div className="proposal-two-fields">
                  <label>Tax rate %<input min="0" name="taxRate" step="0.0001" type="number" defaultValue={proposal.tax_rate} /></label>
                  <label>Discount<input min="0" name="discountAmount" step="0.01" type="number" defaultValue={proposal.discount_amount} /></label>
                </div>
                <PendingSubmitButton className="secondary-button" pendingLabel="Saving settings">Save settings</PendingSubmitButton>
              </form>
            </section>
          </aside>
        </div>
      </main>
    </AppShell>
  );
}
