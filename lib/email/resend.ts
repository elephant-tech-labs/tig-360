import type { EmailProvider, SendEmailInput } from "./types";

function addresses(recipients: SendEmailInput["to"]) {
  return recipients.map((recipient) =>
    recipient.name ? `${recipient.name} <${recipient.email}>` : recipient.email,
  );
}

export function createResendProvider(): EmailProvider {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.REPORT_EMAIL_FROM;
  if (!apiKey || !from) throw new Error("Resend email delivery is not configured.");

  return {
    name: "resend",
    async send(input) {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": input.idempotencyKey,
        },
        body: JSON.stringify({
          from,
          to: addresses(input.to),
          cc: addresses(input.cc),
          bcc: addresses(input.bcc),
          reply_to: input.replyTo || undefined,
          subject: input.subject,
          text: input.text,
          attachments: input.attachments.map((attachment) => ({
            filename: attachment.filename,
            content: Buffer.from(attachment.bytes).toString("base64"),
          })),
        }),
      });
      const result = await response.json() as { id?: string; message?: string };
      if (!response.ok || !result.id) {
        throw new Error(result.message ?? "Resend rejected the email.");
      }
      return { provider: "resend", messageId: result.id };
    },
  };
}
