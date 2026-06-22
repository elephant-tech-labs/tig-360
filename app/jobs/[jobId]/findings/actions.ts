"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type FindingRecommendationInput = {
  description: string;
  estimatedCost: string;
};

export type SaveFindingInput = {
  organizationId: string;
  jobId: string;
  findingId?: string | null;
  entryType: "finding" | "note";
  areaCode?: number | null;
  findingLetter: string;
  findingText: string;
  classification?: string | null;
  notePlacement?: "before" | "after" | null;
  sourceTemplateId?: string | null;
  recommendations: FindingRecommendationInput[];
};

export type FindingMutationResult =
  | { ok: true; findingId?: string }
  | { ok: false; message: string };

async function resetFindingsStatus(
  supabase: Awaited<ReturnType<typeof createClient>>,
  organizationId: string,
  jobId: string,
) {
  return supabase.rpc("set_job_findings_status", {
    target_organization_id: organizationId,
    target_job_id: jobId,
    status_value: "draft",
  });
}

export async function saveFindingEntry(
  input: SaveFindingInput,
): Promise<FindingMutationResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("save_finding_entry", {
    target_organization_id: input.organizationId,
    target_job_id: input.jobId,
    target_finding_id: input.findingId || null,
    finding_entry_type: input.entryType,
    finding_area_code: input.entryType === "finding" ? input.areaCode : null,
    finding_letter_value: input.findingLetter,
    finding_text_value: input.findingText,
    finding_classification: input.entryType === "finding" ? input.classification : "note",
    finding_note_placement: input.entryType === "note" ? input.notePlacement : null,
    finding_source_template_id: input.sourceTemplateId || null,
    recommendation_items: input.entryType === "finding" ? input.recommendations : [],
  });

  if (error) return { ok: false, message: error.message };
  const { error: statusError } = await resetFindingsStatus(supabase, input.organizationId, input.jobId);
  if (statusError) return { ok: false, message: statusError.message };
  revalidatePath(`/jobs/${input.jobId}`);
  revalidatePath(`/jobs/${input.jobId}/findings`);
  return { ok: true, findingId: data ?? undefined };
}

export async function saveFindingSummary(
  input: {
    organizationId: string;
    jobId: string;
    subterraneanTermites: boolean;
    drywoodTermites: boolean;
    fungusDryrot: boolean;
    otherFindings: boolean;
    furtherInspection: boolean;
  },
): Promise<FindingMutationResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("save_job_finding_summary", {
    target_organization_id: input.organizationId,
    target_job_id: input.jobId,
    has_subterranean_termites: input.subterraneanTermites,
    has_drywood_termites: input.drywoodTermites,
    has_fungus_dryrot: input.fungusDryrot,
    has_other_findings: input.otherFindings,
    needs_further_inspection: input.furtherInspection,
  });
  if (error) return { ok: false, message: error.message };
  const { error: statusError } = await resetFindingsStatus(supabase, input.organizationId, input.jobId);
  if (statusError) return { ok: false, message: statusError.message };
  revalidatePath(`/jobs/${input.jobId}/findings`);
  return { ok: true };
}

export async function setFindingArchived(input: {
  organizationId: string;
  jobId: string;
  findingId: string;
  archived: boolean;
}): Promise<FindingMutationResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_finding_archived", {
    target_organization_id: input.organizationId,
    target_finding_id: input.findingId,
    should_archive: input.archived,
  });
  if (error) return { ok: false, message: error.message };
  const { error: statusError } = await resetFindingsStatus(supabase, input.organizationId, input.jobId);
  if (statusError) return { ok: false, message: statusError.message };
  revalidatePath(`/jobs/${input.jobId}`);
  revalidatePath(`/jobs/${input.jobId}/findings`);
  return { ok: true };
}

export async function moveFindingEntry(input: {
  organizationId: string;
  jobId: string;
  findingId: string;
  movement: "up" | "down";
}): Promise<FindingMutationResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("move_finding_entry", {
    target_organization_id: input.organizationId,
    target_finding_id: input.findingId,
    movement: input.movement,
  });
  if (error) return { ok: false, message: error.message };
  const { error: statusError } = await resetFindingsStatus(supabase, input.organizationId, input.jobId);
  if (statusError) return { ok: false, message: statusError.message };
  revalidatePath(`/jobs/${input.jobId}/findings`);
  return { ok: true };
}

export async function setFindingsStatus(input: {
  organizationId: string;
  jobId: string;
  status: "draft" | "complete";
}): Promise<FindingMutationResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_job_findings_status", {
    target_organization_id: input.organizationId,
    target_job_id: input.jobId,
    status_value: input.status,
  });
  if (error) return { ok: false, message: error.message };
  revalidatePath(`/jobs/${input.jobId}`);
  revalidatePath(`/jobs/${input.jobId}/findings`);
  revalidatePath(`/jobs/${input.jobId}/review`);
  return { ok: true };
}

export async function saveTemplateFromEntry(input: {
  organizationId: string;
  code: string;
  title: string;
  areaCode: number;
  findingText: string;
  recommendationText: string;
  classification: string;
  quotePrice: string;
}): Promise<FindingMutationResult> {
  if (!input.code.trim()) return { ok: false, message: "Template code is required." };
  const supabase = await createClient();
  const { error } = await supabase.from("finding_templates").insert({
    organization_id: input.organizationId,
    template_code: input.code.trim(),
    title: input.title.trim() || null,
    area_code: input.areaCode,
    finding_text: input.findingText.trim() || null,
    recommendation_text: input.recommendationText.trim() || null,
    default_classification: input.classification,
    default_quote_price: input.quotePrice ? Number(input.quotePrice) : null,
    is_active: true,
  });
  if (error) return { ok: false, message: error.message };
  revalidatePath("/settings/finding-library");
  return { ok: true };
}
