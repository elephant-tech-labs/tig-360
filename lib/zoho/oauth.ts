type ZohoTokenResponse = {
  access_token?: string;
  error?: string;
};

async function parseZohoTokenResponse(response: Response) {
  const body = await response.text();
  try {
    return JSON.parse(body) as ZohoTokenResponse;
  } catch {
    const contentType = response.headers.get("content-type") || "unknown content type";
    throw new Error(
      `Zoho OAuth returned HTTP ${response.status} (${contentType}) instead of JSON.`,
    );
  }
}

export async function getZohoAccessToken() {
  const clientId = process.env.ZOHO_CLIENT_ID;
  const clientSecret = process.env.ZOHO_CLIENT_SECRET;
  const refreshToken = process.env.ZOHO_REFRESH_TOKEN;
  const accountsUrl = process.env.ZOHO_ACCOUNTS_URL || "https://accounts.zoho.com";
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error("Zoho OAuth is not configured.");
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
  const result = await parseZohoTokenResponse(response);
  if (!response.ok || !result.access_token) {
    throw new Error(result.error ?? "Unable to authenticate with Zoho.");
  }
  return result.access_token;
}
