import Link from "next/link";
import { ArrowLeft, BookOpen, Check, Plus } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import { findingAreas, findingSections } from "@/lib/findings";
import { getCurrentContext } from "@/lib/current-organization";
import { saveFindingTemplate } from "./actions";

type FindingLibraryPageProps = {
  searchParams: Promise<{ saved?: string; error?: string; edit?: string }>;
};

export default async function FindingLibraryPage({ searchParams }: FindingLibraryPageProps) {
  const messages = await searchParams;
  const { supabase, organization, userName, membership } = await getCurrentContext();
  if (membership.role !== "administrator" && membership.role !== "manager") {
    return (
      <AppShell organizationName={organization.name} userName={userName}>
        <div className="form-page"><div className="form-alert error">Administrator or manager access required.</div></div>
      </AppShell>
    );
  }

  const { data: templates, error } = await supabase
    .from("finding_templates")
    .select("*")
    .eq("organization_id", organization.id)
    .order("template_code");
  if (error) throw new Error(error.message);
  const editing = templates?.find((template) => template.id === messages.edit);

  return (
    <AppShell organizationName={organization.name} userName={userName}>
      <div className="library-page">
        <div className="page-heading">
          <div>
            <Link className="back-link" href="/jobs"><ArrowLeft size={16} /> Inspection jobs</Link>
            <p className="eyebrow">Authoring settings</p>
            <h1>Finding library</h1>
            <p>Reusable wording for fast, consistent inspection reports.</p>
          </div>
        </div>
        {messages.saved ? <div className="form-alert success"><Check size={16} /> Template saved.</div> : null}
        {messages.error ? <div className="form-alert error">{messages.error}</div> : null}

        <div className="library-layout">
          <section className="library-list">
            <div className="section-heading compact"><div><h2>Templates</h2><span className="section-subtitle">{templates?.length ?? 0} reusable entries</span></div></div>
            {templates?.map((template) => (
              <Link className={`library-template-row ${messages.edit === template.id ? "active" : ""}`} href={`/settings/finding-library?edit=${template.id}`} key={template.id}>
                <strong>{template.template_code}{template.title ? ` · ${template.title}` : ""}</strong>
                <span>{template.finding_text || template.recommendation_text}</span>
                <small>{template.is_active ? "Active" : "Inactive"}</small>
              </Link>
            ))}
          </section>

          <form className="library-editor" action={saveFindingTemplate}>
            <input name="organizationId" type="hidden" value={organization.id} />
            <input name="templateId" type="hidden" value={editing?.id ?? ""} />
            <div className="section-heading compact">
              <div><h2>{editing ? "Edit template" : "New template"}</h2><span className="section-subtitle">Codes are internal and do not appear in reports</span></div>
              {editing ? <Link className="icon-button" title="New template" href="/settings/finding-library"><Plus size={17} /></Link> : <BookOpen size={19} />}
            </div>
            <div className="field-grid">
              <label>Template code<input name="templateCode" defaultValue={editing?.template_code ?? ""} required /></label>
              <label>Short title<input name="title" defaultValue={editing?.title ?? ""} /></label>
              <label>Default area<select name="areaCode" defaultValue={editing?.area_code ?? ""}><option value="">No default</option>{findingAreas.map((area) => <option key={area.code} value={area.code}>{area.code} · {area.label}</option>)}</select></label>
              <label>Default section<select name="classification" defaultValue={editing?.default_classification ?? ""}><option value="">No default</option>{findingSections.map((section) => <option key={section.value} value={section.value}>{section.label}</option>)}</select></label>
              <label className="field-span-2">Finding wording<textarea name="findingText" rows={6} defaultValue={editing?.finding_text ?? ""} /></label>
              <label className="field-span-2">Recommendation wording<textarea name="recommendationText" rows={6} defaultValue={editing?.recommendation_text ?? ""} /></label>
              <label>Default quote price<input name="quotePrice" type="number" min="0" step="0.01" defaultValue={editing?.default_quote_price ?? ""} /></label>
              <label className="inline-check"><input name="isActive" type="checkbox" defaultChecked={editing?.is_active ?? true} /> Available to report authors</label>
            </div>
            <PendingSubmitButton className="primary-button" pendingLabel="Saving template">{editing ? "Save changes" : "Create template"}</PendingSubmitButton>
          </form>
        </div>
      </div>
    </AppShell>
  );
}
