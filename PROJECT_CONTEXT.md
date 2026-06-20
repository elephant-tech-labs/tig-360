# TIG 360 Project Context

> **Read this first when starting a new Codex chat.**
>
> This document is the operational handoff for TIG 360. It records the product intent, verified deployed state, architecture boundaries, open work, and recommended next steps as of **June 20, 2026**. Before changing code or running database migrations, compare this document with the current `main` branch, open pull requests, Vercel deployment, and Supabase migration history.

## 1. Product Objective

TIG 360 is a modern inspection operations platform being built to replace and improve the existing Zoho Creator application, not merely reproduce it screen-for-screen.

The first domain is termite/WDO inspections. The product should eventually support the full workflow:

1. Create and schedule an inspection job.
2. Associate the property and reusable contacts/companies.
3. Capture inspection details, findings, recommendations, photos, and diagrams.
4. Determine report readiness.
5. Generate an immutable, versioned PDF report.
6. Send the report to one or more recipients and retain delivery history.
7. Prepare and send a contract through Zoho Sign.
8. Synchronize appropriate customer and communication data with Zoho CRM.
9. Retain a complete audit trail.

Supported report types currently modeled are `complete`, `limited`, `supplemental`, and `reinspection`.

## 2. Source Repositories and Services

- GitHub: `elephant-tech-labs/tig-360`
- Production application: <https://tig-360.vercel.app>
- Vercel project: <https://vercel.com/gurinders-projects-f4a0f026/tig-360/deployments>
- Supabase project name: `tig360`
- Supabase project reference: `jqqzemvyvjujvpgvongw`
- Supabase URL: <https://jqqzemvyvjujvpgvongw.supabase.co>

Do not place passwords, database connection strings, Supabase service-role keys, or Zoho OAuth secrets in GitHub. The publishable Supabase key is intended for browser use, but environment values should still be managed through Vercel rather than duplicated in documentation.

## 3. Architecture Direction

The selected architecture is a **modular monolith** with background processing where long-running or retryable work is needed.

- Web application: Next.js 16, React 19, TypeScript
- Primary database and authentication: Supabase Postgres + Supabase Auth
- Tenant isolation: organization-scoped rows protected with Postgres RLS
- Primary file storage: Zoho WorkDrive, initially chosen to control storage cost
- Customer/communication system: Zoho CRM
- Initial signature provider: Zoho Sign
- Deployment: Vercel

### Source-of-truth boundaries

- **Supabase** owns organizations, memberships, application users, inspection jobs, properties, contacts, job parties, findings, recommendations, asset metadata, document versions, delivery history, provider references, and audit events.
- **Zoho WorkDrive** stores large binary files such as photos, diagrams, and generated PDFs.
- **Zoho CRM** receives selected customer/contact and communication information; it is not the transactional inspection database.
- **Zoho Sign** owns signature-envelope execution and signing status, with references/status mirrored into Supabase.

For WorkDrive files, store stable provider identifiers and metadata, not only public URLs. Public/download URLs can expire or be replaced. All external providers should be behind adapters so WorkDrive can later be replaced by Cloudflare R2, Supabase Storage, or another provider without rewriting domain logic.

## 4. Verified Production State

The following was verified in the live Supabase project and production application.

### Authentication and organization setup

- A user can create an account, confirm the email, and sign in.
- A signed-in user without an organization is sent through onboarding.
- Organization creation makes the creator an organization admin.
- Protected application routes require authentication and organization membership.

### Inspection jobs

- `/jobs` lists organization-scoped jobs from Supabase.
- `/jobs/new` creates a property and inspection job transactionally.
- `/jobs/[jobId]` displays job details.
- A production job was successfully created after fixing explicit enum casts in the job RPC.

### Deployed database migrations

1. `20260619170000_initial_core.sql`
   - Created 19 public tables.
   - Enabled RLS on all 19 tables.
   - Added 26 policies.
   - Added core functions for timestamps, profile creation, membership/role checks, and organization creation.
2. `20260619190000_create_inspection_job_rpc.sql`
   - Added transactional property + inspection-job creation.
3. `20260620010000_fix_job_status_enum.sql`
   - Fixed `job_status` assignment with explicit enum casts.
4. `20260620030000_contacts_and_job_parties.sql`
   - Added contact creation and job-party assignment/removal functions.
   - Added uniqueness rules for contact/role assignments and a single primary party per role.

The fourth migration is deployed in Supabase. Its matching application UI is currently carried by PR #6 until that PR is merged.

### Core schema

The initial schema includes:

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

## 5. Contact and Job-Party Model

Contacts are reusable organization records, independent of a single job. A contact can belong to a company and can serve several roles on the same or different jobs.

Supported job-party roles:

- `ordered_by`
- `property_owner`
- `report_recipient`
- `party_of_interest`
- `signer`

Rules:

- The same person may fill multiple roles.
- A role may have multiple people.
- Only one person may be marked primary for a given role on a job.
- Removing a person from a job removes the assignment, not the reusable contact.
- The report recipient is the default report destination, but users may send to additional contacts.
- A contract signer may be different from every report contact.

PR #6 adds:

- `/contacts`
- `/contacts/new`
- `/jobs/[jobId]/contacts`
- Create contact, including optional company matching/creation.
- Assign existing contacts to job roles.
- Create-and-assign contacts in one workflow.
- Remove job-party assignments.

## 6. Current GitHub State

As of June 20, 2026:

- PR #6: `codex/contacts-job-parties` into `main`
  - Contains the contacts/job-party feature.
  - Also contains the job-status enum hotfix.
  - Supersedes PR #5 if merged.
- PR #5 contains only the enum hotfix and should not also be merged after PR #6 without checking the branch history.
- Earlier foundational work was merged through PR #2.

At the start of a new session:

1. Inspect `main` and all open PRs.
2. Determine whether PR #6 has been merged.
3. Treat the live Supabase migration list as authoritative for applied migrations.
4. Never rerun or edit an already-applied migration in place; add a new versioned migration for changes.

## 7. Current Application Routes

Implemented or carried in the current feature branch:

| Route | Purpose |
| --- | --- |
| `/login` | Sign in and initial account creation |
| `/auth/confirm` | Supabase email confirmation callback |
| `/onboarding` | Create first organization |
| `/jobs` | Inspection job list |
| `/jobs/new` | Create property and job |
| `/jobs/[jobId]` | Job workspace/detail |
| `/contacts` | Reusable contact directory |
| `/contacts/new` | Create a contact |
| `/jobs/[jobId]/contacts` | Assign and manage job parties |

## 8. Zoho Creator Migration Context

The audited Creator backup was named:

`trident-inspect360_v1_19-Jun-2026_15_05_54`

It contained approximately 6 forms, 11 pages, 7 reports, and 10 functions, with integrations to WorkDrive, CRM, Sign, Writer, and OpenAI.

Important lessons from the Creator application:

- The inspection job/report is the central aggregate.
- Report details, photos, diagrams, findings/recommendations, contracts, and delivery history must stay linked by stable IDs.
- Creator workflows were difficult to evolve and could be sensitive to workflow triggers and external API quotas.
- Image fields had per-field limits, leading to split photo fields and custom WorkDrive synchronization.
- Public/PDF-safe URLs were generated after uploads so images rendered in exported reports.
- Sending history must show what was sent, to whom, when, by whom, using which document version, and whether delivery succeeded.

The custom app should preserve the proven business workflow while improving data modeling, reliability, testability, editing speed, and user experience.

## 9. Product and Engineering Principles

- The inspection job is the primary workspace, not a loose collection of forms.
- Optimize operational screens for scanning and repeated work; avoid marketing-page composition inside the application.
- Save drafts continuously where practical.
- Report generation must create immutable versions rather than silently replacing previously sent documents.
- Sending a report must reference a specific document version.
- External side effects must be idempotent, retryable, observable, and recorded.
- Maintain an append-only audit trail for meaningful business actions.
- Enforce tenant isolation in the database with RLS, not only in UI code.
- Reuse contacts, companies, and properties rather than copying unstructured text into every job.
- Keep provider-specific APIs out of core domain modules.
- Prefer focused migrations and tests; do not recreate the entire Creator app before validating each workflow slice.

## 10. Environment Configuration

The production Vercel project has been configured with the application URL and public Supabase variables. Runtime secrets should be managed in Vercel and corresponding provider dashboards.

Expected public variables:

```text
NEXT_PUBLIC_APP_URL
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
```

Future server-only variables will be required for WorkDrive, CRM, Sign, email delivery, and worker authentication. They must never be exposed through `NEXT_PUBLIC_*` names.

Supabase Auth should allow the production confirmation URL and appropriate Vercel preview/localhost callback URLs.

## 11. Verification and Known Issues

Completed checks:

- `npm run lint` passed for the current feature branch.
- `npm run build` passed for the current feature branch.
- Auth screen was visually checked at desktop and mobile widths.
- Unauthenticated access to `/jobs` redirects to `/login`.
- Supabase functions and indexes for contacts/job parties were verified after migration.

Known limitations:

- The authenticated contact UI was compiled but was not fully browser-tested with production credentials in the development browser session.
- `npm audit --omit=dev` reported two moderate issues in a Next.js/PostCSS dependency chain. The suggested force fix would incorrectly downgrade Next.js and was not applied.
- The database development note may lag behind the live migration list; this handoff and Supabase migration history take precedence until that note is refreshed.
- WorkDrive, CRM, Sign, PDF generation, delivery workers, and complete inspection authoring are not implemented in the custom app yet.

## 12. Recommended Next Build Sequence

After PR #6 is reviewed and merged:

1. **Inspection authoring foundation**
   - Add job workspace navigation and draft/readiness state.
   - Implement findings and recommendations with report-section classification.
   - Add validation that explains exactly what blocks report readiness.
2. **Evidence and diagrams**
   - Implement the asset provider interface.
   - Add direct-to-provider uploads or signed upload sessions.
   - Store WorkDrive file IDs, hashes, MIME type, size, ordering, captions, and links to findings.
   - Build a new diagram editor or port the proven drawing behavior behind the asset model.
3. **Document generation**
   - Build a canonical report view independent of Zoho Creator HTML.
   - Generate immutable PDF document versions.
   - Record generation status, checksum, storage reference, and readiness snapshot.
4. **Send Center**
   - Select recipients from job parties, with `report_recipient` preselected.
   - Allow additional/manual recipients with validation.
   - Send a specific document version through a background job.
   - Record delivery, recipients, provider message ID, timestamps, failures, and retries.
5. **Contracts and signatures**
   - Choose signer independently from report recipients.
   - Create Zoho Sign envelopes through an adapter.
   - Mirror envelope and signer status into provider references/audit history.
6. **Zoho CRM synchronization**
   - Define field mappings and ownership rules first.
   - Add idempotent contact/company/job communication sync.
   - Avoid two-way conflict behavior until explicitly designed.

## 13. New-Chat Startup Checklist

A new coding session should begin with this sequence:

1. Read this file and the linked architecture documents.
2. Inspect the current `main` branch and open PRs on GitHub.
3. Confirm the production URL responds and check the latest Vercel deployment status.
4. Inspect the Supabase migration history before proposing SQL.
5. Run `npm install`, `npm run lint`, and `npm run build` in a fresh checkout when code changes are planned.
6. Keep changes in a focused `codex/*` branch and open a draft PR.
7. Update this document whenever a major feature is merged, a migration is deployed, or an architecture boundary changes.

Suggested prompt for a fresh chat:

> Continue building TIG 360 from `elephant-tech-labs/tig-360`. Read `PROJECT_CONTEXT.md` first, inspect current `main` and open PRs, and verify the live Supabase migration state before changing code. Continue with the next incomplete slice in the documented build sequence, preserving the Supabase/WorkDrive/Zoho provider boundaries and tenant RLS rules.

## 14. Supporting Documents

- [`docs/architecture/product-direction.md`](docs/architecture/product-direction.md)
- [`docs/architecture/system-blueprint.md`](docs/architecture/system-blueprint.md)
- [`docs/decisions/0002-data-storage-and-zoho.md`](docs/decisions/0002-data-storage-and-zoho.md)
- [`docs/database/supabase-development.md`](docs/database/supabase-development.md)
- [`docs/zoho/current-app-inventory.md`](docs/zoho/current-app-inventory.md)
