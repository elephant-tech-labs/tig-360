import { createHash } from "node:crypto";

type SummaryLine = {
  id: string;
  code: string | null;
  section: string | null;
  title: string;
  description: string | null;
  amount: number;
};

export type ProposalSummaryInput = {
  companyName: string;
  propertyAddress: string;
  reportType: string;
  total: number;
  lines: SummaryLine[];
};

type SummarySource = {
  provider: string;
  model?: string;
  reason?: string;
};

type GeneratedLineScope = {
  lineId: string;
  text: string;
  source: SummarySource;
};

export type ProposalSummaryBundle = {
  summary: {
    text: string;
    source: SummarySource;
  };
  lineScopes: GeneratedLineScope[];
};

const DEFAULT_SUMMARY_MODEL = "gpt-4.1";

function normalizeText(value: string | null | undefined) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function normalizeMoney(value: number) {
  return Number(Number(value ?? 0).toFixed(2));
}

export function buildProposalSummaryInputHash(input: ProposalSummaryInput) {
  const normalized = {
    companyName: normalizeText(input.companyName),
    propertyAddress: normalizeText(input.propertyAddress),
    reportType: normalizeText(input.reportType),
    total: normalizeMoney(input.total),
    lines: input.lines
      .map((line) => ({
        id: line.id,
        code: normalizeText(line.code),
        section: normalizeText(line.section),
        title: normalizeText(line.title),
        description: normalizeText(line.description),
        amount: normalizeMoney(line.amount),
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
  };
  return createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
}

function money(value: number) {
  return new Intl.NumberFormat("en-US", { currency: "USD", style: "currency" }).format(value);
}

function fallbackSummary(input: ProposalSummaryInput) {
  const lineCount = input.lines.length;
  const issueList = input.lines
    .slice(0, 4)
    .map((line) => `${line.code ? `${line.code}: ` : ""}${line.title}`)
    .join("; ");
  return [
    `We prepared a plain-English work authorization for the termite inspection at ${input.propertyAddress}.`,
    lineCount
      ? `The proposal includes ${lineCount} recommended item${lineCount === 1 ? "" : "s"} totaling ${money(input.total)}. The main items are: ${issueList}.`
      : `No priced work items are currently included in this proposal.`,
    `Please review the attached inspection report and proposal details. If you have questions, reply to the email and ${input.companyName} will walk through the recommendations with you before you decide how to proceed.`,
  ].join("\n\n");
}

function fallbackLineScope(line: SummaryLine) {
  const reference = line.code ? `Finding ${line.code}` : "the inspection report";
  const body = line.description?.trim();
  if (!body) return `Complete the recommended work for ${line.title}, as referenced in ${reference}.`;
  const compact = body
    .replace(/\s+/g, " ")
    .replace(/^recommendation:\s*/i, "")
    .trim();
  const limited = compact.length > 360 ? `${compact.slice(0, 340).replace(/\s+\S*$/, "")}...` : compact;
  return `${limited} See ${reference} in the inspection report for full details.`;
}

function extractResponseText(payload: { output_text?: unknown; output?: unknown }) {
  const directText = typeof payload.output_text === "string" ? payload.output_text.trim() : "";
  const nestedText = Array.isArray(payload.output)
    ? payload.output
        .flatMap((item: { content?: Array<{ text?: string }> }) => item.content ?? [])
        .map((content: { text?: string }) => content.text ?? "")
        .join("\n")
        .trim()
    : "";
  return directText || nestedText;
}

function fallbackBundle(input: ProposalSummaryInput, source: SummarySource): ProposalSummaryBundle {
  return {
    summary: {
      text: fallbackSummary(input),
      source,
    },
    lineScopes: input.lines.map((line) => ({
      lineId: line.id,
      text: fallbackLineScope(line),
      source,
    })),
  };
}

function coerceGeneratedBundle(input: ProposalSummaryInput, rawText: string, source: SummarySource): ProposalSummaryBundle {
  const cleaned = rawText
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();
  const parsed = JSON.parse(cleaned) as {
    proposal_summary?: unknown;
    line_item_scopes?: Array<{ line_item_id?: unknown; contract_scope?: unknown }>;
  };
  const summaryText = typeof parsed.proposal_summary === "string" ? parsed.proposal_summary.trim() : "";
  if (!summaryText) throw new Error("AI response did not include proposal_summary.");
  const scopesById = new Map(
    (parsed.line_item_scopes ?? [])
      .map((item) => [
        typeof item.line_item_id === "string" ? item.line_item_id : "",
        typeof item.contract_scope === "string" ? item.contract_scope.trim() : "",
      ] as const)
      .filter(([lineId, text]) => lineId && text),
  );
  return {
    summary: {
      text: summaryText,
      source,
    },
    lineScopes: input.lines.map((line) => ({
      lineId: line.id,
      text: scopesById.get(line.id) || fallbackLineScope(line),
      source,
    })),
  };
}

export async function generateProposalCustomerSummaryBundle(input: ProposalSummaryInput): Promise<ProposalSummaryBundle> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return fallbackBundle(input, { provider: "fallback", reason: "openai_not_configured" });
  }

  const model = process.env.OPENAI_MODEL || DEFAULT_SUMMARY_MODEL;
  const rawFindings = input.lines.map((line, index) => ({
    line_item_id: line.id,
    reference: line.code || `Item ${index + 1}`,
    section: line.section,
    title: line.title,
    findingAndRecommendation: line.description,
    proposedAmount: money(line.amount),
  }));

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_output_tokens: 1800,
        reasoning: { effort: "low" },
        text: { verbosity: "medium" },
        input: [
          {
            role: "system",
            content: [{
              type: "input_text",
              text: [
                "You are a professional termite and pest inspection report writer for a California inspection company.",
                "Convert inspection findings and proposed work lines into a clear, empathetic, plain-English customer proposal summary.",
                "The goal is to help the customer understand the report and proposal before deciding whether to sign, not to pressure them.",
                "Avoid technical jargon when a plain term is available.",
                "Do not invent facts, warranties, health claims, legal advice, exact timelines, financing terms, code requirements, or urgency beyond what the data supports.",
                "If the data is limited, say what the proposal covers rather than guessing.",
                "Use a calm, caring, professional tone.",
                "Return only valid JSON. Do not wrap it in markdown.",
              ].join(" "),
            }],
          },
          {
            role: "user",
            content: [{
              type: "input_text",
              text: [
                "Write one proposal summary and one concise contract scope for each line item.",
                "",
                "Return this exact JSON shape:",
                "{",
                "  \"proposal_summary\": \"string\",",
                "  \"line_item_scopes\": [",
                "    { \"line_item_id\": \"same id from input\", \"contract_scope\": \"string\" }",
                "  ]",
                "}",
                "",
                "For proposal_summary, use these exact section headings:",
                "Overview",
                "Issues Found",
                "Recommended Actions",
                "Overall Recommendation",
                "",
                "Proposal summary requirements:",
                "- Keep the Overview to 2-3 sentences.",
                "- In Issues Found, group related items by area/category when possible.",
                "- In Recommended Actions, explain what work is being recommended and the practical reason for it.",
                "- In Overall Recommendation, write one short paragraph that encourages the customer to review the attached termite report and proposal/work authorization and reply with questions before signing.",
                "- Do not use markdown tables.",
                "- Do not include prices except the proposal total.",
                "- Keep it readable for a homeowner or real-estate client.",
                "",
                "Line item contract_scope requirements:",
                "- Write 1-3 concise sentences for the formal proposal line item.",
                "- Summarize only the work recommended in the source text.",
                "- Do not add new work, warranty promises, guarantees, exclusions, or legal claims.",
                "- Preserve important limitations, access constraints, or customer-provided items if they appear in the source text.",
                "- End with a short reference to the source finding, e.g. \"See Finding 9A in the inspection report for full details.\"",
                "",
                "Proposal context:",
                JSON.stringify({
                  companyName: input.companyName,
                  propertyAddress: input.propertyAddress,
                  reportType: input.reportType,
                  proposalTotal: money(input.total),
                }),
                "",
                "Raw inspection/proposal data:",
                JSON.stringify(rawFindings),
              ].join("\n"),
            }],
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      throw new Error(`openai_http_${response.status}${errorText ? `:${errorText.slice(0, 240)}` : ""}`);
    }
    const payload = await response.json();
    const text = extractResponseText(payload);
    if (!text) throw new Error("OpenAI summary response was empty.");
    return coerceGeneratedBundle(input, text, { provider: "openai", model });
  } catch (error) {
    return fallbackBundle(input, {
      provider: "fallback",
      reason: error instanceof Error ? error.message : "openai_failed",
    });
  }
}

export async function generateProposalCustomerSummary(input: ProposalSummaryInput) {
  const bundle = await generateProposalCustomerSummaryBundle(input);
  return {
    text: bundle.summary.text,
    source: bundle.summary.source,
  };
}
