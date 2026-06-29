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

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
        max_output_tokens: 700,
        input: [
          {
            role: "system",
            content: [{
              type: "input_text",
              text: [
                "Write a concise, caring, professional customer-facing summary for a termite inspection proposal.",
                "Do not invent facts, warranties, timelines, hazards, legal advice, or medical claims.",
                "Do not sound salesy or pushy. The tone should be calm, clear, helpful, and decision-supportive.",
                "Mention that the formal report and work authorization should be reviewed before signing.",
                "Use 2-4 short paragraphs, no markdown headings.",
              ].join(" "),
            }],
          },
          {
            role: "user",
            content: [{ type: "input_text", text: JSON.stringify(input) }],
          },
        ],
      }),
    });

    if (!response.ok) throw new Error(`OpenAI summary failed with HTTP ${response.status}.`);
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
    return { text, source: { provider: "openai", model: process.env.OPENAI_MODEL || "gpt-4.1-mini" } };
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
