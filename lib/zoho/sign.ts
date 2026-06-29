type ZohoTokenResponse = {
  access_token?: string;
  error?: string;
  error_description?: string;
};

type ZohoSignResponse = Record<string, unknown>;

export type ZohoSignRequestResult = {
  requestId: string;
  actionId: string | null;
  documentId: string | null;
  providerStatus: string | null;
  submitted: boolean;
  submissionError: string | null;
  embeddedSignUrl: string | null;
  raw: ZohoSignResponse;
};

export type ZohoSignStatusResult = {
  requestId: string;
  actionId: string | null;
  providerStatus: string | null;
  actionStatus: string | null;
  completedAt: string | null;
  raw: ZohoSignResponse;
};

function accountsBase() {
  return process.env.ZOHO_SIGN_ACCOUNTS_BASE || "https://accounts.zoho.eu";
}

function apiBase() {
  return (process.env.ZOHO_SIGN_API_BASE || "https://sign.zoho.eu/api/v1").replace(/\/$/, "");
}

export function isZohoSignConfigured() {
  return Boolean(
    process.env.ZOHO_SIGN_CLIENT_ID
      && process.env.ZOHO_SIGN_CLIENT_SECRET
      && process.env.ZOHO_SIGN_REFRESH_TOKEN,
  );
}

export async function getZohoSignAccessToken() {
  const clientId = process.env.ZOHO_SIGN_CLIENT_ID;
  const clientSecret = process.env.ZOHO_SIGN_CLIENT_SECRET;
  const refreshToken = process.env.ZOHO_SIGN_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error("Zoho Sign is not configured.");
  }

  const response = await fetch(`${accountsBase()}/oauth/v2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
    }),
  });
  const result = await response.json() as ZohoTokenResponse;
  if (!response.ok || !result.access_token) {
    throw new Error(result.error_description || result.error || "Unable to refresh Zoho Sign access token.");
  }
  return result.access_token;
}

async function parseZohoSignResponse(response: Response, operation: string) {
  const body = await response.text();
  try {
    const parsed = JSON.parse(body) as ZohoSignResponse;
    if (!response.ok) {
      throw new Error(zohoMessage(parsed) || `Zoho Sign ${operation} failed with HTTP ${response.status}.`);
    }
    return parsed;
  } catch (error) {
    if (error instanceof SyntaxError) {
      const contentType = response.headers.get("content-type") || "unknown content type";
      throw new Error(`Zoho Sign ${operation} returned HTTP ${response.status} (${contentType}) instead of JSON.`);
    }
    throw error;
  }
}

function zohoMessage(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  for (const key of ["message", "error", "error_description", "description"]) {
    if (typeof record[key] === "string" && record[key]) return record[key] as string;
  }
  if (record.status && typeof record.status === "object") {
    return zohoMessage(record.status);
  }
  return null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function asArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.flatMap((item) => {
      const record = asRecord(item);
      return record ? [record] : [];
    })
    : [];
}

function firstString(record: Record<string, unknown> | null, keys: string[]) {
  if (!record) return null;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return null;
}

function extractRequestRecord(result: ZohoSignResponse) {
  const root = asRecord(result.requests)
    || asRecord(result.request)
    || asRecord(result.data)
    || result;
  const nestedRequest = asRecord(root.requests) || asRecord(root.request);
  return nestedRequest || root;
}

function extractAction(request: Record<string, unknown>) {
  return asArray(request.actions)[0] || asArray(asRecord(request.action)?.actions)[0] || null;
}

function extractDocument(request: Record<string, unknown>) {
  return asArray(request.documents)[0] || asRecord(request.document);
}

function extractRequestId(request: Record<string, unknown>) {
  return firstString(request, ["request_id", "requestId", "id"]);
}

function findStringKey(value: unknown, keys: string[]): string | null {
  const record = asRecord(value);
  if (!record) return null;
  for (const key of keys) {
    const found = firstString(record, [key]);
    if (found) return found;
  }
  for (const nested of Object.values(record)) {
    if (Array.isArray(nested)) {
      for (const item of nested) {
        const found = findStringKey(item, keys);
        if (found) return found;
      }
    } else if (asRecord(nested)) {
      const found = findStringKey(nested, keys);
      if (found) return found;
    }
  }
  return null;
}

export function normalizeZohoSignStatus(providerStatus: string | null, actionStatus?: string | null) {
  const status = (actionStatus || providerStatus || "").toLowerCase().replace(/\s+/g, "_");
  if (["completed", "signed", "approved"].includes(status)) return "completed";
  if (["declined", "rejected"].includes(status)) return "declined";
  if (["expired"].includes(status)) return "expired";
  if (["recalled", "cancelled", "canceled"].includes(status)) return "cancelled";
  if (["viewed"].includes(status)) return "viewed";
  if (["sent", "inprogress", "in_progress", "waiting_for_signature", "delivered"].includes(status)) return "sent";
  if (["draft"].includes(status)) return "draft";
  return status ? "unknown" : "sent";
}

export async function sendZohoSignDocument(input: {
  filename: string;
  pdfBytes: Uint8Array;
  requestName: string;
  signerName: string;
  signerEmail: string;
  notes?: string;
  embedded?: boolean;
  embeddedHost?: string;
}) {
  const accessToken = await getZohoSignAccessToken();
  const payload = {
    requests: {
      request_name: input.requestName,
      is_sequential: true,
      email_reminders: true,
      reminder_period: 3,
      expiration_days: 15,
      notes: input.notes || "Please review and sign the attached work authorization.",
      actions: [
        {
          recipient_name: input.signerName,
          recipient_email: input.signerEmail,
          action_type: "SIGN",
          signing_order: 1,
          verify_recipient: false,
          is_embedded: input.embedded || undefined,
          private_notes: "",
        },
      ],
    },
  };

  const form = new FormData();
  form.append("data", JSON.stringify(payload));
  const pdfBuffer = new ArrayBuffer(input.pdfBytes.byteLength);
  new Uint8Array(pdfBuffer).set(input.pdfBytes);
  form.append("file", new Blob([pdfBuffer], { type: "application/pdf" }), input.filename);

  const createResponse = await fetch(`${apiBase()}/requests`, {
    method: "POST",
    headers: {
      Authorization: `Zoho-oauthtoken ${accessToken}`,
      Accept: "application/json",
    },
    body: form,
  });
  const createResult = await parseZohoSignResponse(createResponse, "request creation");
  const request = extractRequestRecord(createResult);
  const action = extractAction(request);
  const document = extractDocument(request);
  const requestId = extractRequestId(request);
  if (!requestId) {
    throw new Error("Zoho Sign accepted the file but did not return a request id.");
  }

  const created: ZohoSignRequestResult = {
    requestId,
    actionId: firstString(action, ["action_id", "actionId", "id"]),
    documentId: firstString(document, ["document_id", "documentId", "id"]),
    providerStatus: firstString(request, ["request_status", "status"]),
    submitted: false,
    submissionError: null,
    embeddedSignUrl: null,
    raw: createResult,
  };

  const submitBody = new URLSearchParams({
    data: JSON.stringify({
      requests: {
        actions: [
          {
            action_id: created.actionId || undefined,
            recipient_name: input.signerName,
            recipient_email: input.signerEmail,
            action_type: "SIGN",
            signing_order: 1,
            is_embedded: input.embedded || undefined,
          },
        ],
      },
    }),
  });

  try {
    let submitResult: ZohoSignResponse;
    try {
      submitResult = await submitZohoSignRequest(accessToken, requestId, submitBody, "POST");
    } catch (postError) {
      try {
        submitResult = await submitZohoSignRequest(accessToken, requestId, submitBody, "PUT");
      } catch {
        throw postError;
      }
    }
    const submittedRequest = extractRequestRecord(submitResult);
    let embeddedSignUrl: string | null = null;
    if (input.embedded) {
      embeddedSignUrl = await getZohoSignEmbeddedSignUrl({
        accessToken,
        requestId,
        actionId: created.actionId,
        host: input.embeddedHost,
      });
    }
    return {
      ...created,
      providerStatus: firstString(submittedRequest, ["request_status", "status"]) || created.providerStatus,
      submitted: true,
      embeddedSignUrl,
      raw: submitResult,
    };
  } catch (error) {
    return {
      ...created,
      submissionError: error instanceof Error ? error.message : "Zoho Sign could not submit the request.",
    };
  }
}

async function getZohoSignEmbeddedSignUrl(input: {
  accessToken: string;
  requestId: string;
  actionId: string | null;
  host?: string;
}) {
  if (!input.actionId) {
    throw new Error("Zoho Sign did not return an action id for embedded signing.");
  }
  const params = new URLSearchParams();
  if (input.host) params.set("host", input.host);
  const suffix = params.toString() ? `?${params.toString()}` : "";
  const response = await fetch(`${apiBase()}/requests/${input.requestId}/actions/${input.actionId}/embedtoken${suffix}`, {
    headers: {
      Authorization: `Zoho-oauthtoken ${input.accessToken}`,
      Accept: "application/json",
    },
  });
  const result = await parseZohoSignResponse(response, "embedded signing URL creation");
  const signUrl = findStringKey(result, ["sign_url", "signUrl", "embedded_sign_url", "embeddedSignUrl"]);
  if (!signUrl) {
    throw new Error("Zoho Sign did not return an embedded signing URL.");
  }
  return signUrl;
}

async function submitZohoSignRequest(
  accessToken: string,
  requestId: string,
  submitBody: URLSearchParams,
  method: "POST" | "PUT",
) {
  const submitResponse = await fetch(`${apiBase()}/requests/${requestId}/submit`, {
    method,
    headers: {
      Authorization: `Zoho-oauthtoken ${accessToken}`,
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(submitBody),
  });
  return parseZohoSignResponse(submitResponse, "request submission");
}

export async function getZohoSignRequestStatus(requestId: string): Promise<ZohoSignStatusResult> {
  const accessToken = await getZohoSignAccessToken();
  const response = await fetch(`${apiBase()}/requests/${requestId}`, {
    headers: {
      Authorization: `Zoho-oauthtoken ${accessToken}`,
      Accept: "application/json",
    },
  });
  const result = await parseZohoSignResponse(response, "status lookup");
  const request = extractRequestRecord(result);
  const action = extractAction(request);
  return {
    requestId,
    actionId: firstString(action, ["action_id", "actionId", "id"]),
    providerStatus: firstString(request, ["request_status", "status"]),
    actionStatus: firstString(action, ["action_status", "status", "recipient_status"]),
    completedAt: firstString(request, ["completed_time", "completed_at", "modified_time"]),
    raw: result,
  };
}
