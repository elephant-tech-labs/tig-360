/* eslint-disable jsx-a11y/alt-text */
import {
  Document,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";
import type { InspectionReportSnapshot, ReportMedia, ReportParty } from "@/lib/reports/types";

const green = "#167a5a";
const ink = "#17201d";
const line = "#aeb8b4";

const styles = StyleSheet.create({
  page: { color: ink, fontFamily: "Helvetica", fontSize: 9, padding: 34 },
  cover: { padding: 0 },
  coverBand: { backgroundColor: ink, color: "#ffffff", height: 250, padding: 42 },
  brand: { color: "#8ed2b8", fontSize: 11, fontWeight: 700, marginBottom: 54, textTransform: "uppercase" },
  reportType: { color: "#8ed2b8", fontSize: 10, marginBottom: 10, textTransform: "uppercase" },
  coverTitle: { fontSize: 28, fontWeight: 700, lineHeight: 1.15, marginBottom: 8 },
  coverAddress: { color: "#c5d1cc", fontSize: 11 },
  coverPhoto: { height: 310, objectFit: "cover", width: "100%" },
  coverMeta: { display: "flex", flexDirection: "row", gap: 24, padding: 30 },
  metaItem: { flex: 1 },
  label: { color: "#68736f", fontSize: 7, marginBottom: 4, textTransform: "uppercase" },
  value: { fontSize: 10, fontWeight: 700 },
  sectionHeader: { borderBottomColor: green, borderBottomWidth: 2, display: "flex", flexDirection: "row", marginBottom: 18, paddingBottom: 8 },
  sectionNumber: { color: green, fontSize: 9, fontWeight: 700, marginRight: 10 },
  sectionTitle: { fontSize: 16, fontWeight: 700 },
  paragraph: { lineHeight: 1.5, marginBottom: 6 },
  finding: { borderBottomColor: "#dce2df", borderBottomWidth: 1, display: "flex", flexDirection: "row", gap: 12, paddingBottom: 12, paddingTop: 12 },
  reference: { backgroundColor: green, color: "#ffffff", fontSize: 10, fontWeight: 700, padding: 7, textAlign: "center", width: 42 },
  findingBody: { flex: 1 },
  findingTitle: { fontSize: 10, fontWeight: 700, marginBottom: 5 },
  recommendation: { backgroundColor: "#f1f4f2", lineHeight: 1.45, marginTop: 6, padding: 7 },
  photoGrid: { display: "flex", flexDirection: "row", flexWrap: "wrap", gap: 12 },
  photo: { borderColor: "#dce2df", borderWidth: 1, padding: 6, width: "48%" },
  photoImage: { height: 180, objectFit: "contain", width: "100%" },
  photoCaption: { lineHeight: 1.35, marginTop: 6 },
  certification: { lineHeight: 1.6, marginBottom: 28 },
  signature: { height: 70, objectFit: "contain", objectPosition: "left", width: 180 },
  footer: { bottom: 18, color: "#68736f", fontSize: 7, left: 34, position: "absolute", right: 34, textAlign: "center" },

  formalPage: { fontSize: 7.3, padding: 24 },
  formalTitle: { borderBottomColor: ink, borderBottomWidth: 2.5, fontSize: 15, fontWeight: 700, paddingBottom: 5, textAlign: "center", textTransform: "uppercase" },
  table: { borderBottomColor: line, borderBottomWidth: 0.7, borderLeftColor: line, borderLeftWidth: 0.7, borderRightColor: line, borderRightWidth: 0.7, display: "flex", flexDirection: "row" },
  cell: { borderLeftColor: line, borderLeftWidth: 0.7, padding: 5 },
  firstCell: { borderLeftWidth: 0 },
  cellLabel: { color: "#5f6c67", fontSize: 5.8, fontWeight: 700, marginBottom: 2, textTransform: "uppercase" },
  cellValue: { fontSize: 7.5, fontWeight: 700, lineHeight: 1.25 },
  companyRow: { minHeight: 84 },
  companyLogoCell: { alignItems: "center", display: "flex", justifyContent: "center", width: "25%" },
  companyLogo: { maxHeight: 62, objectFit: "contain", width: 125 },
  companyDetails: { width: "45%" },
  companyLicenses: { width: "30%" },
  partyCell: { minHeight: 83, width: "33.333%" },
  typeRow: { borderBottomColor: line, borderBottomWidth: 0.7, borderLeftColor: line, borderLeftWidth: 0.7, borderRightColor: line, borderRightWidth: 0.7, display: "flex", flexDirection: "row", justifyContent: "space-between", padding: 5 },
  choice: { color: "#68736f", fontSize: 6.2, fontWeight: 700, textTransform: "uppercase" },
  choiceSelected: { color: green },
  propertyDescription: { minHeight: 73, width: "64%" },
  propertyMeta: { width: "36%" },
  propertyMetaItem: { borderBottomColor: line, borderBottomWidth: 0.7, paddingBottom: 3, paddingTop: 3 },
  scope: { borderBottomColor: line, borderBottomWidth: 0.7, borderLeftColor: line, borderLeftWidth: 0.7, borderRightColor: line, borderRightWidth: 0.7, fontSize: 6.2, lineHeight: 1.3, padding: 5, textAlign: "center" },
  diagramRow: { borderBottomColor: line, borderBottomWidth: 0.7, borderLeftColor: line, borderLeftWidth: 0.7, borderRightColor: line, borderRightWidth: 0.7, display: "flex", flexDirection: "row", height: 330 },
  diagramCell: { alignItems: "center", borderRightColor: line, borderRightWidth: 0.7, display: "flex", justifyContent: "center", padding: 7, width: "72%" },
  diagram: { height: 300, objectFit: "contain", width: "100%" },
  referenceList: { padding: 7, width: "28%" },
  referenceItem: { borderTopColor: "#dfe4e1", borderTopWidth: 0.5, display: "flex", flexDirection: "row", lineHeight: 1.2, paddingBottom: 3, paddingTop: 3 },
  referenceCode: { color: green, fontWeight: 700, width: 24 },
  referenceTitle: { flex: 1 },
  inspectorCell: { minHeight: 52, width: "33.333%" },
  formalSignature: { height: 32, objectFit: "contain", objectPosition: "left", width: 110 },
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

function Footer({ snapshot }: { snapshot: InspectionReportSnapshot }) {
  return <Text fixed style={styles.footer}>{snapshot.organization.legalName} · Inspection Report #{snapshot.job.number}</Text>;
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
        <View style={styles.coverBand}>
          <Text style={styles.brand}>{snapshot.organization.legalName}</Text>
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
          <View style={[styles.cell, styles.firstCell, styles.companyLogoCell]}>{media.companyLogoUrl ? <Image src={media.companyLogoUrl} style={styles.companyLogo} /> : <Text style={styles.cellValue}>{snapshot.organization.legalName}</Text>}</View>
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
        <View style={styles.typeRow}>{reportTypes.map(([value, label]) => <Text key={value} style={[styles.choice, snapshot.job.reportType === value ? styles.choiceSelected : {}]}>{snapshot.job.reportType === value ? "■" : "□"} {label} report</Text>)}</View>
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
        <View style={styles.typeRow}>{conditions.map(([label, selected]) => <Text key={label} style={[styles.choice, selected ? styles.choiceSelected : {}]}>{selected ? "■" : "□"} {label}</Text>)}</View>
        <View style={styles.diagramRow}>
          <View style={styles.diagramCell}>{media.diagramUrl ? <Image src={media.diagramUrl} style={styles.diagram} /> : <Text>Diagram not required or not provided</Text>}</View>
          <View style={styles.referenceList}>
            <Text style={styles.cellLabel}>Finding references</Text>
            {snapshot.findings.filter((finding) => finding.entryType === "finding").slice(0, 25).map((finding) => (
              <View key={finding.id} style={styles.referenceItem}>
                <Text style={styles.referenceCode}>{finding.reference}</Text>
                <Text style={styles.referenceTitle}>{finding.title}</Text>
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
        {snapshot.findings.length ? snapshot.findings.map((finding) => (
          <View style={styles.finding} key={finding.id} wrap={false}>
            <Text style={styles.reference}>{finding.reference}</Text>
            <View style={styles.findingBody}>
              <Text style={styles.findingTitle}>{finding.title}</Text>
              <Text style={styles.paragraph}>{finding.entryType === "note" ? "Note: " : "Finding: "}{finding.description}</Text>
              {finding.recommendations.map((recommendation) => (
                <Text style={styles.recommendation} key={recommendation.id}>
                  Recommendation: {recommendation.description}
                  {recommendation.estimatedCost !== null ? ` · $${recommendation.estimatedCost.toFixed(2)}` : ""}
                </Text>
              ))}
            </View>
          </View>
        )) : <Text>No findings or report notes were entered.</Text>}
        <Footer snapshot={snapshot} />
      </Page>

      {afterFindings.length ? <LegalPage blocks={afterFindings} sectionNumber={String(sectionNumber++).padStart(2, "0")} snapshot={snapshot} title="Report notices" /> : null}

      {reportPhotos.length ? (
        <Page size="LETTER" style={styles.page} wrap>
          <View style={styles.sectionHeader}><Text style={styles.sectionNumber}>{String(sectionNumber++).padStart(2, "0")}</Text><Text style={styles.sectionTitle}>Report photographs</Text></View>
          <View style={styles.photoGrid}>
            {reportPhotos.map((photo, index) => media.photoUrls[photo.id] ? (
              <View style={styles.photo} key={photo.id} wrap={false}>
                <Image src={media.photoUrls[photo.id]} style={styles.photoImage} />
                <Text style={styles.photoCaption}>Photo {index + 1}{photo.location ? ` · ${photo.location}` : ""}{"\n"}{photo.caption || photo.filename}</Text>
              </View>
            ) : null)}
          </View>
          <Footer snapshot={snapshot} />
        </Page>
      ) : null}

      <Page size="LETTER" style={styles.page}>
        <View style={styles.sectionHeader}><Text style={styles.sectionNumber}>{String(sectionNumber).padStart(2, "0")}</Text><Text style={styles.sectionTitle}>Inspector certification</Text></View>
        <Text style={styles.certification}>This report reflects the visible and accessible conditions observed on the inspection date. Findings and recommendations are limited to the scope and conditions documented in this report.</Text>
        {media.signatureUrl ? <Image src={media.signatureUrl} style={styles.signature} /> : null}
        <Text style={styles.value}>{snapshot.inspector?.name ?? "Inspector"}</Text>
        <Text>{snapshot.inspector?.licenseNumber ? `License ${snapshot.inspector.licenseNumber}` : "License not recorded"}</Text>
        <Footer snapshot={snapshot} />
      </Page>
    </Document>
  );
}
