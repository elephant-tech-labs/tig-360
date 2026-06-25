import type { ReactNode } from "react";
import {
  Link,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";
import {
  parseRichDocument,
  type RichTextMark,
  type RichTextNode,
} from "@/lib/report-content";

const styles = StyleSheet.create({
  content: { color: "#35413d" },
  paragraph: { fontSize: 9, lineHeight: 1.55, marginBottom: 7 },
  heading2: { fontSize: 12, fontWeight: 700, marginBottom: 7, marginTop: 8 },
  heading3: { fontSize: 10, fontWeight: 700, marginBottom: 6, marginTop: 7 },
  bold: { fontWeight: 700 },
  italic: { fontStyle: "italic" },
  underline: { textDecoration: "underline" },
  strike: { textDecoration: "line-through" },
  link: { color: "#8b5a00", textDecoration: "underline" },
  blockquote: {
    borderLeftColor: "#f7a924",
    borderLeftWidth: 2,
    marginBottom: 8,
    marginTop: 4,
    paddingLeft: 8,
  },
  rule: {
    borderTopColor: "#c8d0cd",
    borderTopWidth: 1,
    marginBottom: 10,
    marginTop: 7,
  },
  list: { marginBottom: 7 },
  listItem: {
    display: "flex",
    flexDirection: "row",
    marginBottom: 3,
  },
  listMarker: { fontSize: 9, lineHeight: 1.55, width: 15 },
  listBody: { flex: 1 },
  table: {
    borderLeftColor: "#aeb8b4",
    borderLeftWidth: 0.7,
    borderTopColor: "#aeb8b4",
    borderTopWidth: 0.7,
    marginBottom: 10,
    marginTop: 6,
    width: "100%",
  },
  tableRow: { display: "flex", flexDirection: "row" },
  tableCell: {
    borderBottomColor: "#aeb8b4",
    borderBottomWidth: 0.7,
    borderRightColor: "#aeb8b4",
    borderRightWidth: 0.7,
    flexBasis: 0,
    flexGrow: 1,
    minHeight: 22,
    padding: 5,
  },
  tableHeader: { backgroundColor: "#f1f3f2" },
  tableText: { fontSize: 8, lineHeight: 1.35, marginBottom: 3 },
});

const textAlignStyles = {
  center: { textAlign: "center" as const },
  justify: { textAlign: "justify" as const },
  left: { textAlign: "left" as const },
  right: { textAlign: "right" as const },
};

function safeLink(value: string | undefined) {
  if (!value) return "#";
  return /^(https?:|mailto:|tel:)/i.test(value) ? value : "#";
}

function textAlignment(node: RichTextNode) {
  const alignment = String(node.attrs?.textAlign ?? "left");
  return textAlignStyles[alignment as keyof typeof textAlignStyles] ?? textAlignStyles.left;
}

function markStyles(marks: RichTextMark[] = []) {
  const result: Array<(typeof styles)[keyof typeof styles]> = [];
  for (const mark of marks) {
    if (mark.type === "bold") result.push(styles.bold);
    if (mark.type === "italic") result.push(styles.italic);
    if (mark.type === "underline") result.push(styles.underline);
    if (mark.type === "strike") result.push(styles.strike);
  }
  return result;
}

function renderInline(nodes: RichTextNode[] = [], path = "inline"): ReactNode[] {
  return nodes.map((node, index) => {
    const key = `${path}-${index}`;
    if (node.type === "hardBreak") return "\n";
    if (node.type !== "text") return renderInline(node.content, key);

    const link = node.marks?.find((mark) => mark.type === "link");
    const content = node.text ?? "";
    const textStyles = markStyles(node.marks);
    if (link) {
      return (
        <Link key={key} src={safeLink(link.attrs?.href)} style={[styles.link, ...textStyles]}>
          {content}
        </Link>
      );
    }
    return <Text key={key} style={textStyles}>{content}</Text>;
  });
}

function renderList(node: RichTextNode, ordered: boolean, path: string) {
  const start = Number(node.attrs?.start) || 1;
  return (
    <View key={path} style={styles.list}>
      {(node.content ?? []).map((item, index) => (
        <View key={`${path}-item-${index}`} style={styles.listItem} wrap={false}>
          <Text style={styles.listMarker}>{ordered ? `${start + index}.` : "•"}</Text>
          <View style={styles.listBody}>
            {renderBlocks(item.content, `${path}-item-${index}`)}
          </View>
        </View>
      ))}
    </View>
  );
}

function renderTable(node: RichTextNode, path: string) {
  return (
    <View key={path} style={styles.table}>
      {(node.content ?? []).map((row, rowIndex) => (
        <View key={`${path}-row-${rowIndex}`} style={styles.tableRow} wrap={false}>
          {(row.content ?? []).map((cell, cellIndex) => {
            const colspan = Number(cell.attrs?.colspan) || 1;
            const rowspan = Number(cell.attrs?.rowspan) || 1;
            return (
              <View
                key={`${path}-cell-${rowIndex}-${cellIndex}`}
                style={[
                  styles.tableCell,
                  cell.type === "tableHeader" ? styles.tableHeader : {},
                  { flexGrow: colspan, minHeight: 22 * rowspan },
                ]}
              >
                {renderBlocks(cell.content, `${path}-cell-${rowIndex}-${cellIndex}`, true)}
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

function renderBlocks(
  nodes: RichTextNode[] = [],
  path = "block",
  inTable = false,
): ReactNode[] {
  return nodes.map((node, index) => {
    const key = `${path}-${index}`;
    if (node.type === "paragraph") {
      return (
        <Text
          key={key}
          style={[
            inTable ? styles.tableText : styles.paragraph,
            textAlignment(node),
          ]}
        >
          {renderInline(node.content, key)}
        </Text>
      );
    }
    if (node.type === "heading") {
      return (
        <Text
          key={key}
          style={[
            Number(node.attrs?.level) === 3 ? styles.heading3 : styles.heading2,
            textAlignment(node),
          ]}
        >
          {renderInline(node.content, key)}
        </Text>
      );
    }
    if (node.type === "bulletList") return renderList(node, false, key);
    if (node.type === "orderedList") return renderList(node, true, key);
    if (node.type === "blockquote") {
      return <View key={key} style={styles.blockquote}>{renderBlocks(node.content, key)}</View>;
    }
    if (node.type === "horizontalRule") return <View key={key} style={styles.rule} />;
    if (node.type === "table") return renderTable(node, key);
    if (node.type === "text" || node.type === "hardBreak") {
      return <Text key={key} style={inTable ? styles.tableText : styles.paragraph}>{renderInline([node], key)}</Text>;
    }
    return <View key={key}>{renderBlocks(node.content, key, inTable)}</View>;
  });
}

export function RichReportContentPdf({
  document,
  fallbackText,
}: {
  document: unknown;
  fallbackText: string;
}) {
  const richDocument = parseRichDocument(document, fallbackText);
  return <View style={styles.content}>{renderBlocks(richDocument.content)}</View>;
}
