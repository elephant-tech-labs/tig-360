/* eslint-disable @next/next/no-img-element */
import type { InspectionReportSnapshot, ReportMedia } from "@/lib/reports/types";

type InspectionReportHtmlProps = {
  snapshot: InspectionReportSnapshot;
  media: ReportMedia;
};

const classificationLabels: Record<string, string> = {
  section_i: "Section I",
  section_ii: "Section II",
  further_inspection: "Further inspection",
  other: "Other",
  note: "Note",
};

function formatDate(value: string | null) {
  if (!value) return "Not recorded";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "long",
    timeZone: "America/Los_Angeles",
  }).format(new Date(value));
}

export function InspectionReportHtml({ snapshot, media }: InspectionReportHtmlProps) {
  const address = [
    snapshot.property.streetLine1,
    snapshot.property.streetLine2,
    `${snapshot.property.city}, ${snapshot.property.region} ${snapshot.property.postalCode}`,
  ].filter(Boolean);
  const visibleProblems = [
    snapshot.findingSummary.subterraneanTermites && "Subterranean termites",
    snapshot.findingSummary.drywoodTermites && "Drywood termites",
    snapshot.findingSummary.fungusDryrot && "Fungus / dryrot",
    snapshot.findingSummary.otherFindings && "Other findings",
    snapshot.findingSummary.furtherInspection && "Further inspection",
  ].filter(Boolean) as string[];
  const reportContacts = snapshot.parties.filter((party) =>
    ["ordered_by", "property_owner", "report_recipient", "party_of_interest"].includes(party.role),
  );

  return (
    <article className="inspection-report">
      <section className="report-cover">
        <div className="report-cover-brand">
          <span>TI</span>
          <div>
            <strong>{snapshot.organization.name}</strong>
            <small>Structural Pest Inspection</small>
          </div>
        </div>
        <div className="report-cover-copy">
          <p className="report-type-label">{snapshot.job.reportType.replaceAll("_", " ")} inspection report</p>
          <h1>{address[0]}</h1>
          <p>{address.slice(1).join(" · ")}</p>
          <dl>
            <div><dt>Report</dt><dd>#{snapshot.job.number}</dd></div>
            <div><dt>Inspection date</dt><dd>{formatDate(snapshot.job.inspectionAt)}</dd></div>
            {snapshot.job.escrowNumber ? <div><dt>Escrow</dt><dd>{snapshot.job.escrowNumber}</dd></div> : null}
            {snapshot.job.priorJobNumber ? <div><dt>Prior report</dt><dd>#{snapshot.job.priorJobNumber}</dd></div> : null}
          </dl>
        </div>
        {media.coverUrl ? <img className="report-cover-photo" src={media.coverUrl} alt="Property exterior" /> : <div className="report-cover-photo placeholder">Property photo not selected</div>}
      </section>

      <section className="report-section report-overview">
        <header><span>01</span><div><p>Inspection overview</p><h2>Property and parties</h2></div></header>
        <div className="report-two-column">
          <div>
            <h3>Property</h3>
            <p>{address.join("\n")}</p>
            {snapshot.property.county ? <p><strong>County:</strong> {snapshot.property.county}</p> : null}
            {snapshot.property.propertyType ? <p><strong>Property type:</strong> {snapshot.property.propertyType}</p> : null}
          </div>
          <div>
            <h3>Inspection</h3>
            <p><strong>Inspector:</strong> {snapshot.inspector?.name ?? "Not recorded"}</p>
            <p><strong>License:</strong> {snapshot.inspector?.licenseNumber ?? "Not recorded"}</p>
            <p><strong>Date:</strong> {formatDate(snapshot.job.inspectionAt)}</p>
          </div>
        </div>
        {snapshot.job.generalDescription ? <div className="report-description"><h3>General description</h3><p>{snapshot.job.generalDescription}</p></div> : null}
        {reportContacts.length ? (
          <div className="report-contact-grid">
            {reportContacts.map((party, index) => (
              <div key={`${party.contactId}-${party.role}-${index}`}>
                <span>{party.roleLabel}</span>
                <strong>{party.name}</strong>
                <small>{party.company || party.email || "Contact"}</small>
              </div>
            ))}
          </div>
        ) : null}
      </section>

      <section className="report-section">
        <header><span>02</span><div><p>Visible conditions</p><h2>Findings and recommendations</h2></div></header>
        <div className="report-problem-summary">
          <strong>Categories observed</strong>
          <p>{visibleProblems.length ? visibleProblems.join(" · ") : "No visible-problem categories selected."}</p>
        </div>
        <div className="report-findings">
          {snapshot.findings.length ? snapshot.findings.map((finding) => (
            <section className={`report-finding ${finding.entryType}`} key={finding.id}>
              <div className="report-finding-reference">{finding.reference}</div>
              <div>
                <div className="report-finding-heading">
                  <h3>{finding.title}</h3>
                  <span>{classificationLabels[finding.classification ?? ""] ?? finding.classification?.replaceAll("_", " ") ?? "Unclassified"}</span>
                </div>
                <p><strong>{finding.entryType === "note" ? "Note:" : "Finding:"}</strong> {finding.description}</p>
                {finding.recommendations.map((recommendation) => (
                  <div className="report-recommendation" key={recommendation.id}>
                    <strong>Recommendation:</strong> {recommendation.description}
                    {recommendation.estimatedCost !== null ? <span>${recommendation.estimatedCost.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span> : null}
                  </div>
                ))}
              </div>
            </section>
          )) : <div className="report-empty">No findings or report notes were entered.</div>}
        </div>
      </section>

      {media.diagramUrl ? (
        <section className="report-section">
          <header><span>03</span><div><p>Property diagram</p><h2>Finding locations</h2></div></header>
          <img className="report-diagram" src={media.diagramUrl} alt="Property inspection diagram" />
        </section>
      ) : null}

      {snapshot.photos.length ? (
        <section className="report-section">
          <header><span>{media.diagramUrl ? "04" : "03"}</span><div><p>Inspection evidence</p><h2>Report photographs</h2></div></header>
          <div className="report-photo-grid">
            {snapshot.photos.map((photo, index) => (
              <figure key={photo.id}>
                {media.photoUrls[photo.id] ? <img src={media.photoUrls[photo.id]} alt={photo.caption || photo.filename} /> : <div className="report-photo-missing">Photo unavailable</div>}
                <figcaption>
                  <strong>Photo {index + 1}{photo.location ? ` · ${photo.location}` : ""}</strong>
                  <span>{photo.caption || photo.filename}</span>
                </figcaption>
              </figure>
            ))}
          </div>
        </section>
      ) : null}

      <section className="report-section report-certification">
        <header><span>{snapshot.photos.length ? (media.diagramUrl ? "05" : "04") : (media.diagramUrl ? "04" : "03")}</span><div><p>Certification</p><h2>Inspector declaration</h2></div></header>
        <p>This report reflects the visible and accessible conditions observed on the inspection date. Findings and recommendations are limited to the scope and conditions documented in this report.</p>
        <div className="report-signature">
          {media.signatureUrl ? <img src={media.signatureUrl} alt={`${snapshot.inspector?.name} signature`} /> : null}
          <strong>{snapshot.inspector?.name ?? "Inspector"}</strong>
          <span>{snapshot.inspector?.licenseNumber ? `License ${snapshot.inspector.licenseNumber}` : "License not recorded"}</span>
        </div>
      </section>
    </article>
  );
}
