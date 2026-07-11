type SummaryLine = {
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

const DEFAULT_SUMMARY_MODEL = "gpt-4.1";

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

export async function generateProposalCustomerSummary(input: ProposalSummaryInput) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return { text: fallbackSummary(input), source: { provider: "fallback", reason: "openai_not_configured" } };
  }

  const model = process.env.OPENAI_MODEL || DEFAULT_SUMMARY_MODEL;
  const rawFindings = input.lines.map((line, index) => ({
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
        max_output_tokens: 1100,
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
                "Return only the customer-facing summary text.",
              ].join(" "),
            }],
          },
          {
            role: "user",
            content: [{
              type: "input_text",
              text: [
                "Write a well-structured summary for inclusion on the customer review page, email context, and proposal/work authorization document.",
                "",
                "Use these exact section headings:",
                "Overview",
                "Issues Found",
                "Recommended Actions",
                "Overall Recommendation",
                "",
                "Formatting requirements:",
                "- Keep the Overview to 2-3 sentences.",
                "- In Issues Found, group related items by area/category when possible.",
                "- In Recommended Actions, explain what work is being recommended and the practical reason for it.",
                "- In Overall Recommendation, write one short paragraph that encourages the customer to review the attached termite report and proposal/work authorization and reply with questions before signing.",
                "- Do not use markdown tables.",
                "- Do not include prices except the proposal total.",
                "- Keep it readable for a homeowner or real-estate client.",
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
    const directText = typeof payload.output_text === "string" ? payload.output_text.trim() : "";
    const nestedText = Array.isArray(payload.output)
      ? payload.output
          .flatMap((item: { content?: Array<{ text?: string }> }) => item.content ?? [])
          .map((content: { text?: string }) => content.text ?? "")
          .join("\n")
          .trim()
      : "";
    const text = directText || nestedText;
    if (!text) throw new Error("OpenAI summary response was empty.");
    return { text, source: { provider: "openai", model } };
  } catch (error) {
    return {
      text: fallbackSummary(input),
      source: {
        provider: "fallback",
        reason: error instanceof Error ? error.message : "openai_failed",
      },
    };
  }
}
