/* eslint-disable jsx-a11y/alt-text */
import {
  Document,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";
import type { InspectionReportSnapshot, ReportMedia } from "@/lib/reports/types";

const styles = StyleSheet.create({
  page: { color: "#17201d", fontFamily: "Helvetica", fontSize: 9, padding: 34 },
  cover: { padding: 0 },
  coverBand: { backgroundColor: "#17201d", color: "#ffffff", height: 250, padding: 42 },
  brand: { color: "#8ed2b8", fontSize: 11, fontWeight: 700, marginBottom: 54, textTransform: "uppercase" },
  reportType: { color: "#8ed2b8", fontSize: 10, marginBottom: 10, textTransform: "uppercase" },
  coverTitle: { fontSize: 28, fontWeight: 700, lineHeight: 1.15, marginBottom: 8 },
  coverAddress: { color: "#c5d1cc", fontSize: 11 },
  coverPhoto: { height: 310, objectFit: "cover", width: "100%" },
  coverMeta: { display: "flex", flexDirection: "row", gap: 24, padding: 30 },
  metaItem: { flex: 1 },
  label: { color: "#68736f", fontSize: 7, marginBottom: 4, textTransform: "uppercase" },
  value: { fontSize: 10, fontWeight: 700 },
  sectionHeader: { borderBottomColor: "#167a5a", borderBottomWidth: 2, display: "flex", flexDirection: "row", marginBottom: 18, paddingBottom: 8 },
  sectionNumber: { color: "#167a5a", fontSize: 9, fontWeight: 700, marginRight: 10 },
  sectionTitle: { fontSize: 16, fontWeight: 700 },
  twoColumn: { display: "flex", flexDirection: "row", gap: 22, marginBottom: 16 },
  column: { flex: 1 },
  subheading: { fontSize: 10, fontWeight: 700, marginBottom: 6 },
  paragraph: { lineHeight: 1.5, marginBottom: 6 },
  partyGrid: { display: "flex", flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 },
  party: { backgroundColor: "#edf2ef", padding: 8, width: "48%" },
  finding: { borderBottomColor: "#dce2df", borderBottomWidth: 1, display: "flex", flexDirection: "row", gap: 12, paddingBottom: 12, paddingTop: 12 },
  reference: { backgroundColor: "#167a5a", color: "#ffffff", fontSize: 10, fontWeight: 700, padding: 7, textAlign: "center", width: 42 },
  findingBody: { flex: 1 },
  findingTitle: { fontSize: 10, fontWeight: 700, marginBottom: 5 },
  recommendation: { backgroundColor: "#f1f4f2", lineHeight: 1.45, marginTop: 6, padding: 7 },
  diagram: { maxHeight: 620, objectFit: "contain", width: "100%" },
  photoGrid: { display: "flex", flexDirection: "row", flexWrap: "wrap", gap: 12 },
  photo: { borderColor: "#dce2df", borderWidth: 1, padding: 6, width: "48%" },
  photoImage: { height: 180, objectFit: "contain", width: "100%" },
  photoCaption: { lineHeight: 1.35, marginTop: 6 },
  certification: { lineHeight: 1.6, marginBottom: 28 },
  signature: { height: 70, objectFit: "contain", objectPosition: "left", width: 180 },
  footer: { bottom: 18, color: "#68736f", fontSize: 7, left: 34, position: "absolute", right: 34, textAlign: "center" },
});

function date(value: string | null) {
  if (!value) return "Not recorded";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "long",
    timeZone: "America/Los_Angeles",
  }).format(new Date(value));
}

function Footer({ snapshot }: { snapshot: InspectionReportSnapshot }) {
  return <Text fixed style={styles.footer}>{snapshot.organization.name} · Inspection Report #{snapshot.job.number}</Text>;
}

export function InspectionReportPdf({
  snapshot,
  media,
}: {
  snapshot: InspectionReportSnapshot;
  media: ReportMedia;
}) {
  const fullAddress = `${snapshot.property.streetLine1}, ${snapshot.property.city}, ${snapshot.property.region} ${snapshot.property.postalCode}`;
  return (
    <Document title={`Inspection Report ${snapshot.job.number}`} author={snapshot.organization.name}>
      <Page size="LETTER" style={[styles.page, styles.cover]}>
        <View style={styles.coverBand}>
          <Text style={styles.brand}>{snapshot.organization.name}</Text>
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

      <Page size="LETTER" style={styles.page}>
        <View style={styles.sectionHeader}><Text style={styles.sectionNumber}>01</Text><Text style={styles.sectionTitle}>Inspection overview</Text></View>
        <View style={styles.twoColumn}>
          <View style={styles.column}>
            <Text style={styles.subheading}>Property</Text>
            <Text style={styles.paragraph}>{fullAddress}</Text>
            {snapshot.property.county ? <Text style={styles.paragraph}>County: {snapshot.property.county}</Text> : null}
            {snapshot.property.propertyType ? <Text style={styles.paragraph}>Property type: {snapshot.property.propertyType}</Text> : null}
          </View>
          <View style={styles.column}>
            <Text style={styles.subheading}>Inspection</Text>
            <Text style={styles.paragraph}>Inspector: {snapshot.inspector?.name ?? "Not recorded"}</Text>
            <Text style={styles.paragraph}>License: {snapshot.inspector?.licenseNumber ?? "Not recorded"}</Text>
            <Text style={styles.paragraph}>Date: {date(snapshot.job.inspectionAt)}</Text>
          </View>
        </View>
        {snapshot.job.generalDescription ? <><Text style={styles.subheading}>General description</Text><Text style={styles.paragraph}>{snapshot.job.generalDescription}</Text></> : null}
        <View style={styles.partyGrid}>
          {snapshot.parties.filter((party) => party.role !== "signer").map((party, index) => (
            <View style={styles.party} key={`${party.contactId}-${party.role}-${index}`}>
              <Text style={styles.label}>{party.roleLabel}</Text>
              <Text style={styles.value}>{party.name}</Text>
              <Text>{party.company || party.email || ""}</Text>
            </View>
          ))}
        </View>
        <Footer snapshot={snapshot} />
      </Page>

      <Page size="LETTER" style={styles.page} wrap>
        <View style={styles.sectionHeader}><Text style={styles.sectionNumber}>02</Text><Text style={styles.sectionTitle}>Findings and recommendations</Text></View>
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

      {media.diagramUrl ? (
        <Page size="LETTER" style={styles.page}>
          <View style={styles.sectionHeader}><Text style={styles.sectionNumber}>03</Text><Text style={styles.sectionTitle}>Property diagram</Text></View>
          <Image src={media.diagramUrl} style={styles.diagram} />
          <Footer snapshot={snapshot} />
        </Page>
      ) : null}

      {snapshot.photos.length ? (
        <Page size="LETTER" style={styles.page} wrap>
          <View style={styles.sectionHeader}><Text style={styles.sectionNumber}>{media.diagramUrl ? "04" : "03"}</Text><Text style={styles.sectionTitle}>Report photographs</Text></View>
          <View style={styles.photoGrid}>
            {snapshot.photos.map((photo, index) => media.photoUrls[photo.id] ? (
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
        <View style={styles.sectionHeader}><Text style={styles.sectionNumber}>05</Text><Text style={styles.sectionTitle}>Inspector certification</Text></View>
        <Text style={styles.certification}>This report reflects the visible and accessible conditions observed on the inspection date. Findings and recommendations are limited to the scope and conditions documented in this report.</Text>
        {media.signatureUrl ? <Image src={media.signatureUrl} style={styles.signature} /> : null}
        <Text style={styles.value}>{snapshot.inspector?.name ?? "Inspector"}</Text>
        <Text>{snapshot.inspector?.licenseNumber ? `License ${snapshot.inspector.licenseNumber}` : "License not recorded"}</Text>
        <Footer snapshot={snapshot} />
      </Page>
    </Document>
  );
}
