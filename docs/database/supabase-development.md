# Supabase Development Environment

## Project

- Name: `tig360`
- Project reference: `jqqzemvyvjujvpgvongw`
- Project URL: `https://jqqzemvyvjujvpgvongw.supabase.co`
- Region: US West

## Applied Schema

Migration `supabase/migrations/20260619170000_initial_core.sql` was applied through the Supabase SQL Editor on June 19, 2026.

Post-deployment verification returned:

| Check | Result |
|---|---:|
| Public tables | 19 |
| Public tables with RLS | 19 |
| RLS policies | 26 |
| Core functions | 5 |
| Tables without RLS | none |

The repeatable verification query is stored at `supabase/tests/verify_initial_core.sql`.

## Connection Usage

- Browser: project URL plus publishable key.
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

## Next Database Steps

1. Add Supabase server/browser clients to the Next.js application.
2. Build sign-in and first-organization onboarding.
3. Generate TypeScript database types from the deployed schema.
4. Add application services for job list and job creation.
5. Add integration tests that verify organization isolation with two test users.
6. Move future schema changes through versioned migrations and a deployment workflow rather than ad hoc dashboard edits.
