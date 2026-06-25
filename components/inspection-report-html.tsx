/* eslint-disable @next/next/no-img-element */
import { RichReportContent } from "@/components/rich-report-content";
import type { InspectionReportSnapshot, ReportMedia, ReportParty } from "@/lib/reports/types";

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

const reportTypes = [
  ["complete", "Complete"],
  ["limited", "Limited"],
  ["supplemental", "Supplemental"],
  ["reinspection", "Reinspection"],
] as const;

function formatDate(value: string | null) {
  if (!value) return "Not recorded";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "long",
    timeZone: "America/Los_Angeles",
  }).format(new Date(value));
}

function partyText(parties: ReportParty[]) {
  if (!parties.length) return "Not recorded";
  const uniqueParties = Array.from(new Map(parties.map((party) => [
    party.contactId || party.email?.toLowerCase() || `${party.name}|${party.company ?? ""}`,
    party,
  ])).values());
  return uniqueParties.map((party) => [
    party.name,
    party.company,
    party.email,
  ].filter(Boolean).join("\n")).join("\n\n");
}

function organizationAddress(snapshot: InspectionReportSnapshot) {
  return [
    snapshot.organization.streetLine1,
    snapshot.organization.streetLine2,
    [snapshot.organization.city, snapshot.organization.region, snapshot.organization.postalCode]
      .filter(Boolean)
      .join(", "),
  ].filter(Boolean).join("\n");
}

export function InspectionReportHtml({ snapshot, media }: InspectionReportHtmlProps) {
  const address = [
    snapshot.property.streetLine1,
    snapshot.property.streetLine2,
    `${snapshot.property.city}, ${snapshot.property.region} ${snapshot.property.postalCode}`,
  ].filter(Boolean);
  const conditions = [
    ["Subterranean termites", snapshot.findingSummary.subterraneanTermites],
    ["Drywood termites", snapshot.findingSummary.drywoodTermites],
    ["Fungus / dryrot", snapshot.findingSummary.fungusDryrot],
    ["Other findings", snapshot.findingSummary.otherFindings],
    ["Further inspection", snapshot.findingSummary.furtherInspection],
  ] as const;
  const orderedBy = snapshot.parties.filter((party) => party.role === "ordered_by");
  const ownersAndInterests = snapshot.parties.filter((party) =>
    ["property_owner", "party_of_interest"].includes(party.role),
  );
  const recipients = snapshot.parties.filter((party) => party.role === "report_recipient" || party.sendByDefault);
  const reportPhotos = snapshot.photos.filter((photo) => !photo.isCover);
  const beforeFindings = snapshot.legalContent.filter((block) => block.placement === "before_findings");
  const afterFindings = snapshot.legalContent.filter((block) => block.placement === "after_findings");
  let sectionNumber = 2;

  return (
    <article className="inspection-report">
      <section className={`report-cover${media.coverUrl ? "" : " without-photo"}`}>
        <div className="report-cover-brand">
          {media.companyLogoDarkUrl
            ? <img src={media.companyLogoDarkUrl} alt={`${snapshot.organization.legalName} logo`} />
            : <strong>{snapshot.organization.legalName}</strong>}
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
        {media.coverUrl ? <img className="report-cover-photo" src={media.coverUrl} alt="Property exterior" /> : null}
      </section>

      <section className="report-section report-formal-summary">
        <h2>Wood Destroying Pests and Organisms Inspection Report</h2>
        <div className="formal-topline">
          <div><span>Property address</span><strong>{address.join(", ")}</strong></div>
          <div><span>Report number</span><strong>{snapshot.job.number}</strong></div>
          <div><span>Date of inspection</span><strong>{formatDate(snapshot.job.inspectionAt)}</strong></div>
        </div>

        <div className="formal-company">
          <div className="formal-company-logo">
            {media.companyLogoLightUrl ? <img src={media.companyLogoLightUrl} alt={`${snapshot.organization.legalName} logo`} /> : <strong>{snapshot.organization.legalName}</strong>}
          </div>
          <div>
            <strong>{snapshot.organization.legalName}</strong>
            <p>{organizationAddress(snapshot) || "Company address not recorded"}</p>
            <p>{[snapshot.organization.phone, snapshot.organization.email, snapshot.organization.website].filter(Boolean).join(" · ")}</p>
          </div>
          <div className="formal-licenses">
            {snapshot.organization.registrationNumber ? <p><span>Registration</span>{snapshot.organization.registrationNumber}</p> : null}
            {snapshot.organization.operatorLicense ? <p><span>Operator license</span>{snapshot.organization.operatorLicense}</p> : null}
            {snapshot.organization.contractorLicense ? <p><span>Contractor license</span>{snapshot.organization.contractorLicense}</p> : null}
          </div>
        </div>

        <div className="formal-party-grid">
          <div><span>Ordered by</span><p>{partyText(orderedBy)}</p></div>
          <div><span>Property owner / party of interest</span><p>{partyText(ownersAndInterests)}</p></div>
          <div><span>Report sent to</span><p>{partyText(recipients)}</p></div>
        </div>

        <div className="formal-report-types">
          {reportTypes.map(([value, label]) => (
            <span className={snapshot.job.reportType === value ? "selected" : ""} key={value}>
              <i>{snapshot.job.reportType === value ? "✓" : ""}</i>{label} report
            </span>
          ))}
        </div>

        <div className="formal-property-grid">
          <div className="wide"><span>General description</span><p>{snapshot.job.generalDescription || "Not recorded"}</p></div>
          <div><span>Escrow number</span><p>{snapshot.job.escrowNumber || "Not recorded"}</p></div>
          <div><span>Inspection tag posted</span><p>{snapshot.job.inspectionTagPosted || "Not recorded"}</p></div>
          <div><span>Other tags posted</span><p>{snapshot.job.otherTagsPosted || "None recorded"}</p></div>
          <div><span>Garage</span><p>{snapshot.job.garageDescription || "Not recorded"}</p></div>
        </div>

        <p className="formal-scope">
          An inspection was made of the structure(s) shown on the diagram in accordance with the Structural Pest Control Act. Areas or structures not shown on the diagram were not inspected.
        </p>
        <div className="formal-conditions">
          {conditions.map(([label, selected]) => <span className={selected ? "selected" : ""} key={label}><i>{selected ? "✓" : ""}</i>{label}</span>)}
        </div>

        <div className="formal-diagram-layout">
          <div className="formal-diagram">
            {media.diagramUrl ? <img src={media.diagramUrl} alt="Property inspection diagram" /> : <div>Diagram not required or not provided</div>}
            <strong>Diagram not to scale</strong>
          </div>
          <div className="formal-reference-list">
            <span>Finding references</span>
            {snapshot.findings.filter((finding) => finding.entryType === "finding").length ? (
              snapshot.findings.filter((finding) => finding.entryType === "finding").map((finding) => (
                <p key={finding.id}><strong>{finding.reference}</strong>{finding.title}</p>
              ))
            ) : <p>No findings recorded.</p>}
          </div>
        </div>

        <div className="formal-inspector">
          <div><span>Inspected by</span><strong>{snapshot.inspector?.name ?? "Not recorded"}</strong></div>
          <div><span>State license</span><strong>{snapshot.inspector?.licenseNumber ?? "Not recorded"}</strong></div>
          <div className="formal-signature">
            <span>Signature</span>
            {media.signatureUrl ? <img src={media.signatureUrl} alt={`${snapshot.inspector?.name} signature`} /> : <strong>Not included</strong>}
          </div>
        </div>
        <p className="formal-regulatory-note">{snapshot.organization.regulatoryContact || "Questions about this report should first be directed to the inspection company. Regulatory contact information may be maintained in the company profile."}</p>
      </section>

      {beforeFindings.length ? (
        <section className="report-section report-legal">
          <header><span>01</span><div><p>Scope and disclosures</p><h2>Important report information</h2></div></header>
          {beforeFindings.map((block) => (
            <article key={block.id}>
              <h3>{block.title}</h3>
              <RichReportContent document={block.bodyJson} fallbackText={block.body} />
            </article>
          ))}
        </section>
      ) : null}

      <section className="report-section">
        <header><span>{String(sectionNumber++).padStart(2, "0")}</span><div><p>Visible conditions</p><h2>Findings and recommendations</h2></div></header>
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

      {afterFindings.length ? (
        <section className="report-section report-legal">
          <header><span>{String(sectionNumber++).padStart(2, "0")}</span><div><p>Additional disclosures</p><h2>Report notices</h2></div></header>
          {afterFindings.map((block) => (
            <article key={block.id}>
              <h3>{block.title}</h3>
              <RichReportContent document={block.bodyJson} fallbackText={block.body} />
            </article>
          ))}
        </section>
      ) : null}

      {reportPhotos.length ? (
        <section className="report-section">
          <header><span>{String(sectionNumber++).padStart(2, "0")}</span><div><p>Inspection evidence</p><h2>Report photographs</h2></div></header>
          <div className="report-photo-grid">
            {reportPhotos.map((photo, index) => (
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
        <header><span>{String(sectionNumber).padStart(2, "0")}</span><div><p>Certification</p><h2>Inspector declaration</h2></div></header>
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
