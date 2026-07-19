import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { parseRichDocument } from "@/lib/report-content";
import { buildProposalSnapshotHash } from "@/lib/proposals/snapshot-hash";
import type { ProposalSnapshot } from "@/lib/proposals/types";

function one<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export async function loadProposalSnapshot(
  supabase: SupabaseClient,
  organization: { id: string; name: string },
  jobId: string,
  proposalId: string,
): Promise<ProposalSnapshot> {
  const [
    { data: proposal, error: proposalError },
    { data: job, error: jobError },
    { data: reportProfile },
    { data: contractBlocks, error: blocksError },
  ] = await Promise.all([
    supabase
      .from("job_proposals")
      .select(`
        id, status, title, customer_note, customer_summary, terms,
        subtotal_amount, discount_amount, tax_amount, total_amount,
        proposal_line_items(
          id, source_type, item_code, section, title, description, contract_scope, quantity, unit_price,
          included, sort_order
        )
      `)
      .eq("id", proposalId)
      .eq("inspection_job_id", jobId)
      .eq("organization_id", organization.id)
      .single(),
    supabase
      .from("inspection_jobs")
      .select(`
        id, job_number, report_type, inspection_at,
        properties(street_line_1, street_line_2, city, region, postal_code),
        job_parties(
          role,
          contacts(first_name, last_name, email, companies(name))
        )
      `)
      .eq("id", jobId)
      .eq("organization_id", organization.id)
      .single(),
    supabase
      .from("organization_report_profiles")
      .select("*")
      .eq("organization_id", organization.id)
      .maybeSingle(),
    supabase
      .from("report_content_blocks")
      .select("id, title, body, body_json, sort_order")
      .eq("organization_id", organization.id)
      .eq("is_active", true)
      .eq("placement", "contract")
      .order("sort_order"),
  ]);

  if (proposalError || !proposal) throw new Error(proposalError?.message ?? "Proposal not found.");
  if (jobError || !job) throw new Error(jobError?.message ?? "Inspection job not found.");
  if (blocksError) throw new Error(blocksError.message);
  if (proposal.status !== "approved") throw new Error("Approve the proposal before generating the contract document.");

  const property = one(job.properties);
  if (!property) throw new Error("Property details were not found.");
  const includedLines = [...(proposal.proposal_line_items ?? [])]
    .filter((line) => line.included)
    .sort((a, b) => a.sort_order - b.sort_order);
  if (!includedLines.length) throw new Error("Add at least one included line before generating a contract document.");

  const snapshot: ProposalSnapshot = {
    schemaVersion: 1,
    capturedAt: new Date().toISOString(),
    organization: {
      id: organization.id,
      name: organization.name,
      legalName: reportProfile?.legal_name || organization.name,
      streetLine1: reportProfile?.street_line_1 ?? null,
      streetLine2: reportProfile?.street_line_2 ?? null,
      city: reportProfile?.city ?? null,
      region: reportProfile?.region ?? null,
      postalCode: reportProfile?.postal_code ?? null,
      phone: reportProfile?.phone ?? null,
      email: reportProfile?.email ?? null,
      website: reportProfile?.website ?? null,
      registrationNumber: reportProfile?.registration_number ?? null,
    },
    job: {
      id: job.id,
      number: Number(job.job_number),
      reportType: job.report_type,
      inspectionAt: job.inspection_at,
    },
    property: {
      streetLine1: property.street_line_1,
      streetLine2: property.street_line_2,
      city: property.city,
      region: property.region,
      postalCode: property.postal_code,
    },
    proposal: {
      id: proposal.id,
      title: proposal.title,
      status: proposal.status,
      customerNote: proposal.customer_note,
      customerSummary: proposal.customer_summary,
      terms: proposal.terms,
      subtotal: Number(proposal.subtotal_amount ?? 0),
      discount: Number(proposal.discount_amount ?? 0),
      tax: Number(proposal.tax_amount ?? 0),
      total: Number(proposal.total_amount ?? 0),
    },
    parties: (job.job_parties ?? []).flatMap((party) => {
      const contact = one(party.contacts);
      if (!contact) return [];
      const company = one(contact.companies);
      return [{
        role: party.role,
        name: `${contact.first_name} ${contact.last_name}`.trim(),
        company: company?.name ?? null,
        email: contact.email,
      }];
    }),
    lines: includedLines.map((line) => ({
      id: line.id,
      sourceType: line.source_type,
      code: line.item_code,
      section: line.section,
      title: line.title,
      description: line.contract_scope || line.description,
      quantity: Number(line.quantity ?? 0),
      unitPrice: Number(line.unit_price ?? 0),
      amount: Number(line.quantity ?? 0) * Number(line.unit_price ?? 0),
    })),
    contractContent: (contractBlocks ?? []).map((block) => ({
      id: block.id,
      title: block.title,
      body: block.body,
      bodyJson: parseRichDocument(block.body_json, block.body),
      sortOrder: block.sort_order,
    })),
  };

  return {
    ...snapshot,
    contentHash: buildProposalSnapshotHash(snapshot),
  };
}
