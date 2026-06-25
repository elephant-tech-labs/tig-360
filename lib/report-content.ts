export type RichTextMark = {
  type: "bold" | "italic" | "underline" | "strike" | "link";
  attrs?: {
    href?: string;
    target?: string;
    rel?: string;
  };
};

export type RichTextNode = {
  type: string;
  attrs?: Record<string, unknown>;
  content?: RichTextNode[];
  marks?: RichTextMark[];
  text?: string;
};

export type RichTextDocument = RichTextNode & {
  type: "doc";
  content: RichTextNode[];
};

const allowedNodeTypes = new Set([
  "doc",
  "paragraph",
  "heading",
  "text",
  "hardBreak",
  "bulletList",
  "orderedList",
  "listItem",
  "blockquote",
  "horizontalRule",
  "table",
  "tableRow",
  "tableHeader",
  "tableCell",
]);

const allowedMarkTypes = new Set<RichTextMark["type"]>([
  "bold",
  "italic",
  "underline",
  "strike",
  "link",
]);

function normalizeMarks(value: unknown): RichTextMark[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const marks: RichTextMark[] = [];
  for (const mark of value) {
    if (!mark || typeof mark !== "object") continue;
    const type = String((mark as RichTextMark).type) as RichTextMark["type"];
    if (!allowedMarkTypes.has(type)) continue;
    if (type !== "link") {
      marks.push({ type });
      continue;
    }
    const href = String((mark as RichTextMark).attrs?.href ?? "").trim();
    if (/^(https?:|mailto:|tel:)/i.test(href)) marks.push({ type, attrs: { href } });
  }
  return marks.length ? marks : undefined;
}

function normalizeNode(value: unknown, depth = 0): RichTextNode | null {
  if (!value || typeof value !== "object" || depth > 20) return null;
  const source = value as RichTextNode;
  if (!allowedNodeTypes.has(source.type)) return null;

  const node: RichTextNode = { type: source.type };
  if (source.type === "text") {
    node.text = String(source.text ?? "");
    node.marks = normalizeMarks(source.marks);
    return node;
  }

  const content = Array.isArray(source.content)
    ? source.content
        .map((child) => normalizeNode(child, depth + 1))
        .filter((child): child is RichTextNode => Boolean(child))
    : [];
  if (!["hardBreak", "horizontalRule"].includes(source.type)) node.content = content;

  if (source.type === "heading") {
    node.attrs = { level: Number(source.attrs?.level) === 3 ? 3 : 2 };
  }
  if (["paragraph", "heading"].includes(source.type)) {
    const textAlign = String(source.attrs?.textAlign ?? "left");
    node.attrs = {
      ...node.attrs,
      textAlign: ["left", "center", "right", "justify"].includes(textAlign)
        ? textAlign
        : "left",
    };
  }
  if (source.type === "orderedList") {
    node.attrs = { start: Math.max(1, Number(source.attrs?.start) || 1) };
  }
  if (["tableHeader", "tableCell"].includes(source.type)) {
    node.attrs = {
      colspan: Math.max(1, Math.min(12, Number(source.attrs?.colspan) || 1)),
      rowspan: Math.max(1, Math.min(50, Number(source.attrs?.rowspan) || 1)),
    };
  }
  return node;
}

export function plainTextToRichDocument(value: string): RichTextDocument {
  const paragraphs = value
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  return {
    type: "doc",
    content: (paragraphs.length ? paragraphs : [""]).map((paragraph) => ({
      type: "paragraph",
      content: paragraph
        ? paragraph.split("\n").flatMap((line, index, lines) => [
            ...(line ? [{ type: "text", text: line } satisfies RichTextNode] : []),
            ...(index < lines.length - 1 ? [{ type: "hardBreak" } satisfies RichTextNode] : []),
          ])
        : [],
    })),
  };
}

export function parseRichDocument(
  value: unknown,
  fallbackText = "",
): RichTextDocument {
  if (
    value
    && typeof value === "object"
    && (value as RichTextNode).type === "doc"
    && Array.isArray((value as RichTextNode).content)
  ) {
    const normalized = normalizeNode(value);
    if (normalized?.type === "doc") return normalized as RichTextDocument;
  }
  return plainTextToRichDocument(fallbackText);
}

function nodeText(node: RichTextNode): string {
  if (node.type === "text") return node.text ?? "";
  if (node.type === "hardBreak") return "\n";
  if (node.type === "tableCell" || node.type === "tableHeader") {
    return (node.content ?? []).map(nodeText).join(" ").trim();
  }
  const content = (node.content ?? []).map(nodeText).join("");
  if (["paragraph", "heading", "blockquote", "listItem", "tableRow"].includes(node.type)) {
    return `${content}\n`;
  }
  return content;
}

export function richDocumentToPlainText(document: RichTextDocument) {
  return nodeText(document)
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
