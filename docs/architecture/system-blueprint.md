# System Blueprint

## Architecture

Start as a modular monolith with three deployable concerns:

1. Web application: Next.js App Router, React, TypeScript.
2. Background worker: document generation, delivery, CRM synchronization, imports, and provider retries.
3. PostgreSQL database and private object storage.

The web app and worker share domain packages and database types. Long-running work is persisted as jobs and never depends on an open browser request.

```mermaid
flowchart LR
  U[Inspector or Office User] --> W[Next.js Web App]
  W --> DB[(PostgreSQL)]
  W --> S[Private Object Storage]
  W --> Q[Durable Job Queue]
  Q --> WK[Background Worker]
  WK --> PDF[PDF Renderer]
  WK --> CRM[Zoho CRM Adapter]
  WK --> SIGN[Zoho Sign Adapter]
  WK --> MAIL[Email Adapter]
  WK --> WD[Optional WorkDrive Archive]
  WK --> DB
  WK --> S
```

## Domain Modules

### Identity

Organizations, users, memberships, roles, permissions, and sessions.

### CRM Directory

Contacts, companies, addresses, properties, CRM external references, merge state, and synchronization state.

### Inspection Jobs

Jobs, appointments, report type, prior-report relationship, assigned inspector, job stage, due dates, and operational status.

### Job Parties

Role assignments between a job and a contact/company. A party may have multiple roles and role-specific delivery preferences.

### Inspection Authoring

Template version, inspection sections, observations, findings, recommendations, categories, severity, Section I/II classification, and completion state.

### Evidence

Assets, image metadata, upload state, evidence links, annotations, diagram source JSON, diagram render, and version history.

### Documents

Document definitions, generation requests, immutable versions, templates, render status, checksums, and stored artifacts.

### Communications

Delivery drafts, recipients, attachments/document versions, send attempts, provider IDs, status events, bounce/failure details, and CRM activity synchronization.

### Proposals And Signatures

Proposal lines, pricing, contract versions, signer assignments, signature requests, signature events, and signed artifacts.

### Operations

Treatment work orders, scheduling, crew sheets, completion evidence, invoices, and NOC. This boundary is reserved early but implemented after the core report flow.

### Audit

Append-only actor, action, entity, before/after summary, request correlation, timestamp, and source.

## Core Data Relationships

```mermaid
erDiagram
  ORGANIZATION ||--o{ MEMBERSHIP : has
  USER ||--o{ MEMBERSHIP : joins
  ORGANIZATION ||--o{ INSPECTION_JOB : owns
  PROPERTY ||--o{ INSPECTION_JOB : receives
  INSPECTION_JOB ||--o{ JOB_PARTY : assigns
  CONTACT ||--o{ JOB_PARTY : participates
  COMPANY ||--o{ JOB_PARTY : participates
  INSPECTION_JOB ||--o{ FINDING : contains
  FINDING ||--o{ RECOMMENDATION : has
  INSPECTION_JOB ||--o{ ASSET : stores
  ASSET ||--o{ EVIDENCE_LINK : referenced_by
  FINDING ||--o{ EVIDENCE_LINK : supported_by
  INSPECTION_JOB ||--o{ DOCUMENT : produces
  DOCUMENT ||--o{ DOCUMENT_VERSION : versions
  DOCUMENT_VERSION ||--o{ DELIVERY : delivered_as
  DELIVERY ||--o{ DELIVERY_RECIPIENT : addressed_to
  INSPECTION_JOB ||--o{ PROPOSAL : offers
  PROPOSAL ||--o{ SIGNATURE_REQUEST : signed_through
```

## File Lifecycle

1. Browser requests a short-lived signed upload URL.
2. Browser uploads directly to private object storage.
3. App records an asset in `uploaded` state.
4. Worker validates content type, dimensions, checksum, and malware policy.
5. Worker creates thumbnails/optimized variants and marks the asset ready.
6. Documents reference stable asset IDs, not public URLs.
7. PDF rendering receives short-lived internal URLs or streamed bytes.

WorkDrive may receive an asynchronous archive copy after an asset or final document is ready. An archive failure does not invalidate the original save.

## Zoho CRM Synchronization

The custom app owns operational inspection state. CRM retains relationship records and desired communication activity.

Each synchronized record stores:

- local entity ID;
- Zoho module and record ID;
- last local revision;
- last remote modified time;
- synchronization status;
- last successful sync time;
- last error and retry count.

Outbound changes use idempotency keys. Inbound updates arrive through notifications/webhooks where available, with scheduled reconciliation as a safety net. Conflict rules are explicit per field; neither system silently overwrites the other.

## Email And Communication Boundary

The application should not assume that sending and CRM logging are the same operation.

A communication provider sends the message and returns a provider message ID. A separate CRM activity adapter records or links the communication in Zoho CRM. This permits one of these paths after a short integration spike:

- send through a Zoho-supported mail/CRM endpoint and record automatically;
- send through a transactional provider and create the corresponding CRM activity;
- use an organization mailbox and synchronize the activity.

The final choice depends on deliverability, attachment limits, CRM visibility, and available Zoho API behavior.

## Reliability Rules

- provider calls run through durable jobs with retries and exponential backoff;
- every job handler is idempotent;
- document generation uses a captured data snapshot;
- delivery always points to a specific document version;
- signature requests cannot be duplicated by retry;
- audit events and provider request correlation IDs are retained;
- UI displays queued, processing, completed, and failed states;
- provider outages never erase user-entered inspection data.

## Security Baseline

- organization-scoped authorization on every query;
- least-privilege roles and explicit sensitive actions;
- private storage with short-lived signed URLs;
- OAuth tokens encrypted at rest;
- secrets only in deployment secret management;
- file validation before downstream rendering;
- immutable audit records for sends, approvals, signatures, and exports;
- backups and restore tests for database and final documents.

## Suggested Repository Shape

```text
app/                    Next.js routes and layouts
components/             reusable UI components
modules/                domain modules and application services
integrations/           Zoho, storage, email, signing, and AI adapters
workers/                durable job handlers
lib/                    shared infrastructure
prisma/                 database schema and migrations
docs/architecture/      product and system blueprints
docs/decisions/         architecture decision records
docs/zoho/              audited Creator behavior and migration notes
```

## Delivery Sequence

1. Foundation: repository, design system, auth boundary, database schema, object storage adapter, and job shell.
2. Inspection authoring: job parties, evidence, diagram, findings, and readiness.
3. Documents: report snapshots, PDF generation, versions, and preview.
4. Send Center: recipient selection, email delivery, delivery history, and CRM activity sync.
5. Contracts: proposal generation, signer selection, Zoho Sign, and signed files.
6. Migration: repeatable import with reconciliation reports.
7. Operations: treatment, crew sheets, invoicing integration, and NOC.
