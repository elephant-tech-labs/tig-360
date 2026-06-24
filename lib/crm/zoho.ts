import { getZohoAccessToken } from "@/lib/zoho/oauth";

type LogDeliveryInput = {
  contactRecordIds: string[];
  subject: string;
  provider: string;
  providerMessageId: string;
  sentAt: string;
  recipients: Array<{ email: string; type: string }>;
};

type ZohoNotesResponse = {
  data?: Array<{
    code?: string;
    details?: { id?: string };
    message?: string;
  }>;
};

export function isZohoCrmConfigured() {
  return Boolean(
    process.env.ZOHO_CLIENT_ID
    && process.env.ZOHO_CLIENT_SECRET
    && process.env.ZOHO_REFRESH_TOKEN
    && process.env.ZOHO_CRM_API_URL,
  );
}

export async function logReportDeliveryInZoho(input: LogDeliveryInput) {
  if (!input.contactRecordIds.length) {
    return { status: "not_configured" as const, activityIds: [] as string[] };
  }
  if (!isZohoCrmConfigured()) {
    return { status: "not_configured" as const, activityIds: [] as string[] };
  }

  const accessToken = await getZohoAccessToken();
  const apiUrl = process.env.ZOHO_CRM_API_URL!;
  const recipientSummary = input.recipients
    .map((recipient) => `${recipient.type.toUpperCase()}: ${recipient.email}`)
    .join("\n");
  const noteContent = [
    "Inspection report delivered from TIG-360.",
    `Sent: ${input.sentAt}`,
    `Provider: ${input.provider}`,
    `Provider message ID: ${input.providerMessageId}`,
    "",
    recipientSummary,
  ].join("\n");

  const response = await fetch(`${apiUrl}/Notes`, {
    method: "POST",
    headers: {
      Authorization: `Zoho-oauthtoken ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      data: input.contactRecordIds.map((recordId) => ({
        Note_Title: `Report sent: ${input.subject}`,
        Note_Content: noteContent,
        Parent_Id: recordId,
        se_module: "Contacts",
      })),
    }),
  });
  const result = await response.json() as ZohoNotesResponse;
  const failures = result.data?.filter((item) => item.code !== "SUCCESS") ?? [];
  if (!response.ok || failures.length) {
    throw new Error(failures[0]?.message ?? "Zoho CRM could not record the report delivery.");
  }
  return {
    status: "synced" as const,
    activityIds: result.data?.flatMap((item) => item.details?.id ? [item.details.id] : []) ?? [],
  };
}
