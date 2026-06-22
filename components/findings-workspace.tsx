"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Archive,
  ArrowDown,
  ArrowUp,
  BookOpen,
  Check,
  ChevronDown,
  ChevronUp,
  DollarSign,
  FileText,
  ListFilter,
  LoaderCircle,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  StickyNote,
  X,
} from "lucide-react";
import { findingAreas, findingLetters, findingSections, sectionLabel } from "@/lib/findings";
import {
  moveFindingEntry,
  saveFindingEntry,
  saveFindingSummary,
  saveTemplateFromEntry,
  setFindingArchived,
  type FindingRecommendationInput,
} from "@/app/jobs/[jobId]/findings/actions";

export type FindingTemplateOption = {
  id: string;
  code: string;
  title: string | null;
  areaCode: number | null;
  findingText: string | null;
  recommendationText: string | null;
  classification: string | null;
  quotePrice: number | null;
};

export type FindingEntryItem = {
  id: string;
  entryType: "finding" | "note";
  areaCode: number | null;
  findingLetter: string | null;
  code: string | null;
  title: string;
  findingText: string;
  classification: string | null;
  notePlacement: "before" | "after" | null;
  sourceTemplateId: string | null;
  archived: boolean;
  recommendations: {
    id: string;
    description: string;
    estimatedCost: number | null;
    recommendationType: string;
    sortOrder: number;
  }[];
};

type SummaryState = {
  subterraneanTermites: boolean;
  drywoodTermites: boolean;
  fungusDryrot: boolean;
  otherFindings: boolean;
  furtherInspection: boolean;
};

type FindingsWorkspaceProps = {
  organizationId: string;
  jobId: string;
  initialSummary: SummaryState;
  initialEntries: FindingEntryItem[];
  templates: FindingTemplateOption[];
  canManageTemplates: boolean;
};

const emptyRecommendation = (): FindingRecommendationInput => ({
  description: "",
  estimatedCost: "",
});

export function FindingsWorkspace({
  organizationId,
  jobId,
  initialSummary,
  initialEntries,
  templates,
  canManageTemplates,
}: FindingsWorkspaceProps) {
  const router = useRouter();
  const [summary, setSummary] = useState(initialSummary);
  const entries = initialEntries;
  const [filter, setFilter] = useState("active");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [entryType, setEntryType] = useState<"finding" | "note">("finding");
  const [areaCode, setAreaCode] = useState(1);
  const [findingLetter, setFindingLetter] = useState("A");
  const [findingText, setFindingText] = useState("");
  const [classification, setClassification] = useState("section_i");
  const [notePlacement, setNotePlacement] = useState<"before" | "after">("after");
  const [recommendations, setRecommendations] = useState<FindingRecommendationInput[]>([
    emptyRecommendation(),
  ]);
  const [templateSearch, setTemplateSearch] = useState("");
  const [sourceTemplateId, setSourceTemplateId] = useState<string | null>(null);
  const [saveAsTemplate, setSaveAsTemplate] = useState(false);
  const [newTemplateCode, setNewTemplateCode] = useState("");
  const [newTemplateTitle, setNewTemplateTitle] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  const filteredTemplates = useMemo(() => {
    const query = templateSearch.trim().toLowerCase();
    if (!query) return templates.slice(0, 30);
    return templates.filter((template) =>
      [template.code, template.title, template.findingText, template.recommendationText]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query)),
    ).slice(0, 40);
  }, [templateSearch, templates]);

  const visibleEntries = entries.filter((entry) => {
    if (filter === "archived") return entry.archived;
    if (entry.archived) return false;
    if (filter === "active") return true;
    if (filter === "notes") return entry.entryType === "note";
    return entry.classification === filter;
  });

  const activeFindings = entries.filter((entry) => !entry.archived && entry.entryType === "finding");
  const quoteTotal = activeFindings.reduce(
    (total, entry) => total + entry.recommendations.reduce(
      (entryTotal, recommendation) => entryTotal + Number(recommendation.estimatedCost ?? 0),
      0,
    ),
    0,
  );

  function resetEditor(type: "finding" | "note" = "finding") {
    setEditingId(null);
    setEntryType(type);
    setAreaCode(1);
    setFindingLetter("A");
    setFindingText("");
    setClassification("section_i");
    setNotePlacement("after");
    setRecommendations([emptyRecommendation()]);
    setSourceTemplateId(null);
    setSaveAsTemplate(false);
    setNewTemplateCode("");
    setNewTemplateTitle("");
    setTemplateSearch("");
  }

  function openNew(type: "finding" | "note" = "finding") {
    resetEditor(type);
    setEditorOpen(true);
  }

  function openEdit(entry: FindingEntryItem) {
    setEditingId(entry.id);
    setEntryType(entry.entryType);
    setAreaCode(entry.areaCode ?? 1);
    setFindingLetter(entry.findingLetter ?? "A");
    setFindingText(entry.findingText);
    setClassification(entry.classification === "note" ? "section_i" : entry.classification ?? "section_i");
    setNotePlacement(entry.notePlacement ?? "after");
    setRecommendations(entry.recommendations.length
      ? entry.recommendations.map((recommendation) => ({
          description: recommendation.description,
          estimatedCost: recommendation.estimatedCost?.toString() ?? "",
        }))
      : [emptyRecommendation()]);
    setSourceTemplateId(entry.sourceTemplateId);
    setTemplateSearch("");
    setEditorOpen(true);
  }

  function applyTemplate(template: FindingTemplateOption) {
    setSourceTemplateId(template.id);
    if (template.areaCode) setAreaCode(template.areaCode);
    setFindingText(template.findingText ?? "");
    if (template.classification) setClassification(template.classification);
    setRecommendations([{
      description: template.recommendationText ?? "",
      estimatedCost: template.quotePrice?.toString() ?? "",
    }]);
  }

  function saveSummary(nextSummary: SummaryState) {
    setSummary(nextSummary);
    startTransition(async () => {
      const result = await saveFindingSummary({ organizationId, jobId, ...nextSummary });
      setNotice(result.ok
        ? { type: "success", message: "Visible-problem summary saved." }
        : { type: "error", message: result.message });
    });
  }

  function submitEntry(addAnother = false) {
    startTransition(async () => {
      const result = await saveFindingEntry({
        organizationId,
        jobId,
        findingId: editingId,
        entryType,
        areaCode,
        findingLetter,
        findingText,
        classification,
        notePlacement,
        sourceTemplateId,
        recommendations,
      });
      if (!result.ok) {
        setNotice({ type: "error", message: result.message });
        return;
      }
      if (entryType === "finding" && canManageTemplates && saveAsTemplate) {
        const templateResult = await saveTemplateFromEntry({
          organizationId,
          code: newTemplateCode,
          title: newTemplateTitle,
          areaCode,
          findingText,
          recommendationText: recommendations[0]?.description ?? "",
          classification,
          quotePrice: recommendations[0]?.estimatedCost ?? "",
        });
        if (!templateResult.ok) {
          setNotice({ type: "error", message: `Entry saved, but template was not saved: ${templateResult.message}` });
          router.refresh();
          return;
        }
      }
      setNotice({ type: "success", message: editingId ? "Entry updated." : "Entry added." });
      router.refresh();
      if (addAnother) {
        resetEditor(entryType);
      } else {
        setEditorOpen(false);
      }
    });
  }

  function archiveEntry(entry: FindingEntryItem, archived: boolean) {
    startTransition(async () => {
      const result = await setFindingArchived({
        organizationId,
        jobId,
        findingId: entry.id,
        archived,
      });
      if (!result.ok) {
        setNotice({ type: "error", message: result.message });
      } else {
        setNotice({ type: "success", message: archived ? "Entry archived." : "Entry restored." });
        router.refresh();
      }
    });
  }

  function move(entry: FindingEntryItem, movement: "up" | "down") {
    startTransition(async () => {
      const result = await moveFindingEntry({
        organizationId,
        jobId,
        findingId: entry.id,
        movement,
      });
      if (!result.ok) {
        setNotice({ type: "error", message: result.message });
      } else {
        router.refresh();
      }
    });
  }

  return (
    <div className="findings-page">
      <header className="findings-header">
        <div>
          <p className="eyebrow">Inspection authoring</p>
          <h1>Findings and recommendations</h1>
        </div>
        <div className="findings-header-actions">
          {canManageTemplates ? <Link className="secondary-button" href="/settings/finding-library"><BookOpen size={16} /> Finding library</Link> : null}
          <button className="secondary-button" onClick={() => openNew("note")}><StickyNote size={16} /> Add note</button>
          <button className="primary-button" onClick={() => openNew("finding")}><Plus size={17} /> Add finding</button>
        </div>
      </header>

      {notice ? <div className={`findings-notice form-alert ${notice.type}`}>
        {notice.type === "success" ? <Check size={16} /> : null}{notice.message}
      </div> : null}

      <section className="findings-metrics">
        <div><FileText size={18} /><span>Active findings</span><strong>{activeFindings.length}</strong></div>
        <div><StickyNote size={18} /><span>Notes</span><strong>{entries.filter((entry) => !entry.archived && entry.entryType === "note").length}</strong></div>
        <div><ListFilter size={18} /><span>Section I / II</span><strong>{activeFindings.filter((entry) => entry.classification === "section_i").length} / {activeFindings.filter((entry) => entry.classification === "section_ii").length}</strong></div>
        <div><DollarSign size={18} /><span>Quoted total</span><strong>{quoteTotal.toLocaleString("en-US", { style: "currency", currency: "USD" })}</strong></div>
      </section>

      <section className="visible-problems-panel">
        <div>
          <p className="eyebrow">Inspection summary</p>
          <h2>Visible problems in accessible areas</h2>
          <span>These declarations are independent from the detailed entries below.</span>
        </div>
        <div className="visible-problem-options">
          {([
            ["subterraneanTermites", "Subterranean termites"],
            ["drywoodTermites", "Drywood termites"],
            ["fungusDryrot", "Fungus / dry rot"],
            ["otherFindings", "Other findings"],
            ["furtherInspection", "Further inspection"],
          ] as const).map(([key, label]) => (
            <label key={key}>
              <input
                type="checkbox"
                checked={summary[key]}
                onChange={(event) => saveSummary({ ...summary, [key]: event.target.checked })}
              />
              {label}
            </label>
          ))}
        </div>
      </section>

      <section className="findings-list-panel">
        <div className="findings-list-toolbar">
          <div className="finding-filter-tabs">
            {[
              ["active", "All active"],
              ["section_i", "Section I"],
              ["section_ii", "Section II"],
              ["further_inspection", "Further inspection"],
              ["notes", "Notes"],
              ["archived", "Archived"],
            ].map(([value, label]) => (
              <button className={filter === value ? "active" : ""} key={value} onClick={() => setFilter(value)}>{label}</button>
            ))}
          </div>
          {isPending ? <LoaderCircle className="button-spinner" size={18} /> : null}
        </div>

        {visibleEntries.length ? (
          <div className="finding-entry-list">
            {visibleEntries.map((entry, index) => {
              const expanded = expandedId === entry.id;
              const entryTotal = entry.recommendations.reduce(
                (total, recommendation) => total + Number(recommendation.estimatedCost ?? 0),
                0,
              );
              return (
                <article className={`finding-entry-row ${entry.archived ? "archived" : ""}`} key={entry.id}>
                  <div className="finding-order-controls">
                    <button title="Move up" onClick={() => move(entry, "up")} disabled={index === 0 || isPending}><ArrowUp size={15} /></button>
                    <span>{index + 1}</span>
                    <button title="Move down" onClick={() => move(entry, "down")} disabled={index === visibleEntries.length - 1 || isPending}><ArrowDown size={15} /></button>
                  </div>
                  <div className="finding-entry-main">
                    <div className="finding-entry-heading">
                      <div>
                        <strong>{entry.title}</strong>
                        <span className={`section-badge ${entry.classification}`}>{entry.entryType === "note" ? `${entry.notePlacement} findings` : sectionLabel(entry.classification ?? "")}</span>
                      </div>
                      <div className="finding-entry-meta">
                        {entry.recommendations.length ? <span>{entry.recommendations.length} recommendation{entry.recommendations.length === 1 ? "" : "s"}</span> : null}
                        {entryTotal > 0 ? <strong>{entryTotal.toLocaleString("en-US", { style: "currency", currency: "USD" })}</strong> : null}
                      </div>
                    </div>
                    <p><b>{entry.entryType === "note" ? "NOTE:" : "FINDING:"}</b> {entry.findingText}</p>
                    {entry.entryType === "finding" && entry.recommendations[0] ? (
                      <p><b>RECOMMENDATION:</b> {entry.recommendations[0].description}</p>
                    ) : null}
                    {expanded && entry.recommendations.slice(1).map((recommendation, recommendationIndex) => (
                      <div className="alternate-recommendation" key={recommendation.id}>
                        <b>ALTERNATE {recommendationIndex + 1}:</b> {recommendation.description}
                        {recommendation.estimatedCost ? <span>{Number(recommendation.estimatedCost).toLocaleString("en-US", { style: "currency", currency: "USD" })}</span> : null}
                      </div>
                    ))}
                  </div>
                  <div className="finding-entry-actions">
                    {entry.recommendations.length > 1 ? <button title={expanded ? "Collapse" : "Expand"} onClick={() => setExpandedId(expanded ? null : entry.id)}>{expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</button> : null}
                    {!entry.archived ? <button title="Edit" onClick={() => openEdit(entry)}><Pencil size={16} /></button> : null}
                    <button title={entry.archived ? "Restore" : "Archive"} onClick={() => archiveEntry(entry, !entry.archived)}>
                      {entry.archived ? <RotateCcw size={16} /> : <Archive size={16} />}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="findings-empty">
            <FileText size={25} />
            <h3>{filter === "archived" ? "No archived entries" : "No findings in this view"}</h3>
            <p>Add a finding from the reusable library or write a report note.</p>
            {filter !== "archived" ? <button className="primary-button" onClick={() => openNew("finding")}><Plus size={16} /> Add first finding</button> : null}
          </div>
        )}
      </section>

      {editorOpen ? (
        <div className="finding-editor-backdrop" role="presentation">
          <section className="finding-editor" role="dialog" aria-modal="true" aria-label={editingId ? "Edit entry" : "Add entry"}>
            <header>
              <div><p className="eyebrow">{editingId ? "Edit report entry" : "New report entry"}</p><h2>{entryType === "finding" ? "Finding and recommendations" : "Report note"}</h2></div>
              <button className="icon-button" onClick={() => setEditorOpen(false)} aria-label="Close editor"><X size={20} /></button>
            </header>

            <div className="finding-editor-body">
              {entryType === "finding" ? (
                <aside className="template-library-panel">
                  <div className="template-search"><Search size={16} /><input value={templateSearch} onChange={(event) => setTemplateSearch(event.target.value)} placeholder="Search code or wording" /></div>
                  <div className="template-results">
                    {filteredTemplates.length ? filteredTemplates.map((template) => (
                      <button className={sourceTemplateId === template.id ? "selected" : ""} key={template.id} onClick={() => applyTemplate(template)}>
                        <strong>{template.code}{template.title ? ` · ${template.title}` : ""}</strong>
                        <span>{template.findingText || template.recommendationText}</span>
                      </button>
                    )) : <p>No templates match this search.</p>}
                  </div>
                </aside>
              ) : null}

              <div className="finding-entry-form">
                <div className="entry-type-control">
                  <button className={entryType === "finding" ? "active" : ""} onClick={() => setEntryType("finding")}>Finding</button>
                  <button className={entryType === "note" ? "active" : ""} onClick={() => setEntryType("note")}>Note</button>
                </div>

                <div className="finding-reference-grid">
                  {entryType === "finding" ? (
                    <label>Area<select value={areaCode} onChange={(event) => setAreaCode(Number(event.target.value))}>{findingAreas.map((area) => <option key={area.code} value={area.code}>{area.code} · {area.label}</option>)}</select></label>
                  ) : null}
                  <label>{entryType === "finding" ? "Finding letter" : "Note letter"}<select value={findingLetter} onChange={(event) => setFindingLetter(event.target.value)}>{findingLetters.map((letter) => <option key={letter}>{letter}</option>)}</select></label>
                  <div className="reference-preview"><span>Report reference</span><strong>{entryType === "finding" ? `${areaCode}${findingLetter}` : `Note ${findingLetter}`}</strong></div>
                </div>

                <label className="editor-field">
                  {entryType === "finding" ? "Finding" : "Note content"}
                  <textarea rows={7} value={findingText} onChange={(event) => setFindingText(event.target.value)} placeholder={entryType === "finding" ? "Describe the observed condition..." : "Enter the report note..."} />
                </label>

                {entryType === "finding" ? (
                  <>
                    <fieldset className="section-selector">
                      <legend>Report section</legend>
                      {findingSections.map((section) => (
                        <label className={classification === section.value ? "selected" : ""} key={section.value}>
                          <input type="radio" name="classification" checked={classification === section.value} onChange={() => setClassification(section.value)} />
                          <span><strong>{section.label}</strong><small>{section.detail}</small></span>
                        </label>
                      ))}
                    </fieldset>

                    <div className="recommendation-editor-list">
                      {recommendations.map((recommendation, index) => (
                        <div className="recommendation-editor" key={index}>
                          <div className="recommendation-editor-heading"><strong>{index === 0 ? "Primary recommendation" : `Alternate recommendation ${index}`}</strong>{index > 0 ? <button onClick={() => setRecommendations((current) => current.filter((_, itemIndex) => itemIndex !== index))}><X size={15} /></button> : null}</div>
                          <textarea rows={5} value={recommendation.description} onChange={(event) => setRecommendations((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, description: event.target.value } : item))} placeholder="Describe the recommended corrective action..." />
                          <label>Quote price<div className="currency-input"><DollarSign size={15} /><input type="number" min="0" step="0.01" value={recommendation.estimatedCost} onChange={(event) => setRecommendations((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, estimatedCost: event.target.value } : item))} /></div></label>
                        </div>
                      ))}
                      <button className="add-recommendation-button" onClick={() => setRecommendations((current) => [...current, emptyRecommendation()])}><Plus size={16} /> Add alternate recommendation</button>
                    </div>

                    {canManageTemplates ? (
                      <section className="save-template-panel">
                        <label className="inline-check">
                          <input type="checkbox" checked={saveAsTemplate} onChange={(event) => setSaveAsTemplate(event.target.checked)} />
                          Save this wording to the reusable library
                        </label>
                        {saveAsTemplate ? (
                          <div>
                            <label>Template code<input value={newTemplateCode} onChange={(event) => setNewTemplateCode(event.target.value)} placeholder="Example: 1008" /></label>
                            <label>Short title<input value={newTemplateTitle} onChange={(event) => setNewTemplateTitle(event.target.value)} placeholder="Optional library label" /></label>
                          </div>
                        ) : null}
                      </section>
                    ) : null}
                  </>
                ) : (
                  <fieldset className="note-placement-control">
                    <legend>Note placement</legend>
                    <label className={notePlacement === "before" ? "selected" : ""}><input type="radio" checked={notePlacement === "before"} onChange={() => setNotePlacement("before")} /> Before findings</label>
                    <label className={notePlacement === "after" ? "selected" : ""}><input type="radio" checked={notePlacement === "after"} onChange={() => setNotePlacement("after")} /> After findings</label>
                  </fieldset>
                )}
              </div>
            </div>

            <footer>
              <button className="secondary-button" onClick={() => setEditorOpen(false)}>Cancel</button>
              {!editingId ? <button className="secondary-button" onClick={() => submitEntry(true)} disabled={isPending}>Save and add another</button> : null}
              <button className="primary-button" onClick={() => submitEntry(false)} disabled={isPending}>{isPending ? <LoaderCircle className="button-spinner" size={16} /> : null}{editingId ? "Save changes" : "Save entry"}</button>
            </footer>
          </section>
        </div>
      ) : null}
    </div>
  );
}
