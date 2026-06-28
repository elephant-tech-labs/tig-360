begin;

create table if not exists public.signature_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  inspection_job_id uuid not null references public.inspection_jobs(id) on delete cascade,
  document_version_id uuid not null references public.document_versions(id) on delete restrict,
  contact_id uuid references public.contacts(id) on delete set null,
  signer_name text not null,
  signer_email text not null,
  status text not null default 'draft' check (
    status in ('draft', 'sending', 'sent', 'viewed', 'completed', 'declined', 'expired', 'failed', 'cancelled', 'unknown')
  ),
  provider text not null default 'zoho_sign' check (provider = 'zoho_sign'),
  provider_request_id text,
  provider_action_id text,
  provider_document_id text,
  provider_status text,
  request_name text not null,
  failure_message text,
  sent_at timestamptz,
  completed_at timestamptz,
  last_status_checked_at timestamptz,
  signed_asset_id uuid references public.assets(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.signature_request_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  signature_request_id uuid not null references public.signature_requests(id) on delete cascade,
  event_type text not null,
  provider_status text,
  summary text not null,
  payload jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create unique index if not exists signature_requests_provider_request_idx
on public.signature_requests(provider_request_id)
where provider_request_id is not null;

create index if not exists signature_requests_job_created_idx
on public.signature_requests(inspection_job_id, created_at desc);

create index if not exists signature_requests_document_version_idx
on public.signature_requests(document_version_id);

create index if not exists signature_request_events_request_created_idx
on public.signature_request_events(signature_request_id, created_at desc);

drop trigger if exists signature_requests_set_updated_at on public.signature_requests;
create trigger signature_requests_set_updated_at
before update on public.signature_requests
for each row execute procedure public.set_updated_at();

alter table public.signature_requests enable row level security;
alter table public.signature_request_events enable row level security;

drop policy if exists signature_requests_org_access on public.signature_requests;
create policy signature_requests_org_access
on public.signature_requests for all to authenticated
using (public.is_organization_member(organization_id))
with check (public.is_organization_member(organization_id));

drop policy if exists signature_request_events_org_access on public.signature_request_events;
create policy signature_request_events_org_access
on public.signature_request_events for all to authenticated
using (public.is_organization_member(organization_id))
with check (public.is_organization_member(organization_id));

grant select, insert, update, delete on public.signature_requests to authenticated;
grant select, insert, update, delete on public.signature_request_events to authenticated;

commit;
