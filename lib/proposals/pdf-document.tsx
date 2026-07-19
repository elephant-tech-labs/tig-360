import {
  Document,
  Page,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";
import { RichReportContentPdf } from "@/lib/reports/rich-content-pdf";
import type { ProposalSnapshot } from "@/lib/proposals/types";

const accent = "#f7a924";
const ink = "#1c1c1c";
const muted = "#6b6b6b";
const line = "#c8c8c8";

const styles = StyleSheet.create({
  page: { color: ink, fontFamily: "Helvetica", fontSize: 9, padding: 34 },
  header: { borderBottomColor: accent, borderBottomWidth: 2, marginBottom: 18, paddingBottom: 12 },
  brand: { color: muted, fontSize: 8, fontWeight: 700, marginBottom: 7, textTransform: "uppercase" },
  title: { fontSize: 22, fontWeight: 700, lineHeight: 1.15 },
  subtitle: { color: muted, fontSize: 10, marginTop: 5 },
  metaGrid: { borderColor: line, borderWidth: 1, display: "flex", flexDirection: "row", marginBottom: 16 },
  metaCell: { borderLeftColor: line, borderLeftWidth: 1, flex: 1, padding: 8 },
  firstMetaCell: { borderLeftWidth: 0 },
  label: { color: muted, fontSize: 6, fontWeight: 700, marginBottom: 3, textTransform: "uppercase" },
  value: { fontSize: 9, fontWeight: 700, lineHeight: 1.3 },
  sectionTitle: { borderBottomColor: line, borderBottomWidth: 1, fontSize: 13, fontWeight: 700, marginBottom: 9, paddingBottom: 5 },
  parties: { display: "flex", flexDirection: "row", gap: 10, marginBottom: 16 },
  party: { borderColor: line, borderWidth: 1, flex: 1, minHeight: 56, padding: 8 },
  partyText: { fontSize: 8, lineHeight: 1.35 },
  table: { borderColor: line, borderWidth: 1, marginBottom: 14 },
  tableHeader: { backgroundColor: ink, color: "#fff", display: "flex", flexDirection: "row", fontSize: 6.5, fontWeight: 700, textTransform: "uppercase" },
  row: { borderTopColor: line, borderTopWidth: 1, display: "flex", flexDirection: "row", minHeight: 40 },
  col: { borderLeftColor: line, borderLeftWidth: 1, padding: 6 },
  firstCol: { borderLeftWidth: 0 },
  scopeCol: { width: "48%" },
  sectionCol: { width: "18%" },
  qtyCol: { textAlign: "right", width: "10%" },
  priceCol: { textAlign: "right", width: "12%" },
  amountCol: { textAlign: "right", width: "12%" },
  itemTitle: { fontSize: 8.5, fontWeight: 700, marginBottom: 3 },
  itemDescription: { color: "#333", fontSize: 7.5, lineHeight: 1.35 },
  totals: { alignSelf: "flex-end", borderColor: line, borderWidth: 1, marginBottom: 18, width: 220 },
  totalRow: { borderTopColor: line, borderTopWidth: 1, display: "flex", flexDirection: "row" },
  firstTotalRow: { borderTopWidth: 0 },
  totalLabel: { color: muted, flex: 1, fontSize: 8, padding: 6 },
  totalValue: { fontSize: 8, fontWeight: 700, padding: 6, textAlign: "right", width: 90 },
  grandTotal: { backgroundColor: "#fff7e8" },
  grandTotalText: { color: ink, fontSize: 11, fontWeight: 700 },
  note: { backgroundColor: "#f7f8f7", borderLeftColor: accent, borderLeftWidth: 2, fontSize: 8, lineHeight: 1.45, marginBottom: 14, padding: 9 },
  customerSummary: { backgroundColor: "#fffaf0", borderColor: "#ecd6a7", borderWidth: 1, fontSize: 9, lineHeight: 1.45, marginBottom: 16, padding: 10 },
  customerSummaryTitle: { color: ink, fontSize: 11, fontWeight: 700, marginBottom: 6 },
  signatureRow: { display: "flex", flexDirection: "row", gap: 18, marginTop: 28 },
  signatureBox: { borderTopColor: ink, borderTopWidth: 1, flex: 1, paddingTop: 6 },
  signatureTag: { color: "#222", fontSize: 8, marginBottom: 8 },
  termsBlock: { borderTopColor: line, borderTopWidth: 1, marginTop: 12, paddingTop: 12 },
  legalBlock: { borderBottomColor: "#dce2df", borderBottomWidth: 1, paddingBottom: 11, paddingTop: 11 },
  legalTitle: { fontSize: 10, fontWeight: 700, marginBottom: 5 },
  footer: { bottom: 18, color: muted, fontSize: 7, left: 34, position: "absolute", right: 34, textAlign: "center" },
});

function money(value: number) {
  return new Intl.NumberFormat("en-US", { currency: "USD", style: "currency" }).format(value);
}

function date(value: string | null) {
  if (!value) return "Not scheduled";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeZone: "America/Los_Angeles",
  }).format(new Date(value));
}

function sectionLabel(value: string | null) {
  const labels: Record<string, string> = {
    section_i: "Section I",
    section_ii: "Section II",
    further_inspection: "Further inspection",
    other: "Other",
    manual: "Manual",
  };
  return value ? labels[value] ?? value.replaceAll("_", " ") : "Manual";
}

function proposalDocumentTitle(title: string, jobNumber: string | number) {
  const jobReference = `#${jobNumber}`;
  return title.includes(jobReference) ? title : `${title} ${jobReference}`;
}
function partyBlock(snapshot: ProposalSnapshot, role: string, label: string) {
  const parties = snapshot.parties.filter((party) => party.role === role);
  return (
    <View style={styles.party}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.partyText}>
        {parties.length
          ? parties.map((party) => [party.name, party.company, party.email].filter(Boolean).join("\n")).join("\n\n")
          : "Not recorded"}
      </Text>
    </View>
  );
}

function Footer({ snapshot }: { snapshot: ProposalSnapshot }) {
  return (
    <Text
      fixed
      style={styles.footer}
      render={({ pageNumber, totalPages }) =>
        `${snapshot.organization.legalName} · Proposal #${snapshot.job.number} · Page ${pageNumber} of ${totalPages}`
      }
    />
  );
}

export function ProposalContractPdf({ snapshot }: { snapshot: ProposalSnapshot }) {
  const address = [
    snapshot.property.streetLine1,
    snapshot.property.streetLine2,
    snapshot.property.city,
    snapshot.property.region,
    snapshot.property.postalCode,
  ].filter(Boolean).join(", ");

  return (
    <Document title={proposalDocumentTitle(snapshot.proposal.title, snapshot.job.number)}>
      <Page size="LETTER" style={styles.page} wrap>
        <View style={styles.header}>
          <Text style={styles.brand}>{snapshot.organization.legalName}</Text>
          <Text style={styles.title}>Proposal and Work Authorization</Text>
          <Text style={styles.subtitle}>{address}</Text>
        </View>

        <View style={styles.metaGrid}>
          <View style={[styles.metaCell, styles.firstMetaCell]}><Text style={styles.label}>Job</Text><Text style={styles.value}>#{snapshot.job.number}</Text></View>
          <View style={styles.metaCell}><Text style={styles.label}>Inspection date</Text><Text style={styles.value}>{date(snapshot.job.inspectionAt)}</Text></View>
          <View style={styles.metaCell}><Text style={styles.label}>Generated</Text><Text style={styles.value}>{date(snapshot.capturedAt)}</Text></View>
        </View>

        <Text style={styles.sectionTitle}>Parties</Text>
        <View style={styles.parties}>
          {partyBlock(snapshot, "ordered_by", "Ordered by")}
          {partyBlock(snapshot, "property_owner", "Property owner")}
          {partyBlock(snapshot, "signer", "Signer")}
        </View>

        {snapshot.proposal.customerNote ? <Text style={styles.note}>{snapshot.proposal.customerNote}</Text> : null}
        {snapshot.proposal.customerSummary ? (
          <View style={styles.customerSummary}>
            <Text style={styles.customerSummaryTitle}>Proposal review summary</Text>
            <Text>{snapshot.proposal.customerSummary}</Text>
          </View>
        ) : null}

        <Text minPresenceAhead={140} style={styles.sectionTitle}>Authorized scope</Text>
        <View style={styles.table}>
          <View style={styles.tableHeader} wrap={false}>
            <Text style={[styles.col, styles.firstCol, styles.scopeCol]}>Scope</Text>
            <Text style={[styles.col, styles.sectionCol]}>Section</Text>
            <Text style={[styles.col, styles.qtyCol]}>Qty</Text>
            <Text style={[styles.col, styles.priceCol]}>Price</Text>
            <Text style={[styles.col, styles.amountCol]}>Amount</Text>
          </View>
          {snapshot.lines.map((line) => (
            <View key={line.id} style={styles.row} wrap={false}>
              <View style={[styles.col, styles.firstCol, styles.scopeCol]}>
                <Text style={styles.itemTitle}>{[line.code, line.title].filter(Boolean).join(" - ")}</Text>
                {line.description ? <Text style={styles.itemDescription}>{line.description}</Text> : null}
              </View>
              <Text style={[styles.col, styles.sectionCol]}>{sectionLabel(line.section)}</Text>
              <Text style={[styles.col, styles.qtyCol]}>{line.quantity}</Text>
              <Text style={[styles.col, styles.priceCol]}>{money(line.unitPrice)}</Text>
              <Text style={[styles.col, styles.amountCol]}>{money(line.amount)}</Text>
            </View>
          ))}
        </View>

        <View style={styles.totals}>
          <View style={[styles.totalRow, styles.firstTotalRow]}><Text style={styles.totalLabel}>Subtotal</Text><Text style={styles.totalValue}>{money(snapshot.proposal.subtotal)}</Text></View>
          <View style={styles.totalRow}><Text style={styles.totalLabel}>Discount</Text><Text style={styles.totalValue}>-{money(snapshot.proposal.discount)}</Text></View>
          <View style={styles.totalRow}><Text style={styles.totalLabel}>Tax</Text><Text style={styles.totalValue}>{money(snapshot.proposal.tax)}</Text></View>
          <View style={[styles.totalRow, styles.grandTotal]}><Text style={[styles.totalLabel, styles.grandTotalText]}>Total</Text><Text style={[styles.totalValue, styles.grandTotalText]}>{money(snapshot.proposal.total)}</Text></View>
        </View>

        {snapshot.proposal.terms ? (
          <View style={styles.termsBlock}>
            <Text style={styles.sectionTitle}>Terms</Text>
            <Text style={styles.itemDescription}>{snapshot.proposal.terms}</Text>
          </View>
        ) : null}

        {snapshot.contractContent.length ? (
          <View style={styles.termsBlock}>
            <Text style={styles.sectionTitle}>Contract disclosures</Text>
            {snapshot.contractContent.map((block) => (
              <View key={block.id} style={styles.legalBlock}>
                <Text style={styles.legalTitle}>{block.title}</Text>
                <RichReportContentPdf document={block.bodyJson} fallbackText={block.body} />
              </View>
            ))}
          </View>
        ) : null}

        <View style={styles.signatureRow} wrap={false}>
          <View style={styles.signatureBox}>
            <Text style={styles.signatureTag}>{"{{Signature:Recipient1*}}"}</Text>
            <Text>Owner / authorized signer</Text>
          </View>
          <View style={styles.signatureBox}>
            <Text style={styles.signatureTag}>{"{{Date:Recipient1}}"}</Text>
            <Text>Date</Text>
          </View>
          <View style={styles.signatureBox}>
            <Text style={styles.signatureTag}>{"{{Name:Recipient1}}"}</Text>
            <Text>Signer name</Text>
          </View>
        </View>
        <Footer snapshot={snapshot} />
      </Page>
    </Document>
  );
}
