import Link from "next/link";
import { notFound } from "next/navigation";
import { Check, Download, ExternalLink } from "lucide-react";
import { startCustomerProposalSigning } from "./actions";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import { createAdminClient } from "@/lib/supabase/admin";
import { hashReviewToken } from "@/lib/proposals/review-links";

type CustomerProposalPageProps = {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ error?: string }>;
};

function money(value: number | string | null | undefined) {
  return new Intl.NumberFormat("en-US", { currency: "USD", style: "currency" }).format(Number(value ?? 0));
}

function one<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function documentLabel(kind: "report" | "proposal", version: { version: number } | null) {
  if (!version) return kind === "report" ? "Inspection report" : "Proposal and work authorization";
  return kind === "report" ? `Inspection report v${version.version}` : `Proposal and work authorization v${version.version}`;
}

export default async function CustomerProposalPage({ params, searchParams }: CustomerProposalPageProps) {
  const { token } = await params;
  const messages = await searchParams;
  const supabase = createAdminClient();
  const { data: link } = await supabase
    .from("proposal_review_links")
    .select("*")
    .eq("token_hash", hashReviewToken(token))
    .single();
  if (!link || link.status !== "active") notFound();
  const currentTime = Number(new Date());
  if (new Date(link.expires_at).getTime() < currentTime) {
    await supabase.from("proposal_review_links").update({ status: "expired" }).eq("id", link.id);
    return (
      <main className="customer-proposal-expired">
        <div>
          <h1>This review link has expired</h1>
          <p>Please reply to the email from Trident and our team will send a fresh link.</p>
        </div>
      </main>
    );
  }

  await supabase
    .from("proposal_review_links")
    .update({ last_viewed_at: new Date().toISOString() })
    .eq("id", link.id);

  const [{ data: organization }, { data: job }, { data: proposal }, { data: versions }] = await Promise.all([
    supabase.from("organizations").select("name").eq("id", link.organization_id).single(),
    supabase
      .from("inspection_jobs")
      .select(`
        job_number, report_type, inspection_at,
        properties(street_line_1, street_line_2, city, region, postal_code)
      `)
      .eq("id", link.inspection_job_id)
      .eq("organization_id", link.organization_id)
      .single(),
    supabase
      .from("job_proposals")
      .select(`
        id, title, customer_summary, customer_note, subtotal_amount, discount_amount, tax_amount, total_amount,
        proposal_line_items(id, item_code, section, title, description, contract_scope, quantity, unit_price, included, sort_order)
      `)
      .eq("id", link.proposal_id)
      .eq("organization_id", link.organization_id)
      .single(),
    supabase
      .from("document_versions")
      .select("id, version, documents(kind, title)")
      .eq("organization_id", link.organization_id)
      .in("id", [link.report_document_version_id, link.proposal_document_version_id].filter(Boolean)),
  ]);
  if (!organization || !job || !proposal) notFound();

  const property = one(job.properties);
  const address = [
    property?.street_line_1,
    property?.street_line_2,
    property?.city,
    property?.region,
    property?.postal_code,
  ].filter(Boolean).join(", ");
  const includedLines = [...(proposal.proposal_line_items ?? [])]
    .filter((line) => line.included)
    .sort((a, b) => a.sort_order - b.sort_order);
  const reportVersion = (versions ?? []).find((version) => version.id === link.report_document_version_id) ?? null;
  const proposalVersion = (versions ?? []).find((version) => version.id === link.proposal_document_version_id) ?? null;

  return (
    <main className="customer-proposal-shell">
      <section className="customer-proposal-hero">
        <div className="customer-proposal-hero-inner">
          <div className="customer-proposal-brand">{organization.name}</div>
          <h1>Your inspection documents are ready to review</h1>
          <p>
            Review the termite inspection report, recommended work, and pricing in one place.
            When you are ready, you can open the secure electronic authorization.
          </p>
        </div>
      </section>

      <div className="customer-proposal-main">
        <div className="customer-proposal-content">
          {messages.error ? <div className="customer-proposal-alert error">{messages.error}</div> : null}
          <section className="customer-proposal-panel">
            <p className="eyebrow">Inspection</p>
            <h2>{address || `Report #${job.job_number}`}</h2>
            <p>Report #{job.job_number} · {job.report_type?.replaceAll("_", " ")}</p>
            <div className="customer-doc-list">
              {link.report_document_version_id ? (
                <Link className="customer-doc-card" href={`/customer/proposals/${token}/documents/${link.report_document_version_id}`}>
                  <div><strong>{documentLabel("report", reportVersion)}</strong><span>Full termite inspection report PDF</span></div>
                  <Download size={18} />
                </Link>
              ) : null}
              {link.proposal_document_version_id ? (
                <Link className="customer-doc-card" href={`/customer/proposals/${token}/documents/${link.proposal_document_version_id}`}>
                  <div><strong>{documentLabel("proposal", proposalVersion)}</strong><span>Formal work authorization PDF</span></div>
                  <Download size={18} />
                </Link>
              ) : null}
            </div>
            <div className="customer-review-order" aria-label="Suggested review order">
              <span><strong>1</strong> Read the inspection report</span>
              <span><strong>2</strong> Review recommended work and pricing</span>
              <span><strong>3</strong> Open the authorization when ready</span>
            </div>
          </section>

          <section className="customer-proposal-panel">
            <p className="eyebrow">Plain-English review</p>
            <h2>Recommended next steps</h2>
            <p className="customer-summary-text">
              {proposal.customer_summary || proposal.customer_note || "Please review the attached inspection report and work authorization. If anything is unclear, reply to the email and our team will help before you decide how to proceed."}
            </p>
          </section>

          <section className="customer-proposal-panel">
            <p className="eyebrow">Work authorization</p>
            <h2>Included proposal items</h2>
            <div className="customer-line-list">
              {includedLines.map((line) => {
                const amount = Number(line.quantity ?? 0) * Number(line.unit_price ?? 0);
                return (
                  <article className="customer-line-item" key={line.id}>
                    <div>
                      <strong>{[line.item_code, line.title].filter(Boolean).join(" - ")}</strong>
                      {line.contract_scope || line.description ? <span>{line.contract_scope || line.description}</span> : null}
                    </div>
                    <div className={`customer-line-price${amount === 0 ? " included" : ""}`}>
                      {amount === 0 ? "Included" : money(amount)}
                    </div>
                  </article>
                );
              })}
            </div>
            <div className="customer-total-summary">
              <div>
                <span>Work authorization total</span>
                <small>{includedLines.length} included item{includedLines.length === 1 ? "" : "s"}</small>
              </div>
              <strong>{money(proposal.total_amount)}</strong>
            </div>
          </section>
        </div>

        <aside className="customer-proposal-panel customer-sign-panel">
          <p className="eyebrow">Next step</p>
          <h2>Ready when you are</h2>
          <div className="customer-next-step-list">
            <span><Check size={15} /> You have reviewed the inspection report</span>
            <span><Check size={15} /> You understand the recommended work and pricing</span>
            <span><Check size={15} /> You are ready to open the secure authorization</span>
          </div>
          <form action={startCustomerProposalSigning}>
            <input name="token" type="hidden" value={token} />
            <PendingSubmitButton className="primary-button" pendingLabel="Opening secure authorization...">
              <ExternalLink size={17} /> Review authorization
            </PendingSubmitButton>
          </form>
          <p className="customer-sign-note">
            This opens the formal work authorization for {link.signer_name}. Signing is the final step only when you choose to proceed.
          </p>
        </aside>
      </div>
    </main>
  );
}
