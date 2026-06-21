import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import {
  FindingsWorkspace,
  type FindingEntryItem,
  type FindingTemplateOption,
} from "@/components/findings-workspace";
import { getCurrentContext } from "@/lib/current-organization";
import { JobAuthoringNav } from "@/components/job-authoring-nav";

type FindingsPageProps = {
  params: Promise<{ jobId: string }>;
};

export default async function FindingsPage({ params }: FindingsPageProps) {
  const { jobId } = await params;
  const { supabase, organization, userName, membership } = await getCurrentContext();
  const [
    { data: job, error: jobError },
    { data: summary, error: summaryError },
    { data: findings, error: findingsError },
    { data: templates, error: templatesError },
  ] = await Promise.all([
    supabase
      .from("inspection_jobs")
      .select("id, job_number, properties(street_line_1, city, region, postal_code)")
      .eq("id", jobId)
      .eq("organization_id", organization.id)
      .single(),
    supabase
      .from("job_finding_summaries")
      .select("subterranean_termites, drywood_termites, fungus_dryrot, other_findings, further_inspection")
      .eq("inspection_job_id", jobId)
      .maybeSingle(),
    supabase
      .from("findings")
      .select(`
        id, entry_type, area_code, finding_letter, code, title, description,
        classification, note_placement, source_template_id, archived_at, sort_order,
        recommendations(id, description, estimated_cost, recommendation_type, sort_order)
      `)
      .eq("inspection_job_id", jobId)
      .eq("organization_id", organization.id)
      .order("sort_order"),
    supabase
      .from("finding_templates")
      .select("id, template_code, title, area_code, finding_text, recommendation_text, default_classification, default_quote_price")
      .eq("organization_id", organization.id)
      .eq("is_active", true)
      .order("template_code"),
  ]);

  if (jobError || !job) notFound();
  if (summaryError) throw new Error(summaryError.message);
  if (findingsError) throw new Error(findingsError.message);
  if (templatesError) throw new Error(templatesError.message);

  const property = Array.isArray(job.properties) ? job.properties[0] : job.properties;
  const initialEntries: FindingEntryItem[] = (findings ?? []).map((finding) => ({
    id: finding.id,
    entryType: finding.entry_type as "finding" | "note",
    areaCode: finding.area_code,
    findingLetter: finding.finding_letter,
    code: finding.code,
    title: finding.title,
    findingText: finding.description ?? "",
    classification: finding.classification,
    notePlacement: finding.note_placement as "before" | "after" | null,
    sourceTemplateId: finding.source_template_id,
    archived: Boolean(finding.archived_at),
    recommendations: [...(finding.recommendations ?? [])]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((recommendation) => ({
        id: recommendation.id,
        description: recommendation.description,
        estimatedCost: recommendation.estimated_cost,
        recommendationType: recommendation.recommendation_type,
        sortOrder: recommendation.sort_order,
      })),
  }));
  const templateOptions: FindingTemplateOption[] = (templates ?? []).map((template) => ({
    id: template.id,
    code: template.template_code,
    title: template.title,
    areaCode: template.area_code,
    findingText: template.finding_text,
    recommendationText: template.recommendation_text,
    classification: template.default_classification,
    quotePrice: template.default_quote_price,
  }));

  return (
    <AppShell organizationName={organization.name} userName={userName}>
      <JobAuthoringNav jobId={jobId} current="findings" />
      <FindingsWorkspace
        organizationId={organization.id}
        jobId={jobId}
        jobNumber={job.job_number}
        propertyAddress={[
          property?.street_line_1,
          property?.city,
          property?.region,
          property?.postal_code,
        ].filter(Boolean).join(", ")}
        initialSummary={{
          subterraneanTermites: summary?.subterranean_termites ?? false,
          drywoodTermites: summary?.drywood_termites ?? false,
          fungusDryrot: summary?.fungus_dryrot ?? false,
          otherFindings: summary?.other_findings ?? false,
          furtherInspection: summary?.further_inspection ?? false,
        }}
        initialEntries={initialEntries}
        templates={templateOptions}
        canManageTemplates={membership.role === "administrator" || membership.role === "manager"}
      />
    </AppShell>
  );
}
