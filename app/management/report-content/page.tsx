import { Check, FilePlus2, Save, Trash2 } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { ManagementNav } from "@/components/management-nav";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import { getCurrentContext } from "@/lib/current-organization";
import { deleteReportContentBlock, saveReportContentBlock } from "./actions";

type ReportContentPageProps = {
  searchParams: Promise<{ saved?: string; error?: string }>;
};

const reportTypes = ["complete", "limited", "supplemental", "reinspection"];

export default async function ReportContentPage({ searchParams }: ReportContentPageProps) {
  const messages = await searchParams;
  const { supabase, organization, userName, membership } = await getCurrentContext();
  const { data: blocks, error } = await supabase
    .from("report_content_blocks")
    .select("*")
    .eq("organization_id", organization.id)
    .order("placement")
    .order("sort_order");
  if (error) throw new Error(error.message);
  const canManage = membership.role === "administrator" || membership.role === "manager";

  return (
    <AppShell organizationName={organization.name} userName={userName} active="management">
      <div className="page-heading">
        <div><p className="eyebrow">Organization management</p><h1>Company and report settings</h1><p>Manage the legal identity, report content, inspectors, and access used across every inspection.</p></div>
      </div>
      <ManagementNav current="report-content" />
      <div className="management-page">
        {messages.saved ? <div className="form-alert success"><Check size={17} /> {messages.saved}</div> : null}
        {messages.error ? <div className="form-alert error">{messages.error}</div> : null}
        <section className="management-panel">
          <div className="management-panel-intro">
            <div className="onboarding-icon"><FilePlus2 size={22} /></div>
            <div><p className="eyebrow">Reusable report language</p><h2>Report content library</h2><p>Changes apply to future PDFs. Existing generated and approved versions preserve their original text.</p></div>
          </div>
          <div className="report-content-list">
            {(blocks ?? []).map((block) => (
              <article className="report-content-editor" key={block.id}>
                <form action={saveReportContentBlock}>
                  <input name="organizationId" type="hidden" value={organization.id} />
                  <input name="blockId" type="hidden" value={block.id} />
                  <input name="currentVersion" type="hidden" value={block.version} />
                  <div className="report-content-editor-heading"><strong>Version {block.version}</strong><span>{block.placement.replaceAll("_", " ")}</span></div>
                  <label>Title<input name="title" defaultValue={block.title} disabled={!canManage} required /></label>
                  <label>Content<textarea name="body" rows={8} defaultValue={block.body} disabled={!canManage} required /></label>
                  <div className="report-content-options">
                    <label>Placement<select name="placement" defaultValue={block.placement} disabled={!canManage}><option value="before_findings">Before findings</option><option value="after_findings">After findings</option><option value="contract">Contract/disclosures</option></select></label>
                    <label>Display order<input name="sortOrder" type="number" defaultValue={block.sort_order} disabled={!canManage} /></label>
                    <label>Effective from<input name="effectiveFrom" type="date" defaultValue={block.effective_from ?? ""} disabled={!canManage} /></label>
                  </div>
                  <fieldset><legend>Applicable report types</legend><div className="report-type-checks">{reportTypes.map((type) => <label className="inline-check" key={type}><input name="reportType" type="checkbox" value={type} defaultChecked={block.report_types.includes(type)} disabled={!canManage} /> {type}</label>)}</div></fieldset>
                  <div className="report-content-flags"><label className="inline-check"><input name="isActive" type="checkbox" defaultChecked={block.is_active} disabled={!canManage} /> Active</label><label className="inline-check"><input name="isRequired" type="checkbox" defaultChecked={block.is_required} disabled={!canManage} /> Required content</label></div>
                  {canManage ? <PendingSubmitButton className="primary-button" pendingLabel="Saving content"><Save size={15} /> Save block</PendingSubmitButton> : null}
                </form>
                {canManage ? <form action={deleteReportContentBlock}><input name="organizationId" type="hidden" value={organization.id} /><input name="blockId" type="hidden" value={block.id} /><button className="danger-text-button" type="submit"><Trash2 size={14} /> Delete block</button></form> : null}
              </article>
            ))}
            {canManage ? (
              <article className="report-content-editor new">
                <form action={saveReportContentBlock}>
                  <input name="organizationId" type="hidden" value={organization.id} />
                  <div className="report-content-editor-heading"><strong>New content block</strong><span>Future reports</span></div>
                  <label>Title<input name="title" required /></label>
                  <label>Content<textarea name="body" rows={8} required /></label>
                  <div className="report-content-options">
                    <label>Placement<select name="placement" defaultValue="before_findings"><option value="before_findings">Before findings</option><option value="after_findings">After findings</option><option value="contract">Contract/disclosures</option></select></label>
                    <label>Display order<input name="sortOrder" type="number" defaultValue={50} /></label>
                    <label>Effective from<input name="effectiveFrom" type="date" /></label>
                  </div>
                  <fieldset><legend>Applicable report types</legend><div className="report-type-checks">{reportTypes.map((type) => <label className="inline-check" key={type}><input name="reportType" type="checkbox" value={type} defaultChecked /> {type}</label>)}</div></fieldset>
                  <div className="report-content-flags"><label className="inline-check"><input name="isActive" type="checkbox" defaultChecked /> Active</label><label className="inline-check"><input name="isRequired" type="checkbox" defaultChecked /> Required content</label></div>
                  <PendingSubmitButton className="primary-button" pendingLabel="Adding content"><FilePlus2 size={15} /> Add block</PendingSubmitButton>
                </form>
              </article>
            ) : null}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
