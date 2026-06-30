begin;

alter table public.job_proposals
  add column if not exists customer_summary text,
  add column if not exists customer_summary_generated_at timestamptz,
  add column if not exists customer_summary_source jsonb not null default '{}'::jsonb;

create table if not exists public.proposal_review_links (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  inspection_job_id uuid not null references public.inspection_jobs(id) on delete cascade,
  proposal_id uuid references public.job_proposals(id) on delete set null,
  report_document_version_id uuid references public.document_versions(id) on delete set null,
  proposal_document_version_id uuid references public.document_versions(id) on delete set null,
  contact_id uuid references public.contacts(id) on delete set null,
  delivery_id uuid references public.deliveries(id) on delete set null,
  signer_name text not null,
  signer_email text not null,
  token_hash text not null unique,
  status text not null default 'active'
    check (status in ('active', 'revoked', 'expired', 'signed')),
  expires_at timestamptz not null default (now() + interval '30 days'),
  last_viewed_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists proposal_review_links_org_job_idx
  on public.proposal_review_links(organization_id, inspection_job_id, created_at desc);

create index if not exists proposal_review_links_token_hash_idx
  on public.proposal_review_links(token_hash);

drop trigger if exists proposal_review_links_set_updated_at on public.proposal_review_links;
create trigger proposal_review_links_set_updated_at
  before update on public.proposal_review_links
  for each row execute function public.set_updated_at();

alter table public.proposal_review_links enable row level security;

drop policy if exists proposal_review_links_select_org_members on public.proposal_review_links;
create policy proposal_review_links_select_org_members
  on public.proposal_review_links
  for select
  to authenticated
  using (public.is_organization_member(organization_id));

drop policy if exists proposal_review_links_insert_org_members on public.proposal_review_links;
create policy proposal_review_links_insert_org_members
  on public.proposal_review_links
  for insert
  to authenticated
  with check (public.is_organization_member(organization_id));

drop policy if exists proposal_review_links_update_org_members on public.proposal_review_links;
create policy proposal_review_links_update_org_members
  on public.proposal_review_links
  for update
  to authenticated
  using (public.is_organization_member(organization_id))
  with check (public.is_organization_member(organization_id));

grant select, insert, update on public.proposal_review_links to authenticated;

commit;
