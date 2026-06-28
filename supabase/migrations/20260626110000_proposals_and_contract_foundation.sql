-- Proposal and contract foundation for job-level quote authoring.

create table if not exists public.job_proposals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  inspection_job_id uuid not null references public.inspection_jobs(id) on delete cascade,
  status text not null default 'draft'
    check (status in ('draft', 'ready', 'approved', 'sent', 'signed', 'void')),
  title text not null default 'Inspection proposal',
  customer_note text,
  internal_note text,
  terms text,
  tax_rate numeric(7,4) not null default 0 check (tax_rate >= 0),
  discount_amount numeric(12,2) not null default 0 check (discount_amount >= 0),
  subtotal_amount numeric(12,2) not null default 0,
  tax_amount numeric(12,2) not null default 0,
  total_amount numeric(12,2) not null default 0,
  approved_by uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (inspection_job_id)
);

create table if not exists public.proposal_line_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  proposal_id uuid not null references public.job_proposals(id) on delete cascade,
  inspection_job_id uuid not null references public.inspection_jobs(id) on delete cascade,
  source_type text not null default 'manual'
    check (source_type in ('finding_recommendation', 'finding', 'manual')),
  finding_id uuid references public.findings(id) on delete set null,
  recommendation_id uuid references public.recommendations(id) on delete set null,
  item_code text,
  section text check (
    section is null or section in ('section_i', 'section_ii', 'further_inspection', 'other', 'manual')
  ),
  title text not null,
  description text,
  quantity numeric(10,2) not null default 1 check (quantity > 0),
  unit_price numeric(12,2) not null default 0 check (unit_price >= 0),
  included boolean not null default true,
  sort_order integer not null default 0,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (proposal_id, recommendation_id)
);

create index if not exists job_proposals_job_idx
on public.job_proposals(organization_id, inspection_job_id);

create index if not exists proposal_line_items_proposal_idx
on public.proposal_line_items(proposal_id, sort_order);

create index if not exists proposal_line_items_finding_idx
on public.proposal_line_items(finding_id);

drop trigger if exists job_proposals_set_updated_at on public.job_proposals;
create trigger job_proposals_set_updated_at
before update on public.job_proposals
for each row execute procedure public.set_updated_at();

drop trigger if exists proposal_line_items_set_updated_at on public.proposal_line_items;
create trigger proposal_line_items_set_updated_at
before update on public.proposal_line_items
for each row execute procedure public.set_updated_at();

alter table public.job_proposals enable row level security;
alter table public.proposal_line_items enable row level security;

drop policy if exists job_proposals_org_access on public.job_proposals;
create policy job_proposals_org_access
on public.job_proposals for all to authenticated
using (public.is_organization_member(organization_id))
with check (public.is_organization_member(organization_id));

drop policy if exists proposal_line_items_org_access on public.proposal_line_items;
create policy proposal_line_items_org_access
on public.proposal_line_items for all to authenticated
using (public.is_organization_member(organization_id))
with check (public.is_organization_member(organization_id));

grant select, insert, update, delete on public.job_proposals to authenticated;
grant select, insert, update, delete on public.proposal_line_items to authenticated;

create or replace function public.recalculate_job_proposal_totals(target_proposal_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  line_subtotal numeric(12,2);
  discount_value numeric(12,2);
  taxable_base numeric(12,2);
  proposal_tax_rate numeric(7,4);
begin
  select coalesce(sum(quantity * unit_price), 0)::numeric(12,2)
    into line_subtotal
  from public.proposal_line_items
  where proposal_id = target_proposal_id
    and included = true;

  select least(coalesce(discount_amount, 0), line_subtotal), coalesce(tax_rate, 0)
    into discount_value, proposal_tax_rate
  from public.job_proposals
  where id = target_proposal_id;

  taxable_base := greatest(line_subtotal - coalesce(discount_value, 0), 0);

  update public.job_proposals
  set
    subtotal_amount = line_subtotal,
    tax_amount = round(taxable_base * (proposal_tax_rate / 100), 2),
    total_amount = round(taxable_base + (taxable_base * (proposal_tax_rate / 100)), 2)
  where id = target_proposal_id;
end;
$$;

create or replace function public.recalculate_job_proposal_totals_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.recalculate_job_proposal_totals(coalesce(new.proposal_id, old.proposal_id));
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists proposal_line_items_recalculate_totals on public.proposal_line_items;
create trigger proposal_line_items_recalculate_totals
after insert or update or delete on public.proposal_line_items
for each row execute procedure public.recalculate_job_proposal_totals_trigger();

create or replace function public.ensure_job_proposal(
  target_organization_id uuid,
  target_job_id uuid
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  saved_proposal_id uuid;
  job_number_value bigint;
begin
  if not public.is_organization_member(target_organization_id) then
    raise exception 'Active organization membership required';
  end if;

  select job_number into job_number_value
  from public.inspection_jobs
  where id = target_job_id
    and organization_id = target_organization_id;

  if job_number_value is null then
    raise exception 'Inspection job not found';
  end if;

  insert into public.job_proposals (
    organization_id,
    inspection_job_id,
    title,
    created_by
  )
  values (
    target_organization_id,
    target_job_id,
    'Proposal for inspection job #' || job_number_value::text,
    auth.uid()
  )
  on conflict (inspection_job_id) do update
    set updated_at = public.job_proposals.updated_at
  returning id into saved_proposal_id;

  return saved_proposal_id;
end;
$$;

create or replace function public.import_proposal_lines_from_findings(
  target_organization_id uuid,
  target_job_id uuid,
  target_proposal_id uuid
)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  imported_count integer := 0;
begin
  if not public.is_organization_member(target_organization_id) then
    raise exception 'Active organization membership required';
  end if;

  if not exists (
    select 1 from public.job_proposals
    where id = target_proposal_id
      and inspection_job_id = target_job_id
      and organization_id = target_organization_id
  ) then
    raise exception 'Proposal not found';
  end if;

  insert into public.proposal_line_items (
    organization_id,
    proposal_id,
    inspection_job_id,
    source_type,
    finding_id,
    recommendation_id,
    item_code,
    section,
    title,
    description,
    quantity,
    unit_price,
    included,
    sort_order,
    created_by
  )
  select
    target_organization_id,
    target_proposal_id,
    target_job_id,
    'finding_recommendation',
    finding.id,
    recommendation.id,
    finding.code,
    coalesce(recommendation.section, finding.classification, 'other'),
    coalesce(nullif(finding.title, ''), finding.code, 'Recommendation'),
    recommendation.description,
    1,
    coalesce(recommendation.estimated_cost, 0),
    true,
    coalesce((select max(sort_order) from public.proposal_line_items where proposal_id = target_proposal_id), -1)
      + (row_number() over (order by finding.sort_order, recommendation.sort_order, recommendation.created_at))::integer,
    auth.uid()
  from public.findings finding
  join public.recommendations recommendation on recommendation.finding_id = finding.id
  where finding.inspection_job_id = target_job_id
    and finding.organization_id = target_organization_id
    and finding.entry_type = 'finding'
    and finding.archived_at is null
    and recommendation.archived_at is null
    and not exists (
      select 1
      from public.proposal_line_items existing
      where existing.proposal_id = target_proposal_id
        and existing.recommendation_id = recommendation.id
    );

  get diagnostics imported_count = row_count;
  if imported_count > 0 then
    update public.job_proposals
    set
      status = case when status in ('approved', 'sent', 'signed') then 'draft' else status end,
      approved_by = case when status in ('approved', 'sent', 'signed') then null else approved_by end,
      approved_at = case when status in ('approved', 'sent', 'signed') then null else approved_at end
    where id = target_proposal_id;
  end if;
  perform public.recalculate_job_proposal_totals(target_proposal_id);
  return imported_count;
end;
$$;

create or replace function public.save_proposal_line_item(
  target_organization_id uuid,
  target_job_id uuid,
  target_proposal_id uuid,
  target_line_id uuid,
  line_title text,
  line_description text,
  line_section text,
  line_quantity numeric,
  line_unit_price numeric,
  line_included boolean
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  saved_line_id uuid;
  next_sort_order integer;
begin
  if not public.is_organization_member(target_organization_id) then
    raise exception 'Active organization membership required';
  end if;

  if not exists (
    select 1 from public.job_proposals
    where id = target_proposal_id
      and inspection_job_id = target_job_id
      and organization_id = target_organization_id
  ) then
    raise exception 'Proposal not found';
  end if;

  if nullif(trim(line_title), '') is null then
    raise exception 'Line title is required';
  end if;
  if coalesce(line_quantity, 0) <= 0 then
    raise exception 'Quantity must be greater than zero';
  end if;
  if coalesce(line_unit_price, 0) < 0 then
    raise exception 'Unit price cannot be negative';
  end if;

  if target_line_id is null then
    select coalesce(max(sort_order), -1) + 1 into next_sort_order
    from public.proposal_line_items
    where proposal_id = target_proposal_id;

    insert into public.proposal_line_items (
      organization_id,
      proposal_id,
      inspection_job_id,
      source_type,
      section,
      title,
      description,
      quantity,
      unit_price,
      included,
      sort_order,
      created_by
    )
    values (
      target_organization_id,
      target_proposal_id,
      target_job_id,
      'manual',
      coalesce(line_section, 'manual'),
      trim(line_title),
      nullif(trim(coalesce(line_description, '')), ''),
      line_quantity,
      line_unit_price,
      coalesce(line_included, true),
      next_sort_order,
      auth.uid()
    )
    returning id into saved_line_id;
  else
    update public.proposal_line_items
    set
      title = trim(line_title),
      description = nullif(trim(coalesce(line_description, '')), ''),
      section = coalesce(line_section, 'manual'),
      quantity = line_quantity,
      unit_price = line_unit_price,
      included = coalesce(line_included, true)
    where id = target_line_id
      and proposal_id = target_proposal_id
      and inspection_job_id = target_job_id
      and organization_id = target_organization_id
    returning id into saved_line_id;

    if saved_line_id is null then
      raise exception 'Line item not found';
    end if;
  end if;

  update public.job_proposals
  set
    status = case when status in ('approved', 'sent', 'signed') then 'draft' else status end,
    approved_by = case when status in ('approved', 'sent', 'signed') then null else approved_by end,
    approved_at = case when status in ('approved', 'sent', 'signed') then null else approved_at end
  where id = target_proposal_id;

  return saved_line_id;
end;
$$;

create or replace function public.delete_proposal_line_item(
  target_organization_id uuid,
  target_proposal_id uuid,
  target_line_id uuid
)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if not public.is_organization_member(target_organization_id) then
    raise exception 'Active organization membership required';
  end if;

  delete from public.proposal_line_items
  where id = target_line_id
    and proposal_id = target_proposal_id
    and organization_id = target_organization_id;

  if not found then
    raise exception 'Line item not found';
  end if;

  update public.job_proposals
  set
    status = case when status in ('approved', 'sent', 'signed') then 'draft' else status end,
    approved_by = case when status in ('approved', 'sent', 'signed') then null else approved_by end,
    approved_at = case when status in ('approved', 'sent', 'signed') then null else approved_at end
  where id = target_proposal_id;
end;
$$;

create or replace function public.update_job_proposal_settings(
  target_organization_id uuid,
  target_job_id uuid,
  target_proposal_id uuid,
  proposal_title text,
  proposal_customer_note text,
  proposal_terms text,
  proposal_tax_rate numeric,
  proposal_discount_amount numeric
)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if not public.is_organization_member(target_organization_id) then
    raise exception 'Active organization membership required';
  end if;

  update public.job_proposals
  set
    title = coalesce(nullif(trim(proposal_title), ''), title),
    customer_note = nullif(trim(coalesce(proposal_customer_note, '')), ''),
    terms = nullif(trim(coalesce(proposal_terms, '')), ''),
    tax_rate = greatest(coalesce(proposal_tax_rate, 0), 0),
    discount_amount = greatest(coalesce(proposal_discount_amount, 0), 0),
    status = case when status in ('approved', 'sent', 'signed') then 'draft' else status end,
    approved_by = case when status in ('approved', 'sent', 'signed') then null else approved_by end,
    approved_at = case when status in ('approved', 'sent', 'signed') then null else approved_at end
  where id = target_proposal_id
    and inspection_job_id = target_job_id
    and organization_id = target_organization_id;

  if not found then
    raise exception 'Proposal not found';
  end if;

  perform public.recalculate_job_proposal_totals(target_proposal_id);
end;
$$;

create or replace function public.set_job_proposal_status(
  target_organization_id uuid,
  target_job_id uuid,
  target_proposal_id uuid,
  next_status text
)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if not public.has_organization_role(
    target_organization_id,
    array['administrator', 'manager', 'office_coordinator']::public.membership_role[]
  ) then
    raise exception 'You do not have permission to update proposal status.';
  end if;

  if next_status not in ('draft', 'ready', 'approved', 'sent', 'signed', 'void') then
    raise exception 'Invalid proposal status';
  end if;

  if next_status in ('ready', 'approved') and not exists (
    select 1
    from public.proposal_line_items
    where proposal_id = target_proposal_id
      and included = true
  ) then
    raise exception 'Add at least one included line item before marking this proposal ready.';
  end if;

  update public.job_proposals
  set
    status = next_status,
    approved_by = case when next_status = 'approved' then auth.uid() else approved_by end,
    approved_at = case when next_status = 'approved' then now() else approved_at end
  where id = target_proposal_id
    and inspection_job_id = target_job_id
    and organization_id = target_organization_id;

  if not found then
    raise exception 'Proposal not found';
  end if;

  insert into public.audit_events (
    organization_id,
    actor_user_id,
    action,
    entity_type,
    entity_id,
    summary,
    changes
  )
  values (
    target_organization_id,
    auth.uid(),
    'proposal_status_updated',
    'job_proposal',
    target_proposal_id,
    'Proposal status changed to ' || next_status || '.',
    jsonb_build_object('status', next_status)
  );
end;
$$;

create or replace function public.begin_proposal_document_version(
  target_organization_id uuid,
  target_job_id uuid,
  target_proposal_id uuid,
  proposal_snapshot jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  proposal_document_id uuid;
  proposal_version_id uuid;
  next_version integer;
  report_job_number bigint;
begin
  if not public.has_organization_role(
    target_organization_id,
    array['administrator', 'manager', 'office_coordinator']::public.membership_role[]
  ) then
    raise exception 'You do not have permission to generate proposal documents.';
  end if;

  select job.job_number into report_job_number
  from public.inspection_jobs job
  join public.job_proposals proposal on proposal.inspection_job_id = job.id
  where job.id = target_job_id
    and job.organization_id = target_organization_id
    and proposal.id = target_proposal_id
    and proposal.status = 'approved';

  if report_job_number is null then
    raise exception 'Approve the proposal before generating the contract document.';
  end if;

  perform pg_advisory_xact_lock(hashtext(target_job_id::text || ':proposal-document'));

  insert into public.documents (
    organization_id,
    inspection_job_id,
    kind,
    title
  )
  values (
    target_organization_id,
    target_job_id,
    'proposal',
    'Proposal and Work Authorization #' || report_job_number
  )
  on conflict (inspection_job_id, kind) do update set
    title = excluded.title
  returning id into proposal_document_id;

  select coalesce(max(version), 0) + 1 into next_version
  from public.document_versions
  where document_id = proposal_document_id;

  insert into public.document_versions (
    organization_id,
    document_id,
    version,
    status,
    approval_status,
    snapshot,
    generated_by
  )
  values (
    target_organization_id,
    proposal_document_id,
    next_version,
    'generating',
    'pending',
    coalesce(proposal_snapshot, '{}'::jsonb),
    auth.uid()
  )
  returning id into proposal_version_id;

  insert into public.audit_events (
    organization_id,
    actor_user_id,
    action,
    entity_type,
    entity_id,
    summary,
    changes
  )
  values (
    target_organization_id,
    auth.uid(),
    'proposal_document_generation_started',
    'document_version',
    proposal_version_id,
    'Proposal document version ' || next_version || ' generation started.',
    jsonb_build_object('jobId', target_job_id, 'proposalId', target_proposal_id, 'version', next_version)
  );

  return jsonb_build_object(
    'documentId', proposal_document_id,
    'versionId', proposal_version_id,
    'version', next_version
  );
end;
$$;

create or replace function public.complete_proposal_document_version(
  target_organization_id uuid,
  target_job_id uuid,
  target_version_id uuid,
  storage_path text,
  original_name text,
  file_size bigint,
  file_checksum text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  proposal_asset_id uuid;
begin
  if not public.is_organization_member(target_organization_id) then
    raise exception 'You do not have access to this organization.';
  end if;

  if not exists (
    select 1
    from public.document_versions version_row
    join public.documents document_row on document_row.id = version_row.document_id
    where version_row.id = target_version_id
      and version_row.organization_id = target_organization_id
      and document_row.inspection_job_id = target_job_id
      and document_row.kind = 'proposal'
  ) then
    raise exception 'Proposal document version was not found.';
  end if;

  insert into public.assets (
    organization_id,
    inspection_job_id,
    kind,
    storage_provider,
    provider_file_id,
    original_filename,
    content_type,
    size_bytes,
    checksum_sha256,
    status,
    created_by,
    metadata
  )
  values (
    target_organization_id,
    target_job_id,
    'contract_pdf',
    'supabase',
    storage_path,
    original_name,
    'application/pdf',
    file_size,
    file_checksum,
    'ready',
    auth.uid(),
    jsonb_build_object('documentVersionId', target_version_id, 'source', 'proposal')
  )
  returning id into proposal_asset_id;

  update public.document_versions
  set
    status = 'ready',
    approval_status = 'approved',
    asset_id = proposal_asset_id,
    checksum_sha256 = file_checksum,
    generated_at = now(),
    failure_message = null
  where id = target_version_id;

  insert into public.audit_events (
    organization_id,
    actor_user_id,
    action,
    entity_type,
    entity_id,
    summary,
    changes
  )
  values (
    target_organization_id,
    auth.uid(),
    'proposal_document_generated',
    'document_version',
    target_version_id,
    'Proposal and contract PDF generated.',
    jsonb_build_object('assetId', proposal_asset_id, 'storagePath', storage_path)
  );

  return proposal_asset_id;
end;
$$;

create or replace function public.fail_proposal_document_version(
  target_organization_id uuid,
  target_version_id uuid,
  failure_text text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_organization_member(target_organization_id) then
    raise exception 'You do not have access to this organization.';
  end if;

  update public.document_versions
  set status = 'failed', failure_message = left(coalesce(failure_text, 'Proposal document generation failed.'), 2000)
  where id = target_version_id and organization_id = target_organization_id;
end;
$$;

grant execute on function public.ensure_job_proposal(uuid, uuid) to authenticated;
grant execute on function public.import_proposal_lines_from_findings(uuid, uuid, uuid) to authenticated;
grant execute on function public.save_proposal_line_item(uuid, uuid, uuid, uuid, text, text, text, numeric, numeric, boolean) to authenticated;
grant execute on function public.delete_proposal_line_item(uuid, uuid, uuid) to authenticated;
grant execute on function public.update_job_proposal_settings(uuid, uuid, uuid, text, text, text, numeric, numeric) to authenticated;
grant execute on function public.set_job_proposal_status(uuid, uuid, uuid, text) to authenticated;
grant execute on function public.begin_proposal_document_version(uuid, uuid, uuid, jsonb) to authenticated;
grant execute on function public.complete_proposal_document_version(uuid, uuid, uuid, text, text, bigint, text) to authenticated;
grant execute on function public.fail_proposal_document_version(uuid, uuid, text) to authenticated;
