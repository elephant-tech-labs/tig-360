# TIG 360 Project Context

> **Read this first when starting a new Codex chat.**
>
> This is the durable operational handoff for TIG 360. It records product intent, verified deployed state, architecture boundaries, and recommended next work as of **June 20, 2026**. Before changing code or running SQL, compare it with current `main`, open pull requests, Vercel, and Supabase migration history.

## Product Objective

TIG 360 is a modern inspection operations platform replacing and improving the existing Zoho Creator application. It should preserve the proven termite/WDO workflow without copying Creator screen-for-screen or carrying forward its architectural limits.

Target workflow:

1. Create and schedule an inspection job.
2. Associate a property and reusable contacts/companies.
3. Capture inspection details, findings, recommendations, photos, and diagrams.
4. Determine report readiness.
5. generate an immutable, versioned PDF report.
6. Send a specific report version to one or more recipients and retain delivery history.
7. Prepare and send a contract through Zoho Sign.
8. Synchronize appropriate customer and communication data with Zoho CRM.
9. Retain a complete audit trail.

Report types currently modeled: `complete`, `limited`, `supplemental`, and `reinspection`.

## Repositories and Services

- GitHub: <https://github.com/elephant-tech-labs/tig-360>
- Production app: <https://tig-360.vercel.app>
- Vercel project: <https://vercel.com/gurinders-projects-f4a0f026/tig-360/deployments>
- Supabase project: `tig360`
- Supabase reference: `jqqzemvyvjujvpgvongw`
- Supabase URL: <https://jqqzemvyvjujvpgvongw.supabase.co>

Never commit database passwords, connection strings, Supabase service-role/secret keys, Zoho OAuth secrets, or mail-provider secrets. Runtime environment values belong in Vercel and the corresponding provider dashboards.

## Architecture Direction

The selected architecture is a **modular monolith** with background workers for slow, retryable, or externally dependent work.

- Web: Next.js 16, React 19, TypeScript
- Database/auth: Supabase Postgres + Supabase Auth
- Tenant isolation: organization-scoped rows protected by Postgres RLS
- Binary storage: Zoho WorkDrive initially, chosen to control storage cost
- Customer/communication system: Zoho CRM
- Initial signing provider: Zoho Sign
- Hosting: Vercel

### Source-of-truth boundaries

- **Supabase** owns users, organizations, memberships, jobs, properties, contacts, job parties, inspection content, asset metadata, document versions, delivery history, provider references, and audit events.
- **Zoho WorkDrive** stores large binaries such as photos, diagrams, and generated PDFs.
- **Zoho CRM** receives selected customer/contact and communication information. It is not the transactional inspection database.
- **Zoho Sign** owns signing-envelope execution; envelope IDs and statuses are mirrored into Supabase.

For WorkDrive files, store stable provider file IDs and metadata, not only public URLs. URLs can expire or be replaced. Keep WorkDrive, CRM, Sign, email, and PDF-provider APIs behind adapters so providers can change without rewriting domain logic.

## Verified Production State

### Authentication and organization setup

- Users can create an account, confirm email, sign in, and sign out.
- Signed-in users without an organization go through onboarding.
- Creating an organization makes its creator an admin.
- Protected routes require authentication and organization membership.

### Jobs and contacts

- `/jobs` lists organization-scoped jobs from Supabase.
- `/jobs/new` transactionally creates a property and inspection job.
- `/jobs/[jobId]` displays the job workspace/detail.
- A production inspection job was successfully created after the enum-cast fix.
- `/contacts` provides the reusable contact directory.
- `/contacts/new` creates contacts with optional company matching/creation.
- `/jobs/[jobId]/contacts` assigns existing or newly created contacts to job roles and safely removes assignments without deleting contacts.

PR #5 and PR #6 were both merged into `main` on June 20, 2026. The contact/job-party application slice and matching database migration are therefore part of the main codebase, not pending work.

## Deployed Supabase Migrations

1. `20260619170000_initial_core.sql`
   - Created 19 public tables.
   - Enabled RLS on all 19.
   - Added 26 policies.
   - Added timestamp, profile, membership/role, and organization-creation functions.
2. `20260619190000_create_inspection_job_rpc.sql`
   - Added transactional property + inspection-job creation.
3. `20260620010000_fix_job_status_enum.sql`
   - Fixed `job_status` assignment using explicit enum casts.
4. `20260620030000_contacts_and_job_parties.sql`
   - Added `create_contact`, `assign_contact_to_job`, and `remove_job_party`.
   - Added contact/role uniqueness and one-primary-per-role indexes.

Live verification previously confirmed 19 RLS-enabled public tables, 26 policies, the core functions, all three contact/job-party functions, both uniqueness indexes, and authenticated execution privileges.

**Migration rule:** Supabase migration history is authoritative. Never edit or blindly rerun an already-applied migration. Add a new versioned migration for every subsequent schema correction.

## Core Schema

- `organizations`
- `profiles`
- `organization_memberships`
- `companies`
- `contacts`
- `properties`
- `inspection_jobs`
- `job_parties`
- `findings`
- `recommendations`
- `assets`
- `evidence_links`
- `diagrams`
- `documents`
- `document_versions`
- `deliveries`
- `delivery_recipients`
- `provider_references`
- `audit_events`

## Contact and Job-Party Rules

Supported roles:

- `ordered_by`
- `property_owner`
- `report_recipient`
- `party_of_interest`
- `signer`

Business rules:

- Contacts are reusable organization records, independent of one job.
- The same person can fill multiple roles.
- Multiple people can share a role.
- Only one assignment can be primary for a given role on a job.
- Removing an assignment does not delete the reusable contact.
- `report_recipient` is the default report destination, while users may select additional recipients.
- The contract signer can be different from all report recipients.

## Current Routes

| Route | Purpose |
| --- | --- |
| `/login` | Sign in and initial account creation |
| `/auth/confirm` | Supabase email confirmation callback |
| `/onboarding` | Create the first organization |
| `/jobs` | Inspection job list |
| `/jobs/new` | Create a property and job |
| `/jobs/[jobId]` | Job workspace/detail |
| `/contacts` | Reusable contact directory |
| `/contacts/new` | Create a contact |
| `/jobs/[jobId]/contacts` | Manage job parties |

## Zoho Creator Migration Context

Audited backup: `trident-inspect360_v1_19-Jun-2026_15_05_54`

It contained approximately 6 forms, 11 pages, 7 reports, and 10 functions, with WorkDrive, CRM, Sign, Writer, and OpenAI integrations.

Important lessons:

- The inspection job/report is the central aggregate.
- Details, photos, diagrams, findings/recommendations, contracts, and deliveries need stable relationships.
- Creator workflows were slow to evolve and sensitive to trigger behavior and external API quotas.
- Image-field limits caused split photo fields and custom WorkDrive synchronization.
- PDF-safe/public URLs were generated after uploads so images rendered in exported reports.
- Send history must identify what version was sent, to whom, when, by whom, and whether it succeeded.

## Product and Engineering Principles

- Make the inspection job the primary workspace, not a collection of disconnected forms.
- Design operational screens for scanning and repeated use.
- Save drafts continuously where practical.
- Generate immutable document versions; never silently replace a previously sent report.
- Every delivery must reference a specific document version.
- External side effects must be idempotent, retryable, observable, and recorded.
- Maintain an append-only audit trail for meaningful business actions.
- Enforce tenant isolation with database RLS, not only UI filtering.
- Reuse contacts, companies, and properties rather than duplicating unstructured text.
- Keep provider-specific code outside core domain modules.
- Build and validate focused workflow slices instead of recreating the entire Creator app at once.

## Environment Configuration

Expected public Vercel variables:

```text
NEXT_PUBLIC_APP_URL
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
```

Future WorkDrive, CRM, Sign, mail, worker, and privileged Supabase values are server-only and must not use `NEXT_PUBLIC_*` names.

Supabase Auth must allow the production confirmation URL plus the intended Vercel preview and localhost callbacks.

## Verification and Known Issues

Completed checks:

- `npm run lint` passed for the contacts feature branch before merge.
- `npm run build` passed from a fresh GitHub branch download.
- Auth UI was checked at desktop and mobile widths.
- Unauthenticated `/jobs` access redirects to `/login`.
- Contact/job-party functions and indexes were verified in Supabase.

Known limitations:

- The authenticated contact UI compiled successfully but was not fully browser-tested with production credentials in the development browser session.
- `npm audit --omit=dev` reported two moderate issues in a Next.js/PostCSS dependency chain. The suggested force fix would incorrectly downgrade Next.js and was not applied.
- `docs/database/supabase-development.md` may lag behind the live migration list. This file and Supabase migration history take precedence until it is refreshed.
- WorkDrive, CRM, Sign, PDF generation, delivery workers, and complete inspection authoring are not implemented in the custom app yet.

## Recommended Next Build Sequence

1. **Inspection authoring foundation**
   - Add job workspace navigation and draft/readiness state.
   - Implement findings and recommendations with report-section classification.
   - Explain exactly what blocks report readiness.
2. **Evidence and diagrams**
   - Implement an asset-provider interface.
   - Add direct-to-provider uploads or signed upload sessions.
   - Store WorkDrive file IDs, hashes, MIME type, size, ordering, captions, and finding links.
   - Port proven drawing behavior behind the asset model or build a better editor.
3. **Document generation**
   - Build a canonical report view independent of Creator HTML.
   - Generate immutable PDF versions.
   - Record generation status, checksum, storage reference, and readiness snapshot.
4. **Send Center**
   - Select recipients from job parties with `report_recipient` preselected.
   - Permit validated additional/manual recipients.
   - Send a specific document version through a background job.
   - Record delivery, recipients, provider message ID, timestamps, failures, and retries.
5. **Contracts and signatures**
   - Choose signer independently from report recipients.
   - Create Zoho Sign envelopes through an adapter.
   - Mirror envelope/signer status into provider references and audit events.
6. **Zoho CRM synchronization**
   - Define field mappings and ownership rules first.
   - Add idempotent contact/company/communication sync.
   - Avoid two-way conflict behavior until explicitly designed.

## New-Chat Startup Checklist

1. Read this file and the supporting architecture documents.
2. Inspect current `main` and all open pull requests.
3. Confirm the latest Vercel deployment and production URL.
4. Inspect Supabase migration history before proposing or applying SQL.
5. Run `npm install`, `npm run lint`, and `npm run build` in a fresh checkout before publishing code changes.
6. Work in a focused `codex/*` branch and open a draft PR.
7. Update this file when a major feature merges, a migration deploys, or an architecture boundary changes.

Suggested fresh-chat prompt:

> Continue TIG 360 from `elephant-tech-labs/tig-360`. Read `PROJECT_CONTEXT.md` first, inspect current `main` and open PRs, and verify live Supabase migration state before changing code. Continue with the next incomplete documented slice while preserving tenant RLS and the Supabase/WorkDrive/Zoho provider boundaries.

## Supporting Documents

- [`docs/architecture/product-direction.md`](docs/architecture/product-direction.md)
- [`docs/architecture/system-blueprint.md`](docs/architecture/system-blueprint.md)
- [`docs/decisions/0002-data-storage-and-zoho.md`](docs/decisions/0002-data-storage-and-zoho.md)
- [`docs/database/supabase-development.md`](docs/database/supabase-development.md)
- [`docs/zoho/current-app-inventory.md`](docs/zoho/current-app-inventory.md)
