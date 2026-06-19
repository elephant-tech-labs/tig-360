# ADR 0002: Supabase, WorkDrive, and Zoho Boundaries

Status: Accepted

Decision date: June 19, 2026

## Decision Summary

- Supabase PostgreSQL is the source of truth for inspection operations.
- Supabase Auth provides application identity; PostgreSQL Row Level Security enforces organization isolation.
- Zoho WorkDrive is the initial primary file provider for photos, diagrams, generated PDFs, contracts, and signed documents.
- PostgreSQL stores durable WorkDrive file IDs and metadata, not only public URLs.
- Zoho CRM remains the customer/relationship and communication synchronization platform.
- Zoho Sign may remain the initial signature provider.
- All providers remain behind adapters so storage, email, signing, and CRM behavior can change independently.

## Why Supabase

The application needs strongly relational data for reusable contacts, companies, properties, job roles, findings, evidence links, document versions, recipients, and audit history. Supabase provides managed PostgreSQL, authentication, APIs, and a development dashboard within one low-cost platform.

The database stores structured records and file metadata. Large photos and documents are not stored in PostgreSQL, keeping database usage small.

Project selected for development:

- project name: `tig360`;
- project reference: `jqqzemvyvjujvpgvongw`;
- region: US West;
- initial core schema applied: June 19, 2026.

## Why WorkDrive Initially

Trident already uses and pays for Zoho services. WorkDrive can therefore provide substantially more included file capacity than creating another paid storage account.

The application must not store only a WorkDrive URL. Each asset stores:

- `storage_provider`;
- durable `provider_file_id`;
- optional `provider_folder_id`;
- original filename and content type;
- byte size and checksum where available;
- processing status and metadata.

View or download URLs are generated when needed. Public links are not durable file identity and files remain private by default.

## WorkDrive Tradeoffs

- uploads and downloads depend on Zoho API availability and quotas;
- temporary link creation adds provider calls;
- PDF generation must retrieve files through the provider adapter;
- automated tests require a fake storage adapter;
- a future migration must copy file bytes while preserving application asset IDs.

These tradeoffs are accepted for the initial cost-sensitive release. A `StorageProvider` interface preserves a future move to Cloudflare R2, Supabase Storage, or another S3-compatible provider.

## Zoho CRM Boundary

The custom application owns:

- inspection jobs and appointments;
- job contacts and role assignments;
- inspection evidence and findings;
- immutable document versions;
- delivery records;
- contract and treatment workflow state.

Zoho CRM owns or mirrors:

- canonical CRM Contacts and Accounts where applicable;
- relationship and lifecycle fields;
- customer-facing communication activity desired by the business.

Synchronization uses stable external IDs, idempotent jobs, conflict rules, provider references, and an audit log.

## Credentials

- the Supabase publishable key may be used in browser code with Row Level Security enabled;
- database passwords, connection strings, secret/service-role keys, and Zoho OAuth credentials remain server-only;
- secrets belong in `.env.local` and deployment secret management, never GitHub;
- the transaction pooler is used for serverless runtime connections;
- the session pooler is used for migrations when direct IPv6 connectivity is unavailable.
