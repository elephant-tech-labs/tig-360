# TIG-360 administrator-managed staff invitations

## How the administrator authorizes a staff email

Use **Management → Inspectors and access** at
https://tig-360.vercel.app/team/inspectors.

**Office / management staff**

1. Sign in as a current TIG-360 administrator.
2. Find **Invite office user** and enter the exact work email.
3. Choose Administrator, Manager, Office Coordinator or Treatment Coordinator.
4. Select **Send invitation**.
5. Watch **Access invitations** for the pending/expired/accepted status.
6. Once accepted, confirm the user appears in **Team access** with an active
   membership and the intended role.

**Inspectors**

- Create an inspector profile and check **Send login invitation now**, or use
  **Allow login** on an existing inspector profile.
- Merely creating an inspector profile without enabling login is **not** an
  invitation and does not grant an Auth session or organizational access.

**Do not** use the Supabase Auth Users dashboard to create general staff as a
substitute for inviting them through TIG-360: a raw Auth account does not
have the organization's required membership and role.

## What the staff recipient sees

**New to this Supabase project:** the **Invite user** email includes an
**Accept invitation** link. Following the link verifies the email and
opens `/activate`; the recipient supplies their full name, then the
pending invitation is redeemed and the correct role assigned.

**Already has an Auth account but no active TIG-360 membership:** Supabase
cannot send a new-user invite link. TIG-360 sends an **eight-digit code**
instead. The recipient goes to https://tig-360.vercel.app/login,
requests the code if necessary, verifies it, and gets redirected to
`/activate` to accept the invitation. A verified email alone does not
grant access to inspections.

**Already has an active membership:** no new invite is needed. Use
`/login` to request an OTP.

**Suspended membership:** reinvitation and activation are blocked.
An administrator must use **Team access → Access: Active → Save access**.

**Expired / failed invite:** the administrator uses **Resend** in Access
invitations. Revoked invitations must be created again through the
admin form.

## Supabase Auth email templates (TIG-360 project)

Project ref: `jqqzemvyvjujvpgvongw`

These are **two distinct templates**, both using the same custom SMTP sender.

1. **Magic Link** (used for passwordless login / existing-account invites):
   use `supabase/email-templates/inspect360-sign-in.html` containing the
   `{{ .Token }}` **numeric code** placeholder. Subject:
   `Your Inspect360 sign-in code`.
2. **Invite user** (used for first-time staff invitations):
   use `supabase/email-templates/inspect360-team-invitation.html`
   containing the `{{ .ConfirmationURL }}` **acceptance link**.
   Subject: `You're invited to Trident Inspect360`.

Never replace `{{ .Token }}` or `{{ .ConfirmationURL }}` with test values.
Pasting the OTP-only template into **Invite user** breaks new-user onboarding
because it removes the required acceptance link.

Under **Authentication → URL Configuration**, ensure the production
application redirect URL `https://tig-360.vercel.app/auth/accept`
is permitted. Set `NEXT_PUBLIC_APP_URL` to the canonical TIG-360
production origin in Vercel, e.g. `https://tig-360.vercel.app`.

## Security checks

- Login code requests are allowed only for a profile tied to **active**
  organization membership or a **non-expired, pending** admin invitation.
- A pending invitation permits OTP verification and activation **only**.
  Access to inspections and company records comes after activation.
- A verified OTP is checked against the Auth user ID; unauthorized, expired,
  revoked, and suspended users cannot complete activation.
- The first organization's bootstrap is sealed in the database once the
  TIG organization exists; new authenticated users cannot create their own
  organization to bypass the invitation workflow.
- Invitation RPCs are callable only by authenticated sessions; administrator
  role is enforced inside the database on invite/management changes.

## Post-release validation

- [ ] Administrator invites an email not yet in Supabase Auth; recipient
      follows Invite user link, enters a name, and can sign in.
- [ ] Administrator invites a preexisting Auth user without TIG membership;
      recipient receives eight-digit code and reaches activation.
- [ ] Inspector invitation attaches the correct existing inspector profile.
- [ ] Member appears as Active in Team access after acceptance.
- [ ] An active member receives an eight-digit OTP and can log in again.
- [ ] Invalid or expired OTP fails; full-code paste succeeds.
- [ ] Resend expired invite works.
- [ ] Revoked invitation cannot activate.
- [ ] Suspended member cannot get access; admin can reactivate using Team access.
- [ ] Uninvited signed-in user cannot create a new organization.
- [ ] Gmail and Outlook render the Invite user link and Magic Link code emails.

No testing should send real invitations to staff email addresses without an
administrator intentionally selecting those recipients.
