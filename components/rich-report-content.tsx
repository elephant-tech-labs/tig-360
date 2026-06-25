import type { CSSProperties, ReactNode } from "react";
import {
  parseRichDocument,
  type RichTextMark,
  type RichTextNode,
} from "@/lib/report-content";

type RichReportContentProps = {
  document: unknown;
  fallbackText: string;
};

function safeLink(value: string | undefined) {
  if (!value) return "#";
  return /^(https?:|mailto:|tel:)/i.test(value) ? value : "#";
}

function markedText(text: string, marks: RichTextMark[] = [], key: string): ReactNode {
  return marks.reduce<ReactNode>((content, mark, index) => {
    const markKey = `${key}-mark-${index}`;
    if (mark.type === "bold") return <strong key={markKey}>{content}</strong>;
    if (mark.type === "italic") return <em key={markKey}>{content}</em>;
    if (mark.type === "underline") return <u key={markKey}>{content}</u>;
    if (mark.type === "strike") return <s key={markKey}>{content}</s>;
    if (mark.type === "link") {
      return <a href={safeLink(mark.attrs?.href)} key={markKey}>{content}</a>;
    }
    return content;
  }, text);
}

function alignment(node: RichTextNode): CSSProperties | undefined {
  const textAlign = node.attrs?.textAlign;
  return ["left", "center", "right", "justify"].includes(String(textAlign))
    ? { textAlign: textAlign as CSSProperties["textAlign"] }
    : undefined;
}

function renderNodes(nodes: RichTextNode[] = [], path = "node"): ReactNode[] {
  return nodes.map((node, index) => {
    const key = `${path}-${index}`;
    const children = renderNodes(node.content, key);

    if (node.type === "text") {
      return <span key={key}>{markedText(node.text ?? "", node.marks, key)}</span>;
    }
    if (node.type === "hardBreak") return <br key={key} />;
    if (node.type === "paragraph") return <p key={key} style={alignment(node)}>{children}</p>;
    if (node.type === "heading") {
      const level = Number(node.attrs?.level) === 3 ? 3 : 2;
      return level === 3
        ? <h3 key={key} style={alignment(node)}>{children}</h3>
        : <h2 key={key} style={alignment(node)}>{children}</h2>;
    }
    if (node.type === "bulletList") return <ul key={key}>{children}</ul>;
    if (node.type === "orderedList") {
      return <ol key={key} start={Number(node.attrs?.start) || 1}>{children}</ol>;
    }
    if (node.type === "listItem") return <li key={key}>{children}</li>;
    if (node.type === "blockquote") return <blockquote key={key}>{children}</blockquote>;
    if (node.type === "horizontalRule") return <hr key={key} />;
    if (node.type === "table") return <table key={key}><tbody>{children}</tbody></table>;
    if (node.type === "tableRow") return <tr key={key}>{children}</tr>;
    if (node.type === "tableHeader") {
      return (
        <th
          colSpan={Number(node.attrs?.colspan) || 1}
          key={key}
          rowSpan={Number(node.attrs?.rowspan) || 1}
        >
          {children}
        </th>
      );
    }
    if (node.type === "tableCell") {
      return (
        <td
          colSpan={Number(node.attrs?.colspan) || 1}
          key={key}
          rowSpan={Number(node.attrs?.rowspan) || 1}
        >
          {children}
        </td>
      );
    }
    return <div key={key}>{children}</div>;
  });
}

export function RichReportContent({
  document,
  fallbackText,
}: RichReportContentProps) {
  const richDocument = parseRichDocument(document, fallbackText);
  return <div className="rich-report-content">{renderNodes(richDocument.content)}</div>;
}
