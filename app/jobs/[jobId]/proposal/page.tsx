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
import { JobWorkspaceHeader } from "@/components/job-workspace-header";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import { getCurrentContext } from "@/lib/current-organization";
import {
  deleteProposalLine,
  generateProposalSummary,
  generateProposalContractDocument,
  importFindingProposalLines,
  saveProposalLine,
  saveProposalSettings,
  saveProposalSummary,
  setProposalStatus,
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
  quantity: number;
  unit_price: number;
  included: boolean;
  sort_order: number;
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
  if (source.provider === "fallback") return `Fallback summary${source.reason ? `: ${source.reason}` : ""}`;
  return source.provider ? `${source.provider} summary` : null;
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

  const [{ data: proposal, error: proposalError }, { count: findingRecommendationCount }, { data: proposalDocument }] = await Promise.all([
    supabase
      .from("job_proposals")
      .select(`
        id, status, title, customer_note, terms, tax_rate, discount_amount,
        customer_summary, customer_summary_generated_at, customer_summary_source,
        subtotal_amount, tax_amount,
        total_amount, approved_at, updated_at,
        proposal_line_items(
          id, source_type, item_code, section, title, description, quantity, unit_price,
          included, sort_order, findings(code, title)
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
  ]);

  if (proposalError || !proposal) throw new Error(proposalError?.message ?? "Proposal not found.");
  const property = Array.isArray(job.properties) ? job.properties[0] : job.properties;
  const lines = [...((proposal.proposal_line_items ?? []) as ProposalLine[])]
    .sort((a, b) => a.sort_order - b.sort_order);
  const includedLines = lines.filter((line) => line.included);
  const canApprove = membership.role === "administrator" || membership.role === "manager";
  const hasIncludedLines = includedLines.length > 0;
  const isReady = proposal.status === "ready";
  const isApproved = proposal.status === "approved";
  const readyForContract = isApproved;
  const canMarkReady = hasIncludedLines && !isReady && !isApproved;
  const canGenerateContract = isApproved;
  const proposalVersionsRaw = proposalDocument?.document_versions ?? [];
  const proposalVersions = ([...(Array.isArray(proposalVersionsRaw) ? proposalVersionsRaw : [proposalVersionsRaw])] as ProposalDocumentVersion[])
    .sort((a, b) => b.version - a.version);
  const latestProposalVersion = proposalVersions[0] ?? null;
  const proposalUpdatedAt = proposal.updated_at ? new Date(proposal.updated_at).getTime() : 0;
  const isVersionOutdated = (version: ProposalDocumentVersion) => {
    if (!version.generated_at || !proposalUpdatedAt) return false;
    return new Date(version.generated_at).getTime() < proposalUpdatedAt;
  };
  const latestProposalVersionOutdated = latestProposalVersion ? isVersionOutdated(latestProposalVersion) : false;
  const customerSummarySource = summarySourceLabel(proposal.customer_summary_source);

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

      <main className="proposal-page">
        {messages.error ? <div className="form-alert error"><AlertTriangle size={17} /> {messages.error}</div> : null}
        {messages.saved ? <div className="form-alert success"><CheckCircle2 size={17} /> {messages.saved}</div> : null}

        <header className="proposal-heading">
          <div>
            <p className="eyebrow">Proposal and contract</p>
            <h1>Build the work authorization</h1>
            <p>Turn recommendations into priced work lines, approve the proposal, then use it for contract delivery.</p>
          </div>
          <div className="proposal-heading-actions">
            <form action={importFindingProposalLines}>
              {hiddenContext(organization.id, jobId, proposal.id)}
              <PendingSubmitButton className="secondary-button" pendingLabel="Importing">
                <Import size={16} /> Import findings
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
                  <PendingSubmitButton className="secondary-button" disabled={!hasIncludedLines} pendingLabel="Writing">
                    Prepare summary
                  </PendingSubmitButton>
                </form>
              </div>
              <p className="proposal-summary-help">
                This is the plain-English explanation used in the customer review page and contract PDF before the formal work authorization.
              </p>
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
                  <PendingSubmitButton className="secondary-button" pendingLabel="Saving">Save summary</PendingSubmitButton>
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
                        <label className="proposal-span-2">Description<textarea name="description" defaultValue={line.description ?? ""} rows={4} /></label>
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
                  <label className="proposal-span-2">Description<textarea name="description" rows={3} placeholder="Describe what is included in this work authorization." /></label>
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
              <div className={`proposal-readiness ${readyForContract ? "ready" : ""}`}>
                {readyForContract ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
                <div>
                  <strong>{readyForContract ? "Approved for contract" : hasIncludedLines ? "Ready for manager approval" : "Add priced scope first"}</strong>
                  <span>{readyForContract ? "This proposal can be used as the contract package source." : "Approve once pricing and scope are final."}</span>
                </div>
              </div>
              <div className="proposal-status-actions">
                <form action={setProposalStatus}>
                  {hiddenContext(organization.id, jobId, proposal.id)}
                  <input name="status" type="hidden" value="ready" />
                  <PendingSubmitButton className="secondary-button" disabled={!canMarkReady} pendingLabel="Marking ready">
                    {isApproved ? "Already approved" : isReady ? "Marked ready" : "Mark ready"}
                  </PendingSubmitButton>
                </form>
                <form action={setProposalStatus}>
                  {hiddenContext(organization.id, jobId, proposal.id)}
                  <input name="status" type="hidden" value="approved" />
                  <PendingSubmitButton className="primary-button" disabled={!hasIncludedLines || !canApprove || isApproved} pendingLabel="Approving">
                    {isApproved ? "Proposal approved" : "Approve proposal"}
                  </PendingSubmitButton>
                </form>
                <form action={generateProposalContractDocument}>
                  {hiddenContext(organization.id, jobId, proposal.id)}
                  <PendingSubmitButton className="secondary-button" disabled={!canGenerateContract} pendingLabel="Generating PDF">Generate contract PDF</PendingSubmitButton>
                </form>
                <p className="proposal-action-help">
                  {isApproved
                    ? latestProposalVersionOutdated
                      ? "Pricing or scope changed after the latest contract PDF. Generate a fresh version before sending."
                      : "Generate a contract PDF after final approval, and again whenever pricing or scope changes."
                    : "Approve the proposal before generating a contract PDF."}
                </p>
              </div>
            </section>

            <section className="proposal-panel">
              <div className="section-heading compact"><div><p className="eyebrow">Contract document</p><h2>Generated versions</h2></div></div>
              {latestProposalVersion ? (
                <div className={`proposal-document-state ${latestProposalVersionOutdated ? "outdated" : ""}`}>
                  <strong>Version {latestProposalVersion.version}{latestProposalVersionOutdated ? " · Outdated" : ""}</strong>
                  <span>{latestProposalVersion.status} · {latestProposalVersion.approval_status}</span>
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
              {proposalVersions.length > 1 ? (
                <div className="proposal-mini-version-list">
                  {proposalVersions.slice(1).map((version) => {
                    const outdated = isVersionOutdated(version);
                    return (
                      <Link className={outdated ? "outdated" : ""} href={`/jobs/${jobId}/review/versions/${version.id}/download`} key={version.id}>
                        Version {version.version}{outdated ? " · Outdated" : ""}
                        <span>{version.generated_at ? new Date(version.generated_at).toLocaleString() : version.status}</span>
                      </Link>
                    );
                  })}
                </div>
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
