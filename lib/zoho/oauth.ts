type ZohoTokenResponse = {
  access_token?: string;
  error?: string;
  error_description?: string;
};

export async function parseZohoJson<T>(response: Response, label: string) {
  const body = await response.text();
  try {
    return JSON.parse(body) as T;
  } catch {
    const contentType = response.headers.get("content-type") || "unknown content type";
    throw new Error(`${label} returned HTTP ${response.status} (${contentType}) instead of JSON.`);
  }
}

export async function refreshZohoAccessToken(config: {
  label: string;
  failureMessage: string;
  accountsUrl: string;
  clientId: string | undefined;
  clientSecret: string | undefined;
  refreshToken: string | undefined;
}) {
  const { label, failureMessage, accountsUrl, clientId, clientSecret, refreshToken } = config;
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(`${label} is not configured.`);
  }

  const response = await fetch(`${accountsUrl}/oauth/v2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
    cache: "no-store",
  });
  const result = await parseZohoJson<ZohoTokenResponse>(response, label);
  if (!response.ok || !result.access_token) {
    throw new Error(result.error_description || result.error || failureMessage);
  }
  return result.access_token;
}

export function getZohoAccessToken() {
  return refreshZohoAccessToken({
    label: "Zoho OAuth",
    failureMessage: "Unable to authenticate with Zoho.",
    accountsUrl: process.env.ZOHO_ACCOUNTS_URL || "https://accounts.zoho.com",
    clientId: process.env.ZOHO_CLIENT_ID,
    clientSecret: process.env.ZOHO_CLIENT_SECRET,
    refreshToken: process.env.ZOHO_REFRESH_TOKEN,
  });
}
