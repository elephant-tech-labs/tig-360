export type EmailRecipient = {
  email: string;
  name?: string;
};

export type EmailAttachment = {
  bytes: Uint8Array;
  filename: string;
  contentType: string;
};

export type SendEmailInput = {
  to: EmailRecipient[];
  cc: EmailRecipient[];
  bcc: EmailRecipient[];
  subject: string;
  text: string;
  replyTo?: string | null;
  attachments: EmailAttachment[];
  idempotencyKey: string;
};

export type SendEmailResult = {
  provider: "zoho_mail" | "resend";
  messageId: string;
};

export interface EmailProvider {
  name: SendEmailResult["provider"];
  send(input: SendEmailInput): Promise<SendEmailResult>;
}
