import type { EmailProvider, SendEmailInput } from "./types";
import { getZohoAccessToken } from "@/lib/zoho/oauth";

type ZohoAttachmentResponse = {
  data?: {
    attachmentName?: string;
    storeName?: string;
    attachmentPath?: string;
  } | Array<{
    attachmentName?: string;
    storeName?: string;
    attachmentPath?: string;
  }>;
  status?: {
    description?: string;
  };
};

type ZohoSendResponse = {
  data?: {
    messageId?: string;
  };
  status?: {
    description?: string;
  };
};

async function parseZohoResponse<T>(response: Response, operation: string) {
  const body = await response.text();
  try {
    return JSON.parse(body) as T;
  } catch {
    const contentType = response.headers.get("content-type") || "unknown content type";
    throw new Error(
      `Zoho Mail ${operation} returned HTTP ${response.status} (${contentType}) instead of JSON.`,
    );
  }
}

function addressList(recipients: SendEmailInput["to"]) {
  return recipients.map((recipient) =>
    recipient.name ? `${recipient.name}<${recipient.email}>` : recipient.email,
  ).join(",");
}

export function createZohoMailProvider(): EmailProvider {
  const accountId = process.env.ZOHO_MAIL_ACCOUNT_ID;
  const fromAddress = process.env.REPORT_EMAIL_FROM;
  const apiUrl = process.env.ZOHO_MAIL_API_URL || "https://mail.zoho.com/api";
  if (!accountId || !fromAddress) {
    throw new Error("Zoho Mail delivery is not configured.");
  }

  return {
    name: "zoho_mail",
    async send(input) {
      const accessToken = await getZohoAccessToken();
      const attachmentData = [];

      for (const attachment of input.attachments) {
        const uploadResponse = await fetch(
          `${apiUrl}/accounts/${accountId}/messages/attachments?fileName=${encodeURIComponent(attachment.filename)}`,
          {
            method: "POST",
            headers: {
              Authorization: `Zoho-oauthtoken ${accessToken}`,
              Accept: "application/json",
              "Content-Type": "application/json",
            },
            body: Buffer.from(attachment.bytes),
          },
        );
        const uploadResult = await parseZohoResponse<ZohoAttachmentResponse>(
          uploadResponse,
          "attachment upload",
        );
        const uploaded = Array.isArray(uploadResult.data)
          ? uploadResult.data[0]
          : uploadResult.data;
        if (!uploadResponse.ok || !uploaded?.storeName || !uploaded.attachmentPath) {
          throw new Error(uploadResult.status?.description ?? "Zoho Mail could not upload an attachment.");
        }
        attachmentData.push({
          storeName: uploaded.storeName,
          attachmentPath: uploaded.attachmentPath,
          attachmentName: uploaded.attachmentName || attachment.filename,
        });
      }

      const response = await fetch(`${apiUrl}/accounts/${accountId}/messages`, {
        method: "POST",
        headers: {
          Authorization: `Zoho-oauthtoken ${accessToken}`,
          Accept: "application/json",
          "Content-Type": "application/json",
          "X-TIG360-Idempotency-Key": input.idempotencyKey,
        },
        body: JSON.stringify({
          fromAddress,
          toAddress: addressList(input.to),
          ccAddress: addressList(input.cc),
          bccAddress: addressList(input.bcc),
          replyTo: input.replyTo || undefined,
          subject: input.subject,
          content: input.text,
          mailFormat: "plaintext",
          attachments: attachmentData,
          askReceipt: "yes",
        }),
      });
      const result = await parseZohoResponse<ZohoSendResponse>(response, "send");
      const messageId = result.data?.messageId;
      if (!response.ok || !messageId) {
        throw new Error(result.status?.description ?? "Zoho Mail rejected the email.");
      }
      return { provider: "zoho_mail", messageId };
    },
  };
}
