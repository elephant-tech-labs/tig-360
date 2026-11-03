import assert from "node:assert/strict";
import test from "node:test";
import { getEmailProvider } from "../lib/email";
import { createZohoMailProvider } from "../lib/email/zoho-mail";
import { getZohoAccessToken } from "../lib/zoho/oauth";
import { getZohoSignRequestStatus } from "../lib/zoho/sign";

const ENV_KEYS = [
  "EMAIL_PROVIDER",
  "REPORT_EMAIL_FROM",
  "RESEND_API_KEY",
  "ZOHO_ACCOUNTS_URL",
  "ZOHO_CLIENT_ID",
  "ZOHO_CLIENT_SECRET",
  "ZOHO_REFRESH_TOKEN",
  "ZOHO_MAIL_ACCOUNT_ID",
  "ZOHO_MAIL_API_URL",
  "ZOHO_SIGN_ACCOUNTS_BASE",
  "ZOHO_SIGN_API_BASE",
  "ZOHO_SIGN_CLIENT_ID",
  "ZOHO_SIGN_CLIENT_SECRET",
  "ZOHO_SIGN_REFRESH_TOKEN",
];

type Call = { url: string; init?: RequestInit };

// Replaces env and fetch for one test, restoring both afterwards.
async function withMocks(
  env: Record<string, string>,
  responses: Response[],
  fn: (calls: Call[]) => Promise<void> | void,
) {
  const savedEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
  const savedFetch = globalThis.fetch;
  const calls: Call[] = [];
  for (const key of ENV_KEYS) delete process.env[key];
  Object.assign(process.env, env);
  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    const next = responses.shift();
    if (!next) throw new Error(`Unexpected fetch: ${url}`);
    return next;
  }) as typeof fetch;
  try {
    await fn(calls);
  } finally {
    globalThis.fetch = savedFetch;
    for (const key of ENV_KEYS) {
      if (savedEnv[key] === undefined) delete process.env[key];
      else process.env[key] = savedEnv[key];
    }
  }
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const html = (status: number) =>
  new Response("<html>bad gateway</html>", { status, headers: { "content-type": "text/html" } });

const CRM_ENV = { ZOHO_CLIENT_ID: "crm-id", ZOHO_CLIENT_SECRET: "crm-secret", ZOHO_REFRESH_TOKEN: "crm-refresh" };
const SIGN_ENV = { ZOHO_SIGN_CLIENT_ID: "sign-id", ZOHO_SIGN_CLIENT_SECRET: "sign-secret", ZOHO_SIGN_REFRESH_TOKEN: "sign-refresh" };

// --- CRM / Zoho Mail OAuth -------------------------------------------------

test("CRM OAuth: missing credentials keep the original message", async () => {
  await withMocks({}, [], async () => {
    await assert.rejects(getZohoAccessToken(), { message: "Zoho OAuth is not configured." });
  });
});

test("CRM OAuth: refresh posts the CRM credentials to the configured accounts URL", async () => {
  await withMocks({ ...CRM_ENV, ZOHO_ACCOUNTS_URL: "https://accounts.zoho.example" }, [json({ access_token: "tok" })], async (calls) => {
    assert.equal(await getZohoAccessToken(), "tok");
    assert.equal(calls[0].url, "https://accounts.zoho.example/oauth/v2/token");
    assert.equal(calls[0].init?.method, "POST");
    assert.equal(calls[0].init?.cache, "no-store");
    const body = new URLSearchParams(String(calls[0].init?.body));
    assert.deepEqual(Object.fromEntries(body), {
      client_id: "crm-id",
      client_secret: "crm-secret",
      refresh_token: "crm-refresh",
      grant_type: "refresh_token",
    });
  });
});

test("CRM OAuth: default accounts URL is the US data center", async () => {
  await withMocks(CRM_ENV, [json({ access_token: "tok" })], async (calls) => {
    await getZohoAccessToken();
    assert.equal(calls[0].url, "https://accounts.zoho.com/oauth/v2/token");
  });
});

test("CRM OAuth: error handling", async (t) => {
  await t.test("Zoho error code is surfaced", () =>
    withMocks(CRM_ENV, [json({ error: "invalid_code" }, 400)], () =>
      assert.rejects(getZohoAccessToken(), { message: "invalid_code" })));
  await t.test("empty error body falls back to the original message", () =>
    withMocks(CRM_ENV, [json({}, 400)], () =>
      assert.rejects(getZohoAccessToken(), { message: "Unable to authenticate with Zoho." })));
  await t.test("200 without access_token is still a failure", () =>
    withMocks(CRM_ENV, [json({})], () =>
      assert.rejects(getZohoAccessToken(), { message: "Unable to authenticate with Zoho." })));
  await t.test("non-JSON response keeps the original message", () =>
    withMocks(CRM_ENV, [html(502)], () =>
      assert.rejects(getZohoAccessToken(), {
        message: "Zoho OAuth returned HTTP 502 (text/html) instead of JSON.",
      })));
});

// --- Zoho Sign OAuth -------------------------------------------------------

test("Zoho Sign OAuth: never falls back to CRM credentials", async () => {
  await withMocks(CRM_ENV, [], async (calls) => {
    await assert.rejects(getZohoSignRequestStatus("req-1"), { message: "Zoho Sign is not configured." });
    assert.equal(calls.length, 0);
  });
});

test("Zoho Sign OAuth: refresh uses Sign credentials and the EU accounts default", async () => {
  await withMocks(
    { ...CRM_ENV, ...SIGN_ENV },
    [json({ access_token: "sign-tok" }), json({ requests: { request_status: "completed", actions: [{ action_id: "a1", action_status: "SIGNED" }] } })],
    async (calls) => {
      const status = await getZohoSignRequestStatus("req-1");
      assert.equal(calls[0].url, "https://accounts.zoho.eu/oauth/v2/token");
      assert.equal(new URLSearchParams(String(calls[0].init?.body)).get("client_id"), "sign-id");
      assert.equal(new URLSearchParams(String(calls[0].init?.body)).get("refresh_token"), "sign-refresh");
      assert.equal(calls[1].url, "https://sign.zoho.eu/api/v1/requests/req-1");
      assert.equal((calls[1].init?.headers as Record<string, string>).Authorization, "Zoho-oauthtoken sign-tok");
      assert.equal(status.providerStatus, "completed");
    },
  );
});

test("Zoho Sign OAuth: error handling", async (t) => {
  await t.test("error_description is preferred", () =>
    withMocks(SIGN_ENV, [json({ error: "invalid_client", error_description: "Client secret mismatch" }, 400)], () =>
      assert.rejects(getZohoSignRequestStatus("r"), { message: "Client secret mismatch" })));
  await t.test("empty error body falls back to the original message", () =>
    withMocks(SIGN_ENV, [json({}, 400)], () =>
      assert.rejects(getZohoSignRequestStatus("r"), { message: "Unable to refresh Zoho Sign access token." })));
  await t.test("non-JSON token response reports status and content type", () =>
    withMocks(SIGN_ENV, [html(503)], () =>
      assert.rejects(getZohoSignRequestStatus("r"), {
        message: "Zoho Sign returned HTTP 503 (text/html) instead of JSON.",
      })));
  await t.test("non-JSON API response keeps the original message", () =>
    withMocks(SIGN_ENV, [json({ access_token: "t" }), html(502)], () =>
      assert.rejects(getZohoSignRequestStatus("r"), {
        message: "Zoho Sign status lookup returned HTTP 502 (text/html) instead of JSON.",
      })));
  await t.test("JSON API error surfaces the Zoho message", () =>
    withMocks(SIGN_ENV, [json({ access_token: "t" }), json({ status: { message: "Request not found" } }, 404)], () =>
      assert.rejects(getZohoSignRequestStatus("r"), { message: "Request not found" })));
  await t.test("JSON API error without a message falls back to the HTTP status", () =>
    withMocks(SIGN_ENV, [json({ access_token: "t" }), json({}, 500)], () =>
      assert.rejects(getZohoSignRequestStatus("r"), { message: "Zoho Sign status lookup failed with HTTP 500." })));
});

// --- Zoho Mail sending -----------------------------------------------------

const MAIL_ENV = { ...CRM_ENV, ZOHO_MAIL_ACCOUNT_ID: "acct-1", REPORT_EMAIL_FROM: "reports@example.com" };
const sendInput = {
  to: [{ email: "buyer@example.com", name: "Buyer" }],
  cc: [],
  bcc: [{ email: "office@example.com" }],
  subject: "Inspection report",
  text: "Attached.",
  replyTo: null,
  attachments: [{ bytes: new Uint8Array([37, 80, 68, 70]), filename: "report.pdf", contentType: "application/pdf" }],
  idempotencyKey: "idem-1",
};

test("Zoho Mail: configuration requires account, from address, and refresh token", async () => {
  for (const missing of ["ZOHO_MAIL_ACCOUNT_ID", "REPORT_EMAIL_FROM", "ZOHO_REFRESH_TOKEN"]) {
    const env: Record<string, string> = { ...MAIL_ENV };
    delete env[missing];
    await withMocks(env, [], () => {
      assert.throws(() => createZohoMailProvider(), { message: "Zoho Mail delivery is not configured." }, missing);
    });
  }
});

test("Zoho Mail: uploads attachments then sends with the uploaded references", async () => {
  await withMocks(
    MAIL_ENV,
    [
      json({ access_token: "mail-tok" }),
      json({ data: [{ storeName: "store", attachmentPath: "/p/report.pdf", attachmentName: "report.pdf" }] }),
      json({ data: { messageId: "msg-9" } }),
    ],
    async (calls) => {
      const result = await createZohoMailProvider().send(sendInput);
      assert.deepEqual(result, { provider: "zoho_mail", messageId: "msg-9" });
      assert.equal(calls[1].url, "https://mail.zoho.com/api/accounts/acct-1/messages/attachments?uploadType=multipart&isInline=false");
      assert.equal(calls[2].url, "https://mail.zoho.com/api/accounts/acct-1/messages");
      const headers = calls[2].init?.headers as Record<string, string>;
      assert.equal(headers.Authorization, "Zoho-oauthtoken mail-tok");
      assert.equal(headers["X-TIG360-Idempotency-Key"], "idem-1");
      const body = JSON.parse(String(calls[2].init?.body));
      assert.equal(body.fromAddress, "reports@example.com");
      assert.equal(body.toAddress, "Buyer<buyer@example.com>");
      assert.equal(body.bccAddress, "office@example.com");
      assert.deepEqual(body.attachments, [{ storeName: "store", attachmentPath: "/p/report.pdf", attachmentName: "report.pdf" }]);
    },
  );
});

test("Zoho Mail: error messages", async (t) => {
  await t.test("non-JSON upload response", () =>
    withMocks(MAIL_ENV, [json({ access_token: "t" }), html(502)], () =>
      assert.rejects(createZohoMailProvider().send(sendInput), {
        message: "Zoho Mail attachment upload returned HTTP 502 (text/html) instead of JSON.",
      })));
  await t.test("non-JSON send response", () =>
    withMocks(MAIL_ENV, [json({ access_token: "t" }), html(504)], () =>
      assert.rejects(createZohoMailProvider().send({ ...sendInput, attachments: [] }), {
        message: "Zoho Mail send returned HTTP 504 (text/html) instead of JSON.",
      })));
  await t.test("rejected send surfaces Zoho's description", () =>
    withMocks(MAIL_ENV, [json({ access_token: "t" }), json({ status: { description: "Invalid from address" } }, 400)], () =>
      assert.rejects(createZohoMailProvider().send({ ...sendInput, attachments: [] }), {
        message: "Invalid from address",
      })));
});

// --- Provider selection and the Send Center label --------------------------

// Verbatim copy of the Send Center label logic before the refactor (oracle).
function legacyProviderLabel() {
  const selected = process.env.EMAIL_PROVIDER?.trim().toLowerCase();
  if (selected === "zoho_mail") {
    return process.env.ZOHO_MAIL_ACCOUNT_ID && process.env.ZOHO_REFRESH_TOKEN && process.env.REPORT_EMAIL_FROM
      ? "Zoho Mail"
      : null;
  }
  if (selected === "resend") {
    return process.env.RESEND_API_KEY && process.env.REPORT_EMAIL_FROM ? "Resend" : null;
  }
  if (process.env.ZOHO_MAIL_ACCOUNT_ID && process.env.ZOHO_REFRESH_TOKEN && process.env.REPORT_EMAIL_FROM) {
    return "Zoho Mail";
  }
  if (process.env.RESEND_API_KEY && process.env.REPORT_EMAIL_FROM) return "Resend";
  return null;
}

// Mirrors providerLabel() in app/jobs/[jobId]/send/page.tsx.
function providerLabel() {
  try {
    return getEmailProvider().name === "zoho_mail" ? "Zoho Mail" : "Resend";
  } catch {
    return null;
  }
}

test("Send Center label matches the provider that would actually send, for every env combination", async () => {
  for (const selected of [undefined, "zoho_mail", " Resend ", "resend"]) {
    for (let mask = 0; mask < 16; mask += 1) {
      const env: Record<string, string> = {};
      if (selected) env.EMAIL_PROVIDER = selected;
      if (mask & 1) env.ZOHO_MAIL_ACCOUNT_ID = "acct";
      if (mask & 2) env.ZOHO_REFRESH_TOKEN = "refresh";
      if (mask & 4) env.REPORT_EMAIL_FROM = "reports@example.com";
      if (mask & 8) env.RESEND_API_KEY = "re_key";
      await withMocks(env, [], () => {
        const label = `${selected ?? "auto"} mask=${mask}`;
        // Known, intended divergence: auto-select picks Zoho Mail whenever account + refresh token
        // exist, so a missing from address makes sending fail. The old label wrongly showed Resend.
        const zohoPickedButBroken = !selected && mask & 1 && mask & 2 && !(mask & 4);
        if (zohoPickedButBroken) {
          assert.equal(providerLabel(), null, label);
          assert.throws(() => getEmailProvider(), label);
        } else {
          assert.equal(providerLabel(), legacyProviderLabel(), label);
        }
      });
    }
  }
});

test("Resend provider remains selectable", async () => {
  await withMocks({ EMAIL_PROVIDER: "resend", RESEND_API_KEY: "re_key", REPORT_EMAIL_FROM: "r@example.com" }, [], () => {
    assert.equal(getEmailProvider().name, "resend");
  });
});
