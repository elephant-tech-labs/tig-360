# Authorized email-code login for TIG-360

## Objective

Use the same passwordless staff experience as MCC volunteer management: an
**existing, authorized** Inspect360 team member enters their work email,
receives a one-time code, and signs in.

This replaces the old email/password login form. It does not add public
sign-up or change existing organization roles, RLS policies, inspection data,
or staff invitations.

## Authorization model

1. The request server action normalizes the email and uses a **server-only**
   Supabase service-role client to look up the user's existing profile.
2. A code is requested **only** if the profile has an active
   `organization_memberships` row.
3. `signInWithOtp({ email, options: { shouldCreateUser: false } })` prevents
   new accounts from being created at login.
4. Supabase validates the supplied code via
   `verifyOtp({ email, token, type: "email" })`.
5. The server checks the **verified user ID** against an active membership
   again before redirecting to `/jobs`. On failure, it signs out.
6. Existing RLS and role-based navigation continue to govern each user's
   access. A suspended user is not reauthorized by a valid code.

Pending invitations still use the existing administrator invitation flow.
Invitation activation collects a name, not a password.

Do not replace these checks with an email-domain allowlist; a matching
domain is not proof that somebody is authorized.

## Branded email template

The production-ready **HTML source** is checked into:

`supabase/email-templates/inspect360-sign-in.html`

Recommended email metadata:

- **Subject:** `Your Inspect360 sign-in code`
- **Sender display name:** `Trident Inspect360`
- **Sender address:** use an address on `@tridentinspectiongroup.com` that is
  authorized by your configured SMTP provider. Do not assume a suggested
  address exists or that DNS/authentication is set up.

This design intentionally uses a text-based wordmark, inline CSS, basic
HTML tables, no external images, no web fonts, and a fluid single-column
layout. The message remains readable if an email client suppresses styles.

### Apply to Supabase (manual project setting)

1. In the TIG360 Supabase project, open Authentication → Email Templates → **Magic Link**.
2. Set the subject to `Your Inspect360 sign-in code`.
3. Copy the complete source of `supabase/email-templates/inspect360-sign-in.html`
   into the HTML body editor, replacing the existing template.
4. Save, then send an actual email OTP to a test **authorized** staff
   account to confirm rendering and token substitution.
5. Test Gmail (web/mobile), Outlook desktop, and Apple Mail. Confirm code
   readability under dark mode and disabled-image conditions.

The mandatory `{{ .Token }}` placeholder is already present in the
source. **Do not replace it with a sample code** when pasting into Supabase.
Avoid putting the code in the subject line. Sender authentication
(SPF, DKIM, DMARC), provider delivery, and final inbox rendering
must be verified separately from the template source.

## Supabase configuration (required before end-to-end testing)

Project: `tig360` (project ref `jqqzemvyvjujvpgvongw`).

1. Open Supabase Dashboard → Authentication → Email Templates → **Magic Link**.
2. Make sure the template includes `{{ .Token }}` to deliver a numeric code
   rather than only a clickable magic link. Example:

   ```html
   <h2>Your Trident Inspect360 sign-in code</h2>
   <p>Enter this code to sign in: <strong>{{ .Token }}</strong></p>
   <p>If you did not request this, you can ignore this email.</p>
   ```

3. In Authentication → Providers → Email, confirm email OTP is enabled,
   expiration is short, and resend rate limiting is configured. The UI
   accepts 6–10 numeric digits to accommodate configured token lengths.
4. Confirm the project's production SMTP is configured to send authentication
   emails reliably; inspect logs if staff do not receive a code.
5. Confirm the Vercel environment has `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and the **server-only**
   `SUPABASE_SERVICE_ROLE_KEY`. Never prefix the service key with
   `NEXT_PUBLIC_` or expose it in browser code.

See: https://supabase.com/docs/guides/auth/auth-email-passwordless

## Acceptance test matrix

- [ ] Active administrator: code sent, code accepted, admin navigation works.
- [ ] Active manager: code sent; manager permissions preserved.
- [ ] Active inspector: code sent; manager-only areas remain inaccessible.
- [ ] Active staff member with mixed-case email input: sign-in works.
- [ ] Unknown email: no account created, no OTP sent, generic screen shown.
- [ ] Invited but unactivated email: no OTP; complete invitation first.
- [ ] Suspended user: no OTP sent; previously issued OTP cannot grant access.
- [ ] Invalid/expired code: sign-in denied; user can request another code.
- [ ] Sign-out clears session; protected app pages require a new sign-in.
- [ ] New invited team member: invitation activation needs name only.
- [ ] Email OTP template actually sends **digits** and not only a magic link.
- [ ] Resend throttling and SMTP provider failure behavior reviewed.

## Deployment

This change is isolated on `feature/authorized-email-otp-login`.
Do not merge or deploy to production until the Supabase email template is
configured and the above authentication tests pass. Existing inspection,
report, CRM, and document workflows are intentionally unchanged.
