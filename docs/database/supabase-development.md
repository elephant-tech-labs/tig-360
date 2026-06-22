# Supabase Development Environment

## Project

- Name: `tig360`
- Project reference: `jqqzemvyvjujvpgvongw`
- Project URL: `https://jqqzemvyvjujvpgvongw.supabase.co`
- Region: US West

## Applied Schema

The following migrations have been applied to the production project:

1. `20260619170000_initial_core.sql`
2. `20260619190000_create_inspection_job_rpc.sql`
3. `20260620010000_fix_job_status_enum.sql`
4. `20260620030000_contacts_and_job_parties.sql`
5. `20260620080000_job_editing_and_prior_inspections.sql`
6. `20260620200000_job_report_fields.sql`
7. `20260621120000_contact_addresses_and_inspectors.sql`
8. `20260621180000_independent_inspectors_and_invitations.sql`
9. `20260621210000_findings_workspace.sql`

The latest migration was applied through the Supabase SQL Editor on June 21, 2026.

Post-deployment verification returned:

| Check | Result |
|---|---:|
| Public tables | 19 |
| Public tables with RLS | 19 |
| RLS policies | 26 |
| Core functions | 5 |
| Tables without RLS | none |

The repeatable verification query is stored at `supabase/tests/verify_initial_core.sql`.

Job-editing verification returned:

| Check | Result |
|---|---:|
| Prior-aware create RPC | 1 |
| Job update RPC | 1 |
| Prior-job index | 1 |
| Authenticated execution privileges | true |

The repeatable query is stored at `supabase/tests/verify_job_editing.sql`.

Job report-fields verification returned:

| Check | Result |
|---|---:|
| Escrow column | 1 |
| Twelve-argument create RPC | 1 |
| Fourteen-argument update RPC | 1 |
| Authenticated execution privileges | true |

The repeatable query is stored at `supabase/tests/verify_job_report_fields.sql`.

## Report Review And Delivery

The report review and delivery migration was applied on June 22, 2026:

- `20260622133000_report_review_and_delivery.sql`

It adds approval metadata to immutable document versions, a private
`report-pdfs` storage bucket, report generation/finalization RPCs, manager
approval, and auditable delivery-draft creation. Verification returned:

| approval_columns | private_report_bucket | begin_rpc | complete_rpc | approve_rpc | delivery_rpc | immutable_version_trigger | authenticated_can_generate | authenticated_can_approve |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 4 | 1 | 1 | 1 | 1 | 1 | 1 | true | true |

Generated report PDFs use Supabase Storage initially. Each PDF is represented
by an `assets` row and attached to an immutable `document_versions` snapshot.
Send Center always points to one approved version instead of a mutable job.

## Connection Usage

- Browser: project URL plus publishable key.
- Administrator invitation actions: server-only Supabase secret key.
- Deployed Next.js server: transaction pooler on port 6543.
- Migrations: session pooler on port 5432 when direct IPv6 is unavailable.
- Direct connection: optional for environments with IPv6 support.

Do not commit database passwords, full connection strings, secret/service-role keys, or Zoho credentials.

## Initial Schema Areas

- organizations, profiles, memberships, and roles;
- reusable companies, contacts, and properties;
- inspection jobs and job-party role assignments;
- findings and recommendations;
- WorkDrive-backed assets, evidence links, and diagrams;
- immutable documents and document versions;
- deliveries and recipients;
- provider references for CRM, Sign, WorkDrive, and email;
- append-only audit events.

## Current Database Behavior

- Job creation transactionally creates a property for complete/limited reports.
- Supplemental and reinspection jobs require a prior inspection and reuse its property.
- Job/property editing is transactional through `update_inspection_job`.
- Prior-inspection relationships cannot reference another organization, reference the same job, or form a circular chain.
- Existing job creation and update signatures remain supported during rollout.
- The existing `summary` column stores the report-facing general property description.
- `escrow_number` stores the job-specific escrow reference.

The contact-address and inspector migration was applied through the Supabase SQL
Editor on June 21, 2026. Verification returned seven contact address columns, one
property county column, two job inspector columns, one inspector profile table, one
private signature bucket, and one each of the new create/update job RPC overloads.

The independent-inspector migration was applied through the Supabase SQL Editor on
June 21, 2026. It adds independent inspector business records, optional linked user
accounts, organization invitations, and a compatibility layer for the prior
membership-bound inspector profile implementation. All seven post-deployment checks
passed.

The findings-workspace migration was applied through the Supabase SQL Editor on
June 21, 2026. It adds report-level visible-problem summaries, reusable finding
templates, structured finding/note entries, multiple priced recommendations,
ordering, archive/restore, and future reinspection lineage. All six schema checks
passed.

## Next Database Steps

1. Generate TypeScript database types from the deployed schema.
2. Add integration tests that verify organization isolation with two test users.
3. Add contact editing and optional contact categories/tags.
4. Add the WorkDrive-backed property cover-image asset workflow.
5. Move future schema deployment from manual SQL Editor runs into an automated migration workflow.
