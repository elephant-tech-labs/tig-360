"use server";

import { createHash } from "node:crypto";
import { renderToBuffer } from "@react-pdf/renderer";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentContext } from "@/lib/current-organization";
import { generateProposalCustomerSummary, type ProposalSummaryInput } from "@/lib/proposals/customer-summary";
import { parseRichDocument } from "@/lib/report-content";
import { ProposalContractPdf } from "@/lib/proposals/pdf-document";
import type { ProposalSnapshot } from "@/lib/proposals/types";
import { createClient } from "@/lib/supabase/server";

function proposalUrl(jobId: string, message?: string, type: "saved" | "error" = "saved") {
  const params = new URLSearchParams();
  if (message) params.set(type, message);
  return `/jobs/${jobId}/proposal${params.toString() ? `?${params.toString()}` : ""}`;
}

function parseMoney(value: FormDataEntryValue | null) {
  const parsed = Number(String(value ?? "0").replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function importFindingProposalLines(formData: FormData) {
  const organizationId = String(formData.get("organizationId") ?? "");
  const jobId = String(formData.get("jobId") ?? "");
  const proposalId = String(formData.get("proposalId") ?? "");
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("import_proposal_lines_from_findings", {
    target_organization_id: organizationId,
    target_job_id: jobId,
    target_proposal_id: proposalId,
  });

  if (error) redirect(proposalUrl(jobId, error.message, "error"));
  revalidatePath(`/jobs/${jobId}/proposal`);
  redirect(proposalUrl(jobId, data ? `Imported ${data} recommendation${data === 1 ? "" : "s"}.` : "No new recommendations to import."));
}

export async function saveProposalLine(formData: FormData) {
  const organizationId = String(formData.get("organizationId") ?? "");
  const jobId = String(formData.get("jobId") ?? "");
  const proposalId = String(formData.get("proposalId") ?? "");
  const lineId = String(formData.get("lineId") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const section = String(formData.get("section") ?? "manual");
  const quantity = parseMoney(formData.get("quantity"));
  const unitPrice = parseMoney(formData.get("unitPrice"));
  const included = formData.get("included") === "on";
  const supabase = await createClient();

  const { error } = await supabase.rpc("save_proposal_line_item", {
    target_organization_id: organizationId,
    target_job_id: jobId,
    target_proposal_id: proposalId,
    target_line_id: lineId || null,
    line_title: title,
    line_description: description,
    line_section: section,
    line_quantity: quantity,
    line_unit_price: unitPrice,
    line_included: included,
  });

  if (error) redirect(proposalUrl(jobId, error.message, "error"));
  revalidatePath(`/jobs/${jobId}/proposal`);
  revalidatePath(`/jobs/${jobId}/review`);
  redirect(proposalUrl(jobId, lineId ? "Line item updated." : "Line item added."));
}

export async function deleteProposalLine(formData: FormData) {
  const organizationId = String(formData.get("organizationId") ?? "");
  const jobId = String(formData.get("jobId") ?? "");
  const proposalId = String(formData.get("proposalId") ?? "");
  const lineId = String(formData.get("lineId") ?? "");
  const supabase = await createClient();

  const { error } = await supabase.rpc("delete_proposal_line_item", {
    target_organization_id: organizationId,
    target_proposal_id: proposalId,
    target_line_id: lineId,
  });

  if (error) redirect(proposalUrl(jobId, error.message, "error"));
  revalidatePath(`/jobs/${jobId}/proposal`);
  revalidatePath(`/jobs/${jobId}/review`);
  redirect(proposalUrl(jobId, "Line item removed."));
}

export async function saveProposalSettings(formData: FormData) {
  const organizationId = String(formData.get("organizationId") ?? "");
  const jobId = String(formData.get("jobId") ?? "");
  const proposalId = String(formData.get("proposalId") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const customerNote = String(formData.get("customerNote") ?? "").trim();
  const terms = String(formData.get("terms") ?? "").trim();
  const taxRate = parseMoney(formData.get("taxRate"));
  const discountAmount = parseMoney(formData.get("discountAmount"));
  const supabase = await createClient();

  const { error } = await supabase.rpc("update_job_proposal_settings", {
    target_organization_id: organizationId,
    target_job_id: jobId,
    target_proposal_id: proposalId,
    proposal_title: title,
    proposal_customer_note: customerNote,
    proposal_terms: terms,
    proposal_tax_rate: taxRate,
    proposal_discount_amount: discountAmount,
  });

  if (error) redirect(proposalUrl(jobId, error.message, "error"));
  revalidatePath(`/jobs/${jobId}/proposal`);
  redirect(proposalUrl(jobId, "Proposal settings saved."));
}

async function loadProposalSummaryInput(
  supabase: Awaited<ReturnType<typeof createClient>>,
  organization: { id: string; name: string },
  jobId: string,
  proposalId: string,
): Promise<ProposalSummaryInput> {
  const [{ data: proposal, error: proposalError }, { data: job, error: jobError }] = await Promise.all([
    supabase
      .from("job_proposals")
      .select(`
        total_amount,
        proposal_line_items(item_code, section, title, description, quantity, unit_price, included, sort_order)
      `)
      .eq("id", proposalId)
      .eq("inspection_job_id", jobId)
      .eq("organization_id", organization.id)
      .single(),
    supabase
      .from("inspection_jobs")
      .select(`
        report_type,
        properties(street_line_1, street_line_2, city, region, postal_code)
      `)
      .eq("id", jobId)
      .eq("organization_id", organization.id)
      .single(),
  ]);
  if (proposalError || !proposal) throw new Error(proposalError?.message ?? "Proposal not found.");
  if (jobError || !job) throw new Error(jobError?.message ?? "Inspection job not found.");
  const property = one(job.properties);
  if (!property) throw new Error("Property details were not found.");
  const address = [
    property.street_line_1,
    property.street_line_2,
    property.city,
    property.region,
    property.postal_code,
  ].filter(Boolean).join(", ");
  return {
    companyName: organization.name,
    propertyAddress: address,
    reportType: job.report_type,
    total: Number(proposal.total_amount ?? 0),
    lines: [...(proposal.proposal_line_items ?? [])]
      .filter((line) => line.included)
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((line) => ({
        code: line.item_code,
        section: line.section,
        title: line.title,
        description: line.description,
        amount: Number(line.quantity ?? 0) * Number(line.unit_price ?? 0),
      })),
  };
}

export async function saveProposalSummary(formData: FormData) {
  const jobId = String(formData.get("jobId") ?? "");
  const proposalId = String(formData.get("proposalId") ?? "");
  const summary = String(formData.get("customerSummary") ?? "").trim();
  if (!jobId || !proposalId) redirect("/jobs");
  const { supabase, organization } = await getCurrentContext();
  const { error } = await supabase
    .from("job_proposals")
    .update({
      customer_summary: summary || null,
      customer_summary_generated_at: summary ? new Date().toISOString() : null,
      customer_summary_source: summary ? { provider: "manual" } : {},
    })
    .eq("id", proposalId)
    .eq("inspection_job_id", jobId)
    .eq("organization_id", organization.id);
  if (error) redirect(proposalUrl(jobId, error.message, "error"));
  revalidatePath(`/jobs/${jobId}/proposal`);
  revalidatePath(`/jobs/${jobId}/send`);
  redirect(proposalUrl(jobId, "Customer summary saved."));
}

export async function generateProposalSummary(formData: FormData) {
  const jobId = String(formData.get("jobId") ?? "");
  const proposalId = String(formData.get("proposalId") ?? "");
  if (!jobId || !proposalId) redirect("/jobs");
  const { supabase, organization } = await getCurrentContext();

  let summary: Awaited<ReturnType<typeof generateProposalCustomerSummary>>;
  try {
    const input = await loadProposalSummaryInput(supabase, organization, jobId, proposalId);
    if (!input.lines.length) throw new Error("Add included proposal lines before generating a customer summary.");
    summary = await generateProposalCustomerSummary(input);
  } catch (error) {
    redirect(proposalUrl(jobId, error instanceof Error ? error.message : "Unable to generate proposal summary.", "error"));
  }
  if (summary.source.provider !== "openai") {
    const reason = "reason" in summary.source ? summary.source.reason : "OpenAI did not return a summary.";
    redirect(proposalUrl(
      jobId,
      `AI summary was not generated. ${reason} Check OPENAI_API_KEY, OPENAI_MODEL, and redeploy Vercel.`,
      "error",
    ));
  }

  const { error } = await supabase
    .from("job_proposals")
    .update({
      customer_summary: summary.text,
      customer_summary_generated_at: new Date().toISOString(),
      customer_summary_source: summary.source,
    })
    .eq("id", proposalId)
    .eq("inspection_job_id", jobId)
    .eq("organization_id", organization.id);
  if (error) redirect(proposalUrl(jobId, error.message, "error"));
  revalidatePath(`/jobs/${jobId}/proposal`);
  revalidatePath(`/jobs/${jobId}/send`);
  redirect(proposalUrl(jobId, "Customer summary prepared."));
}

export async function setProposalStatus(formData: FormData) {
  const organizationId = String(formData.get("organizationId") ?? "");
  const jobId = String(formData.get("jobId") ?? "");
  const proposalId = String(formData.get("proposalId") ?? "");
  const status = String(formData.get("status") ?? "draft");
  const supabase = await createClient();

  const { error } = await supabase.rpc("set_job_proposal_status", {
    target_organization_id: organizationId,
    target_job_id: jobId,
    target_proposal_id: proposalId,
    next_status: status,
  });

  if (error) redirect(proposalUrl(jobId, error.message, "error"));
  revalidatePath(`/jobs/${jobId}/proposal`);
  revalidatePath(`/jobs/${jobId}/send`);
  redirect(proposalUrl(jobId, `Proposal marked ${status.replaceAll("_", " ")}.`));
}

function one<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

async function loadProposalSnapshot(
  supabase: Awaited<ReturnType<typeof createClient>>,
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
          id, item_code, section, title, description, quantity, unit_price,
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

  return {
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
      code: line.item_code,
      section: line.section,
      title: line.title,
      description: line.description,
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
}

export async function generateProposalContractDocument(formData: FormData) {
  const jobId = String(formData.get("jobId") ?? "");
  const proposalId = String(formData.get("proposalId") ?? "");
  if (!jobId || !proposalId) redirect("/jobs");

  const { supabase, organization } = await getCurrentContext();

  let snapshot: ProposalSnapshot;
  try {
    snapshot = await loadProposalSnapshot(supabase, organization, jobId, proposalId);
  } catch (error) {
    redirect(proposalUrl(jobId, error instanceof Error ? error.message : "Unable to load proposal.", "error"));
  }

  const { data: started, error: startError } = await supabase.rpc("begin_proposal_document_version", {
    target_organization_id: organization.id,
    target_job_id: jobId,
    target_proposal_id: proposalId,
    proposal_snapshot: snapshot,
  });
  if (startError || !started?.versionId) {
    redirect(proposalUrl(jobId, startError?.message ?? "Unable to start proposal document generation.", "error"));
  }

  const versionId = String(started.versionId);
  const version = Number(started.version);
  const storagePath = `${organization.id}/${jobId}/proposal-${snapshot.job.number}-v${version}-${versionId}.pdf`;
  const filename = `Proposal_Contract_${snapshot.job.number}_v${version}.pdf`;

  try {
    const pdfBuffer = await renderToBuffer(<ProposalContractPdf snapshot={snapshot} />);
    const checksum = createHash("sha256").update(pdfBuffer).digest("hex");
    const { error: uploadError } = await supabase.storage
      .from("report-pdfs")
      .upload(storagePath, pdfBuffer, {
        contentType: "application/pdf",
        upsert: false,
      });
    if (uploadError) throw uploadError;

    const { error: completeError } = await supabase.rpc("complete_proposal_document_version", {
      target_organization_id: organization.id,
      target_job_id: jobId,
      target_version_id: versionId,
      storage_path: storagePath,
      original_name: filename,
      file_size: pdfBuffer.length,
      file_checksum: checksum,
    });
    if (completeError) {
      await supabase.storage.from("report-pdfs").remove([storagePath]);
      throw completeError;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Proposal document generation failed.";
    await supabase.rpc("fail_proposal_document_version", {
      target_organization_id: organization.id,
      target_version_id: versionId,
      failure_text: message,
    });
    redirect(proposalUrl(jobId, message, "error"));
  }

  revalidatePath(`/jobs/${jobId}/proposal`);
  revalidatePath(`/jobs/${jobId}/send`);
  redirect(proposalUrl(jobId, `Proposal contract version ${version} generated.`));
}
