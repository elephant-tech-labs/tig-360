import Link from "next/link";
import { notFound } from "next/navigation";
import { Download, ExternalLink, FileCheck2, MessageCircleQuestion, ShieldCheck } from "lucide-react";
import { startCustomerProposalSigning } from "./actions";
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

function linePrice(line: {
  section: string | null;
  source_type: string;
  quantity: number | string | null;
  unit_price: number | string | null;
}) {
  const amount = Number(line.quantity ?? 0) * Number(line.unit_price ?? 0);
  if (amount > 0) return money(amount);
  if (line.section === "further_inspection") return "Further inspection";
  return line.source_type === "manual" ? "Not separately priced" : "Included";
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
  // This server-rendered route must evaluate link expiry at request time.
  // eslint-disable-next-line react-hooks/purity
  if (new Date(link.expires_at).getTime() < Date.now()) {
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

  const [
    { data: organization },
    { data: reportProfile },
    { data: job },
    { data: proposal },
    { data: versions },
  ] = await Promise.all([
    supabase.from("organizations").select("name").eq("id", link.organization_id).single(),
    supabase
      .from("organization_report_profiles")
      .select("email, phone")
      .eq("organization_id", link.organization_id)
      .maybeSingle(),
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
        proposal_line_items(
          id, item_code, section, source_type, title, description, contract_scope,
          quantity, unit_price, included, sort_order
        )
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
  const contactEmail = reportProfile?.email ?? null;
  const contactPhone = reportProfile?.phone ?? null;

  return (
    <main className="customer-proposal-shell">
      <header className="customer-proposal-header">
        <div className="customer-proposal-header-inner">
          <div className="customer-proposal-brand">{organization.name}</div>
          <p className="eyebrow">Inspection review</p>
          <h1>{address || `Report #${job.job_number}`}</h1>
          <div className="customer-proposal-meta">
            <span>Report #{job.job_number}</span>
            <span>{job.report_type?.replaceAll("_", " ")}</span>
          </div>
        </div>
      </header>

      <div className="customer-proposal-main">
        {messages.error ? <div className="customer-proposal-alert error">{messages.error}</div> : null}

        <section className="customer-proposal-panel customer-intro-panel">
          <p className="eyebrow">Plain-English review</p>
          <h2>What we found and what we recommend</h2>
          <p className="customer-summary-text">
            {proposal.customer_summary || proposal.customer_note || "Please review the inspection report and recommended work below. If anything is unclear, reply to the email and our team will help before you decide how to proceed."}
          </p>
        </section>

        <section className="customer-proposal-panel">
          <div className="customer-section-heading">
            <div>
              <p className="eyebrow">Recommended work</p>
              <h2>Included proposal items</h2>
            </div>
            <span>{includedLines.length} {includedLines.length === 1 ? "item" : "items"}</span>
          </div>
          <div className="customer-line-list">
            {includedLines.map((line) => (
              <article className="customer-line-item" key={line.id}>
                <div>
                  <div className="customer-line-source">
                    {line.source_type === "manual" ? "Custom item" : "Inspection recommendation"}
                  </div>
                  <strong>{[line.item_code, line.title].filter(Boolean).join(" - ")}</strong>
                  {line.contract_scope || line.description ? <span>{line.contract_scope || line.description}</span> : null}
                </div>
                <div className="customer-line-price">{linePrice(line)}</div>
              </article>
            ))}
          </div>

          <div className="customer-price-summary">
            <div>
              <span>Total proposed work</span>
              <small>Review the complete scope above before authorizing.</small>
            </div>
            <strong>{money(proposal.total_amount)}</strong>
          </div>
        </section>

        <section className="customer-proposal-panel customer-authorization-panel">
          <div className="customer-authorization-copy">
            <div className="customer-icon-box"><ShieldCheck size={22} /></div>
            <div>
              <p className="eyebrow">Your decision</p>
              <h2>Ready to authorize the work?</h2>
              <p>
                Open the secure work authorization to review the formal terms and sign electronically.
                Nothing is scheduled or authorized until you sign.
              </p>
            </div>
          </div>
          <form action={startCustomerProposalSigning} target="_blank">
            <input name="token" type="hidden" value={token} />
            <button className="primary-button" type="submit">
              <ExternalLink size={17} /> Review and authorize securely
            </button>
          </form>
          <p className="customer-sign-note">
            Zoho Sign opens in a new tab for {link.signer_name}. You can read the formal authorization before signing.
          </p>
        </section>

        <section className="customer-proposal-panel customer-help-panel">
          <MessageCircleQuestion size={22} />
          <div>
            <h2>Questions before you decide?</h2>
            <p>We are happy to explain the report or recommended work before you authorize anything.</p>
            <div className="customer-contact-links">
              {contactEmail ? <a href={`mailto:${contactEmail}`}>{contactEmail}</a> : null}
              {contactPhone ? <a href={`tel:${contactPhone}`}>{contactPhone}</a> : null}
            </div>
          </div>
        </section>

        <section className="customer-proposal-panel customer-documents-panel">
          <div className="customer-section-heading">
            <div>
              <p className="eyebrow">Reference documents</p>
              <h2>Download the complete details</h2>
            </div>
            <FileCheck2 size={22} />
          </div>
          <div className="customer-doc-list">
            {link.report_document_version_id ? (
              <Link className="customer-doc-card" href={`/customer/proposals/${token}/documents/${link.report_document_version_id}`}>
                <div><strong>{documentLabel("report", reportVersion)}</strong><span>Full termite inspection report PDF</span></div>
                <Download size={18} />
              </Link>
            ) : null}
            {link.proposal_document_version_id ? (
              <Link className="customer-doc-card" href={`/customer/proposals/${token}/documents/${link.proposal_document_version_id}`}>
                <div><strong>{documentLabel("proposal", proposalVersion)}</strong><span>Proposal and work authorization PDF</span></div>
                <Download size={18} />
              </Link>
            ) : null}
          </div>
        </section>
      </div>
    </main>
  );
}
