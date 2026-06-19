# ADR 0001: Start As A Modular Monolith

Status: Proposed

## Context

Trident Inspect360 spans inspection authoring, media, diagrams, findings, reports, contracts, communications, treatment, billing integration, and audit history. The business boundaries are still being refined from the Creator prototype.

## Decision

Build one Next.js/TypeScript application and PostgreSQL database with strict internal domain modules. Use separate background workers for long-running or provider-dependent work.

Initial modules:

- identity and permissions;
- contacts, companies, and properties;
- inspection jobs and appointments;
- inspection templates and findings;
- evidence and drawings;
- documents and PDF generation;
- proposals and contracts;
- communications;
- signatures;
- treatment operations;
- billing integrations;
- audit history;
- Zoho synchronization.

External providers are accessed through interfaces rather than directly from UI components.

## Why

- faster iteration than microservices;
- simpler local development and deployment;
- transactional consistency across a job;
- easier migration from Creator;
- preserves the option to extract services later when scale or ownership demands it.

## Consequences

- module boundaries must be enforced in code review;
- background jobs need idempotency and retries;
- provider adapters must not leak provider-specific fields throughout the domain model.
