# ADR 0002: PostgreSQL, Object Storage, and Zoho Boundaries

Status: Proposed

## Decision Summary

- PostgreSQL is the source of truth for inspection operations.
- Private S3-compatible object storage is the source of truth for photos, diagrams, generated PDFs, contracts, and signed documents.
- Zoho CRM remains the customer/relationship and communication synchronization platform.
- Zoho Sign may remain the initial signature provider.
- Zoho WorkDrive is a migration source and optional archive/mirror, not the primary runtime file store.

## Why Not WorkDrive As Primary Storage

WorkDrive is technically usable through its OAuth API, but making it primary would preserve several constraints already experienced in Creator:

- provider API quotas and latency affect core saves;
- public/PDF-safe links require additional link lifecycle logic;
- file metadata and application records can drift;
- local development and automated testing become provider-dependent;
- changing storage later becomes difficult.

A `StorageProvider` interface can still support an optional WorkDrive archive adapter.

## Low-Cost Starting Options

### Database

Neon is a reasonable development option. Its current free plan advertises 0.5 GB storage per project and scale-to-zero compute: https://neon.com/pricing

Another valid option is Supabase if integrated auth/storage is preferred. Its current free Storage quota is 1 GB: https://supabase.com/docs/guides/platform/manage-your-usage/storage-size

### File Storage

Cloudflare R2 is the preferred low-cost evidence store for the prototype. Its current free tier includes 10 GB-month of Standard storage, one million Class A operations, ten million Class B operations, and free direct egress: https://developers.cloudflare.com/r2/pricing/

These free tiers are suitable for development and controlled pilots, not a promise of permanently free production infrastructure.

## Zoho CRM Boundary

The custom application owns:

- inspection jobs;
- job contacts and roles;
- inspection evidence;
- findings;
- document versions;
- delivery records;
- contract/treatment workflow state.

Zoho CRM owns or mirrors:

- canonical CRM Contacts and Accounts where applicable;
- relationship/lifecycle fields;
- customer-facing communication activity desired by the business.

Synchronization must use stable external IDs, idempotent jobs, conflict rules, and an audit log. Zoho CRM V8 provides CRUD, bulk, notification, query, and composite APIs: https://www.zoho.com/crm/developer/docs/api/v8/

## Accounts Needed Later

No provider account is required to review the architecture or build the UI shell.

Before end-to-end data work, create:

1. one PostgreSQL project, likely Neon or Supabase;
2. one Cloudflare account and private R2 bucket;
3. a Zoho OAuth client/connection suitable for CRM API access;
4. later, credentials for Zoho Sign and the selected email path.

Credentials must be stored only in deployment secrets and local `.env.local`, never committed.
