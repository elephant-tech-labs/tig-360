# TIG 360

TIG 360 is a multi-tenant inspection operations platform replacing and improving the existing Zoho Creator termite/WDO inspection workflow.

## Start Here

Read [`PROJECT_CONTEXT.md`](PROJECT_CONTEXT.md) before beginning a new development session. It contains the verified deployment state, database migrations, open PR context, architecture boundaries, known issues, and the recommended next build sequence.

## Architecture References

- [`docs/architecture/product-direction.md`](docs/architecture/product-direction.md)
- [`docs/architecture/system-blueprint.md`](docs/architecture/system-blueprint.md)
- [`docs/decisions/0002-data-storage-and-zoho.md`](docs/decisions/0002-data-storage-and-zoho.md)
- [`docs/zoho/current-app-inventory.md`](docs/zoho/current-app-inventory.md)

## Current Stack

- Next.js, React, and TypeScript
- Supabase Postgres and Auth with organization-scoped RLS
- Vercel deployment
- Zoho WorkDrive for binary storage
- Planned Zoho CRM and Zoho Sign integrations

Production: <https://tig-360.vercel.app>
