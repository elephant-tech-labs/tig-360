/* eslint-disable jsx-a11y/alt-text */
import {
  Document,
  Image,
  Page,
  Path,
  StyleSheet,
  Svg,
  Text,
  View,
} from "@react-pdf/renderer";
import type { InspectionReportSnapshot, ReportMedia, ReportParty } from "@/lib/reports/types";

const accent = "#f7a924";
const ink = "#1c1c1c";
const muted = "#6b6b6b";
const line = "#c8c8c8";

const styles = StyleSheet.create({
  page: { color: ink, fontFamily: "Helvetica", fontSize: 9, padding: 34 },
  cover: { padding: 0 },
  coverBand: { backgroundColor: ink, color: "#ffffff", height: 250, paddingBottom: 42, paddingHorizontal: 42, paddingTop: 32 },
  coverBandNoPhoto: { height: 570 },
  coverLogo: { height: 48, marginBottom: 46, objectFit: "contain", objectPosition: "left", width: 170 },
  brand: { color: "#ffffff", fontSize: 11, fontWeight: 700, marginBottom: 54, textTransform: "uppercase" },
  reportType: { color: accent, fontSize: 10, fontWeight: 700, marginBottom: 10, textTransform: "uppercase" },
  coverTitle: { fontSize: 28, fontWeight: 700, lineHeight: 1.15, marginBottom: 8 },
  coverAddress: { color: "#d8d8d8", fontSize: 11 },
  coverPhoto: { height: 310, objectFit: "cover", width: "100%" },
  coverMeta: { borderTopColor: accent, borderTopWidth: 3, display: "flex", flexDirection: "row", gap: 24, padding: 30 },
  metaItem: { flex: 1 },
  label: { color: muted, fontSize: 7, marginBottom: 4, textTransform: "uppercase" },
  value: { fontSize: 10, fontWeight: 700 },
  sectionHeader: { borderBottomColor: accent, borderBottomWidth: 2, display: "flex", flexDirection: "row", marginBottom: 18, paddingBottom: 8 },
  sectionNumber: { color: accent, fontSize: 9, fontWeight: 700, marginRight: 10 },
  sectionTitle: { fontSize: 16, fontWeight: 700 },
  paragraph: { lineHeight: 1.5, marginBottom: 6 },
  finding: { alignItems: "flex-start", borderBottomColor: "#dce2df", borderBottomWidth: 1, display: "flex", flexDirection: "row", gap: 10, paddingBottom: 11, paddingTop: 11 },
  reference: { alignSelf: "flex-start", backgroundColor: ink, borderBottomColor: accent, borderBottomWidth: 3, color: "#ffffff", fontSize: 9, fontWeight: 700, minWidth: 34, paddingBottom: 5, paddingLeft: 5, paddingRight: 5, paddingTop: 6, textAlign: "center" },
  findingBody: { flex: 1 },
  findingHeading: { alignItems: "center", display: "flex", flexDirection: "row", gap: 7, marginBottom: 5 },
  findingTitle: { flex: 1, fontSize: 10, fontWeight: 700 },
  classification: { backgroundColor: "#fff4df", color: "#7a4c00", fontSize: 6.5, fontWeight: 700, paddingBottom: 3, paddingLeft: 5, paddingRight: 5, paddingTop: 3, textTransform: "uppercase" },
  findingCondition: { fontSize: 8.5, fontWeight: 700, marginBottom: 5 },
  findingText: { fontSize: 8.5, lineHeight: 1.35, marginBottom: 4 },
  recommendation: { backgroundColor: "#f7f7f7", borderLeftColor: accent, borderLeftWidth: 2, fontSize: 8.3, lineHeight: 1.35, marginTop: 5, padding: 7 },
  photoGrid: { display: "flex", flexDirection: "row", flexWrap: "wrap", gap: 12 },
  photo: { borderColor: "#dce2df", borderWidth: 1, padding: 6, width: "48%" },
  photoSingle: { alignSelf: "center", width: "76%" },
  photoImage: { height: 205, objectFit: "contain", width: "100%" },
  photoImageSingle: { height: 300 },
  photoCaption: { lineHeight: 1.35, marginTop: 6 },
  certificationSection: { borderTopColor: accent, borderTopWidth: 2, marginTop: 24, paddingTop: 12 },
  certificationTitle: { fontSize: 14, fontWeight: 700, marginBottom: 8 },
  certification: { fontSize: 8.5, lineHeight: 1.45, marginBottom: 14 },
  certificationIdentity: { alignItems: "flex-end", display: "flex", flexDirection: "row", gap: 18 },
  signature: { height: 48, objectFit: "contain", objectPosition: "left", width: 140 },
  certificationName: { flex: 1, paddingBottom: 3 },
  footer: { bottom: 18, color: muted, fontSize: 7, left: 34, position: "absolute", right: 34, textAlign: "center" },

  formalPage: { fontSize: 7, padding: 22 },
  formalTitle: { borderBottomColor: ink, borderBottomWidth: 2.5, fontSize: 15, fontWeight: 700, paddingBottom: 5, textAlign: "center", textTransform: "uppercase" },
  table: { borderBottomColor: line, borderBottomWidth: 0.7, borderLeftColor: line, borderLeftWidth: 0.7, borderRightColor: line, borderRightWidth: 0.7, display: "flex", flexDirection: "row" },
  cell: { borderLeftColor: line, borderLeftWidth: 0.7, padding: 5 },
  firstCell: { borderLeftWidth: 0 },
  cellLabel: { color: muted, fontSize: 5.8, fontWeight: 700, marginBottom: 2, textTransform: "uppercase" },
  cellValue: { fontSize: 7.5, fontWeight: 700, lineHeight: 1.25 },
  companyRow: { minHeight: 66 },
  companyLogoCell: { alignItems: "center", backgroundColor: "#ffffff", display: "flex", justifyContent: "center", width: "25%" },
  companyLogo: { maxHeight: 48, objectFit: "contain", width: 115 },
  companyLogoFallback: { color: ink, fontSize: 8, fontWeight: 700, textAlign: "center" },
  companyDetails: { width: "45%" },
  companyLicenses: { width: "30%" },
  partyCell: { minHeight: 62, width: "33.333%" },
  typeRow: { borderBottomColor: line, borderBottomWidth: 0.7, borderLeftColor: line, borderLeftWidth: 0.7, borderRightColor: line, borderRightWidth: 0.7, display: "flex", flexDirection: "row", justifyContent: "space-between", padding: 4 },
  choiceWrap: { alignItems: "center", display: "flex", flexDirection: "row", gap: 3 },
  choiceBox: { alignItems: "center", borderColor: "#8a9691", borderWidth: 0.7, display: "flex", height: 8, justifyContent: "center", width: 8 },
  choiceBoxSelected: { backgroundColor: accent, borderColor: accent },
  choice: { color: muted, fontSize: 5.8, fontWeight: 700, textTransform: "uppercase" },
  choiceSelected: { color: ink },
  propertyDescription: { minHeight: 58, width: "64%" },
  propertyMeta: { width: "36%" },
  propertyMetaItem: { borderBottomColor: line, borderBottomWidth: 0.7, paddingBottom: 3, paddingTop: 3 },
  scope: { borderBottomColor: line, borderBottomWidth: 0.7, borderLeftColor: line, borderLeftWidth: 0.7, borderRightColor: line, borderRightWidth: 0.7, fontSize: 6.2, lineHeight: 1.3, padding: 5, textAlign: "center" },
  diagramRow: { borderBottomColor: line, borderBottomWidth: 0.7, borderLeftColor: line, borderLeftWidth: 0.7, borderRightColor: line, borderRightWidth: 0.7, display: "flex", flexDirection: "row", height: 258 },
  diagramCell: { alignItems: "center", borderRightColor: line, borderRightWidth: 0.7, display: "flex", justifyContent: "center", padding: 7, width: "72%" },
  diagram: { height: 235, objectFit: "contain", width: "100%" },
  referenceList: { padding: 7, width: "28%" },
  referenceItem: { borderTopColor: "#dfe4e1", borderTopWidth: 0.5, display: "flex", flexDirection: "row", lineHeight: 1.2, paddingBottom: 3, paddingTop: 3 },
  referenceCode: { color: "#9b6500", fontWeight: 700, width: 24 },
  referenceTitle: { flex: 1 },
  inspectorCell: { minHeight: 42, width: "33.333%" },
  formalSignature: { height: 25, objectFit: "contain", objectPosition: "left", width: 100 },
  regulatory: { borderBottomColor: line, borderBottomWidth: 0.7, borderLeftColor: line, borderLeftWidth: 0.7, borderRightColor: line, borderRightWidth: 0.7, fontSize: 5.6, lineHeight: 1.3, padding: 5, textAlign: "center" },
  pageCount: { fontSize: 6, marginTop: 3, textAlign: "right" },
  legalBlock: { borderBottomColor: "#dce2df", borderBottomWidth: 1, paddingBottom: 14, paddingTop: 14 },
  legalTitle: { fontSize: 11, fontWeight: 700, marginBottom: 6 },
  legalBody: { fontSize: 9, lineHeight: 1.55 },
});

const reportTypes = [
  ["complete", "Complete"],
  ["limited", "Limited"],
  ["supplemental", "Supplemental"],
  ["reinspection", "Reinspection"],
] as const;

function date(value: string | null) {
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
  return uniqueParties.map((party) => [party.name, party.company, party.email].filter(Boolean).join("\n")).join("\n\n");
}

const classificationLabels: Record<string, string> = {
  section_i: "Section I",
  section_ii: "Section II",
  further_inspection: "Further inspection",
  other: "Other",
  note: "Note",
};

function normalizeText(value: string, organizationName?: string) {
  let normalized = value.replace(/\s+/g, " ").trim();
  if (organizationName) {
    normalized = normalized
      .replace(/\bCOMPANY\b/g, organizationName)
      .replace(/\bSUPLEMENTAL\b/gi, "SUPPLEMENTAL");
  }
  return normalized;
}

function findingAreaTitle(title: string, reference: string) {
  const escapedReference = reference.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return normalizeText(title)
    .replace(new RegExp(`^${escapedReference}\\s*[^A-Za-z0-9/]*\\s*`, "i"), "")
    .trim() || "Finding";
}

function findingCopy(description: string) {
  const normalized = normalizeText(description);
  const marker = normalized.indexOf("Finding:");
  if (marker <= 0) return { condition: null, body: normalized.replace(/^Finding:\s*/i, "") };
  return {
    condition: normalized.slice(0, marker).trim(),
    body: normalized.slice(marker + "Finding:".length).trim(),
  };
}

function recommendationCopy(description: string, organizationName: string) {
  const normalized = normalizeText(description, organizationName);
  return normalized.replace(/^o restore\b/i, "To restore");
}

function Choice({ label, selected }: { label: string; selected: boolean }) {
  return (
    <View style={styles.choiceWrap}>
      <View style={[styles.choiceBox, selected ? styles.choiceBoxSelected : {}]}>
        {selected ? (
          <Svg height={6} viewBox="0 0 8 8" width={6}>
            <Path d="M1 4.2 3 6.2 7 1.8" fill="none" stroke={ink} strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.4} />
          </Svg>
        ) : null}
      </View>
      <Text style={[styles.choice, selected ? styles.choiceSelected : {}]}>{label}</Text>
    </View>
  );
}

function Footer({ snapshot }: { snapshot: InspectionReportSnapshot }) {
  return (
    <Text
      fixed
      style={styles.footer}
      render={({ pageNumber, totalPages }) =>
        `${snapshot.organization.legalName} · Inspection Report #${snapshot.job.number} · Page ${pageNumber} of ${totalPages}`
      }
    />
  );
}

function LegalPage({
  snapshot,
  title,
  blocks,
  sectionNumber,
}: {
  snapshot: InspectionReportSnapshot;
  title: string;
  blocks: InspectionReportSnapshot["legalContent"];
  sectionNumber: string;
}) {
  return (
    <Page size="LETTER" style={styles.page} wrap>
      <View style={styles.sectionHeader}><Text style={styles.sectionNumber}>{sectionNumber}</Text><Text style={styles.sectionTitle}>{title}</Text></View>
      {blocks.map((block) => (
        <View key={block.id} style={styles.legalBlock} wrap={false}>
          <Text style={styles.legalTitle}>{block.title}</Text>
          <Text style={styles.legalBody}>{block.body}</Text>
        </View>
      ))}
      <Footer snapshot={snapshot} />
    </Page>
  );
}

export function InspectionReportPdf({
  snapshot,
  media,
}: {
  snapshot: InspectionReportSnapshot;
  media: ReportMedia;
}) {
  const fullAddress = [
    snapshot.property.streetLine1,
    snapshot.property.streetLine2,
    `${snapshot.property.city}, ${snapshot.property.region} ${snapshot.property.postalCode}`,
  ].filter(Boolean).join(", ");
  const companyAddress = [
    snapshot.organization.streetLine1,
    snapshot.organization.streetLine2,
    [snapshot.organization.city, snapshot.organization.region, snapshot.organization.postalCode].filter(Boolean).join(", "),
  ].filter(Boolean).join("\n");
  const orderedBy = snapshot.parties.filter((party) => party.role === "ordered_by");
  const ownersAndInterests = snapshot.parties.filter((party) => ["property_owner", "party_of_interest"].includes(party.role));
  const recipients = snapshot.parties.filter((party) => party.role === "report_recipient" || party.sendByDefault);
  const reportPhotos = snapshot.photos.filter((photo) => !photo.isCover);
  const beforeFindings = snapshot.legalContent.filter((block) => block.placement === "before_findings");
  const afterFindings = snapshot.legalContent.filter((block) => block.placement === "after_findings");
  const conditions = [
    ["Subterranean termites", snapshot.findingSummary.subterraneanTermites],
    ["Drywood termites", snapshot.findingSummary.drywoodTermites],
    ["Fungus / dryrot", snapshot.findingSummary.fungusDryrot],
    ["Other findings", snapshot.findingSummary.otherFindings],
    ["Further inspection", snapshot.findingSummary.furtherInspection],
  ] as const;
  let sectionNumber = 2;

  return (
    <Document title={`Inspection Report ${snapshot.job.number}`} author={snapshot.organization.legalName}>
      <Page size="LETTER" style={[styles.page, styles.cover]}>
        <View style={[styles.coverBand, !media.coverUrl ? styles.coverBandNoPhoto : {}]}>
          {media.companyLogoDarkUrl ? (
            <Image src={media.companyLogoDarkUrl} style={styles.coverLogo} />
          ) : (
            <Text style={styles.brand}>{snapshot.organization.legalName}</Text>
          )}
          <Text style={styles.reportType}>{snapshot.job.reportType.replaceAll("_", " ")} inspection report</Text>
          <Text style={styles.coverTitle}>{snapshot.property.streetLine1}</Text>
          <Text style={styles.coverAddress}>{snapshot.property.city}, {snapshot.property.region} {snapshot.property.postalCode}</Text>
        </View>
        {media.coverUrl ? <Image src={media.coverUrl} style={styles.coverPhoto} /> : null}
        <View style={styles.coverMeta}>
          <View style={styles.metaItem}><Text style={styles.label}>Report</Text><Text style={styles.value}>#{snapshot.job.number}</Text></View>
          <View style={styles.metaItem}><Text style={styles.label}>Inspection date</Text><Text style={styles.value}>{date(snapshot.job.inspectionAt)}</Text></View>
          <View style={styles.metaItem}><Text style={styles.label}>Inspector</Text><Text style={styles.value}>{snapshot.inspector?.name ?? "Not recorded"}</Text></View>
        </View>
      </Page>

      <Page size="LETTER" style={[styles.page, styles.formalPage]}>
        <Text style={styles.formalTitle}>Wood Destroying Pests and Organisms Inspection Report</Text>
        <View style={styles.table}>
          <View style={[styles.cell, styles.firstCell, { width: "55%" }]}><Text style={styles.cellLabel}>Property address</Text><Text style={styles.cellValue}>{fullAddress}</Text></View>
          <View style={[styles.cell, { width: "18%" }]}><Text style={styles.cellLabel}>Report number</Text><Text style={styles.cellValue}>{snapshot.job.number}</Text></View>
          <View style={[styles.cell, { width: "27%" }]}><Text style={styles.cellLabel}>Date of inspection</Text><Text style={styles.cellValue}>{date(snapshot.job.inspectionAt)}</Text><Text style={styles.pageCount} render={({ totalPages }) => `Page 2 of ${totalPages}`} /></View>
        </View>
        <View style={[styles.table, styles.companyRow]}>
          <View style={[styles.cell, styles.firstCell, styles.companyLogoCell]}>{media.companyLogoLightUrl ? <Image src={media.companyLogoLightUrl} style={styles.companyLogo} /> : <Text style={styles.companyLogoFallback}>{snapshot.organization.legalName}</Text>}</View>
          <View style={[styles.cell, styles.companyDetails]}><Text style={styles.cellValue}>{snapshot.organization.legalName}</Text><Text style={styles.paragraph}>{companyAddress || "Company address not recorded"}</Text><Text>{[snapshot.organization.phone, snapshot.organization.email, snapshot.organization.website].filter(Boolean).join("\n")}</Text></View>
          <View style={[styles.cell, styles.companyLicenses]}>
            {snapshot.organization.registrationNumber ? <Text style={styles.paragraph}>Registration: {snapshot.organization.registrationNumber}</Text> : null}
            {snapshot.organization.operatorLicense ? <Text style={styles.paragraph}>Operator license: {snapshot.organization.operatorLicense}</Text> : null}
            {snapshot.organization.contractorLicense ? <Text style={styles.paragraph}>Contractor license: {snapshot.organization.contractorLicense}</Text> : null}
          </View>
        </View>
        <View style={styles.table}>
          <View style={[styles.cell, styles.firstCell, styles.partyCell]}><Text style={styles.cellLabel}>Ordered by</Text><Text>{partyText(orderedBy)}</Text></View>
          <View style={[styles.cell, styles.partyCell]}><Text style={styles.cellLabel}>Property owner / party of interest</Text><Text>{partyText(ownersAndInterests)}</Text></View>
          <View style={[styles.cell, styles.partyCell]}><Text style={styles.cellLabel}>Report sent to</Text><Text>{partyText(recipients)}</Text></View>
        </View>
        <View style={styles.typeRow}>{reportTypes.map(([value, label]) => <Choice key={value} label={`${label} report`} selected={snapshot.job.reportType === value} />)}</View>
        <View style={styles.table}>
          <View style={[styles.cell, styles.firstCell, styles.propertyDescription]}><Text style={styles.cellLabel}>General description</Text><Text>{snapshot.job.generalDescription || "Not recorded"}</Text></View>
          <View style={[styles.cell, styles.propertyMeta]}>
            <Text style={styles.propertyMetaItem}>Escrow: {snapshot.job.escrowNumber || "Not recorded"}</Text>
            <Text style={styles.propertyMetaItem}>Inspection tag posted: {snapshot.job.inspectionTagPosted || "Not recorded"}</Text>
            <Text style={styles.propertyMetaItem}>Other tags: {snapshot.job.otherTagsPosted || "None recorded"}</Text>
            <Text>Garage: {snapshot.job.garageDescription || "Not recorded"}</Text>
          </View>
        </View>
        <Text style={styles.scope}>An inspection was made of the structure(s) shown on the diagram in accordance with the Structural Pest Control Act. Areas or structures not shown on the diagram were not inspected.</Text>
        <View style={styles.typeRow}>{conditions.map(([label, selected]) => <Choice key={label} label={label} selected={selected} />)}</View>
        <View style={styles.diagramRow}>
          <View style={styles.diagramCell}>{media.diagramUrl ? <Image src={media.diagramUrl} style={styles.diagram} /> : <Text>Diagram not required or not provided</Text>}</View>
          <View style={styles.referenceList}>
            <Text style={styles.cellLabel}>Finding references</Text>
            {snapshot.findings.filter((finding) => finding.entryType === "finding").slice(0, 25).map((finding) => (
              <View key={finding.id} style={styles.referenceItem}>
                <Text style={styles.referenceCode}>{finding.reference}</Text>
                <Text style={styles.referenceTitle}>{findingAreaTitle(finding.title, finding.reference)}</Text>
              </View>
            ))}
          </View>
        </View>
        <View style={styles.table}>
          <View style={[styles.cell, styles.firstCell, styles.inspectorCell]}><Text style={styles.cellLabel}>Inspected by</Text><Text style={styles.cellValue}>{snapshot.inspector?.name ?? "Not recorded"}</Text><Text>{snapshot.inspector?.phone || snapshot.inspector?.email || ""}</Text></View>
          <View style={[styles.cell, styles.inspectorCell]}><Text style={styles.cellLabel}>State license</Text><Text style={styles.cellValue}>{snapshot.inspector?.licenseNumber ?? "Not recorded"}</Text></View>
          <View style={[styles.cell, styles.inspectorCell]}><Text style={styles.cellLabel}>Signature</Text>{media.signatureUrl ? <Image src={media.signatureUrl} style={styles.formalSignature} /> : <Text>Not included</Text>}</View>
        </View>
        <Text style={styles.regulatory}>{snapshot.organization.regulatoryContact || "Questions about this report should first be directed to the inspection company. Regulatory contact information may be maintained in the company profile."}</Text>
      </Page>

      {beforeFindings.length ? <LegalPage blocks={beforeFindings} sectionNumber="01" snapshot={snapshot} title="Important report information" /> : null}

      <Page size="LETTER" style={styles.page} wrap>
        <View style={styles.sectionHeader}><Text style={styles.sectionNumber}>{String(sectionNumber++).padStart(2, "0")}</Text><Text style={styles.sectionTitle}>Findings and recommendations</Text></View>
        {snapshot.findings.length ? snapshot.findings.map((finding) => {
          const copy = findingCopy(finding.description);
          const classification = classificationLabels[finding.classification ?? ""] ?? finding.classification?.replaceAll("_", " ") ?? "Unclassified";
          return (
            <View style={styles.finding} key={finding.id}>
              <Text style={styles.reference}>{finding.reference}</Text>
              <View style={styles.findingBody}>
                <View style={styles.findingHeading}>
                  <Text style={styles.findingTitle}>{findingAreaTitle(finding.title, finding.reference)}</Text>
                  <Text style={styles.classification}>{classification}</Text>
                </View>
                {copy.condition ? <Text style={styles.findingCondition}>{copy.condition}</Text> : null}
                <Text style={styles.findingText}>{finding.entryType === "note" ? "Note: " : "Finding: "}{copy.body}</Text>
                {finding.recommendations.map((recommendation) => (
                  <Text style={styles.recommendation} key={recommendation.id}>
                    Recommendation: {recommendationCopy(recommendation.description, snapshot.organization.legalName)}
                    {recommendation.estimatedCost !== null ? ` · $${recommendation.estimatedCost.toFixed(2)}` : ""}
                  </Text>
                ))}
              </View>
            </View>
          );
        }) : <Text>No findings or report notes were entered.</Text>}
        <Footer snapshot={snapshot} />
      </Page>

      {afterFindings.length ? <LegalPage blocks={afterFindings} sectionNumber={String(sectionNumber++).padStart(2, "0")} snapshot={snapshot} title="Report notices" /> : null}

      <Page size="LETTER" style={styles.page} wrap>
        {reportPhotos.length ? (
          <>
          <View style={styles.sectionHeader}><Text style={styles.sectionNumber}>{String(sectionNumber++).padStart(2, "0")}</Text><Text style={styles.sectionTitle}>Report photographs</Text></View>
          <View style={styles.photoGrid}>
            {reportPhotos.map((photo) => media.photoUrls[photo.id] ? (
              <View style={[styles.photo, reportPhotos.length === 1 ? styles.photoSingle : {}]} key={photo.id} wrap={false}>
                <Image src={media.photoUrls[photo.id]} style={[styles.photoImage, reportPhotos.length === 1 ? styles.photoImageSingle : {}]} />
                {photo.caption || photo.location ? (
                  <Text style={styles.photoCaption}>{[photo.location, normalizeText(photo.caption)].filter(Boolean).join(" · ")}</Text>
                ) : null}
              </View>
            ) : null)}
          </View>
          </>
        ) : null}
        <View style={styles.certificationSection} wrap={false}>
        <Text style={styles.certificationTitle}>{String(sectionNumber).padStart(2, "0")}  Inspector certification</Text>
        <Text style={styles.certification}>This report reflects the visible and accessible conditions observed on the inspection date. Findings and recommendations are limited to the scope and conditions documented in this report.</Text>
        <View style={styles.certificationIdentity}>
          {media.signatureUrl ? <Image src={media.signatureUrl} style={styles.signature} /> : null}
          <View style={styles.certificationName}>
            <Text style={styles.value}>{snapshot.inspector?.name ?? "Inspector"}</Text>
            <Text>{snapshot.inspector?.licenseNumber ? `License ${snapshot.inspector.licenseNumber}` : "License not recorded"}</Text>
          </View>
        </View>
        </View>
        <Footer snapshot={snapshot} />
      </Page>
    </Document>
  );
}
