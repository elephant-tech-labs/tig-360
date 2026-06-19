# Product Direction

## Product Thesis

Trident Inspect360 should become a unified inspection job workspace, not a direct recreation of the Zoho Creator forms.

A job is the central object. Inspectors, office staff, managers, and treatment teams work from the same job record while seeing controls appropriate to their role.

## Primary Workflow

1. Create or import a job.
2. Assign the property, customer parties, inspector, appointment, and report type.
3. Capture field evidence: photos, diagram, notes, findings, and recommendations.
4. Resolve readiness issues and generate a versioned report.
5. Deliver the report to selected recipients and retain a permanent delivery record.
6. Build a proposal or contract from accepted findings.
7. Send for signature and track the signed artifact.
8. Schedule treatment and crew work where applicable.
9. Synchronize customer and communication activity with Zoho CRM.

## Product Principles

### One Job Workspace

Users should not navigate among unrelated forms to understand a report. The workspace should expose the current stage, missing requirements, recent activity, and next meaningful actions.

### Evidence Has Context

Photos and diagram markers should be attachable to findings, locations, recommendations, and report sections. Evidence is more valuable when its purpose is explicit.

### Documents Are Immutable Versions

Generated reports, proposals, contracts, and signed files are document versions. Regenerating a report creates a new version instead of silently replacing the artifact that may already have been delivered.

### Delivery Is Auditable

Every send records recipients, document version, sender, provider message ID, timestamp, status, and failure details. A single `sent` checkbox is insufficient.

### Contacts Are Reusable

People and companies are reusable records. Their role on a job is represented by an assignment such as Ordered By, Property Owner, Report Recipient, Party of Interest, or Signer. The same person may hold several roles.

### Providers Are Replaceable

Zoho CRM, Zoho Sign, object storage, email, and AI are accessed through adapters. Provider-specific identifiers remain at integration boundaries instead of becoming the application data model.

## Initial User Roles

- Inspector: collect evidence, author findings, complete the inspection.
- Office Coordinator: create jobs, manage contacts, review readiness, deliver reports, and prepare contracts.
- Manager: approve documents, manage templates, view operational reporting, and resolve exceptions.
- Treatment Coordinator: convert approved work into treatment jobs and crew instructions.
- Administrator: manage users, permissions, integrations, templates, and audit access.

## First Release Scope

The first production-capable release should cover:

- authentication and organization membership;
- job list and job workspace;
- property and job-party management;
- report types and prior-report relationships;
- photos, diagram, findings, and recommendations;
- readiness validation;
- versioned PDF report generation;
- Send Center with recipient selection and delivery history;
- basic proposal/contract generation;
- Zoho CRM contact/account synchronization;
- import tools for the Creator backup;
- audit history.

Treatment operations, invoicing, NOC, advanced analytics, and a customer portal should follow after the inspection-to-delivery flow is stable.

## Success Measures

- an inspector can complete a standard report without leaving the job workspace;
- office staff can identify why a report is not ready in one view;
- every delivered document can be traced to an immutable version and recipient list;
- retrying a failed provider operation cannot create duplicate CRM records, emails, or signature requests;
- normal application saves do not depend on WorkDrive, CRM, Sign, or AI being available;
- a new report template or workflow rule can be introduced without duplicating page-level code.
