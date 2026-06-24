import { createResendProvider } from "./resend";
import type { EmailProvider } from "./types";
import { createZohoMailProvider } from "./zoho-mail";

export type { EmailAttachment, EmailRecipient, SendEmailInput, SendEmailResult } from "./types";

export function getEmailProvider(): EmailProvider {
  const selected = process.env.EMAIL_PROVIDER?.trim().toLowerCase();

  if (selected === "zoho_mail") return createZohoMailProvider();
  if (selected === "resend") return createResendProvider();

  if (process.env.ZOHO_MAIL_ACCOUNT_ID && process.env.ZOHO_REFRESH_TOKEN) {
    return createZohoMailProvider();
  }
  if (process.env.RESEND_API_KEY) return createResendProvider();

  throw new Error(
    "Email delivery is not configured. Set EMAIL_PROVIDER and the matching provider credentials.",
  );
}
