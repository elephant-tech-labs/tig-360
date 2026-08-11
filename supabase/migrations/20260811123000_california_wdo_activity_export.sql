begin;

-- California WDO regulatory activities are independent of inspection PDF versions.
-- Export batches retain immutable snapshots so later source-data edits cannot change history.

create table public.wdo_branches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  registration_number text,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id)
);

create unique index wdo_branches_org_name_unique
on public.wdo_branches (organization_id, lower(name));

create index wdo_branches_created_by_idx
on public.wdo_branches (created_by);

create unique index if not exists inspection_jobs_org_id_unique
on public.inspection_jobs (organization_id, id);

create unique index if not exists properties_org_id_unique
on public.properties (organization_id, id);

create unique index if not exists document_versions_org_id_unique
on public.document_versions (organization_id, id);

create table public.wdo_activities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  inspection_job_id uuid,
  report_version_id uuid,
  property_id uuid not null,
  activity_date date,
  activity_date_source text not null default 'derived'
    check (activity_date_source in ('derived', 'manual')),
  activity_code smallint check (activity_code between 1 and 7),
  activity_code_source text not null default 'derived'
    check (activity_code_source in ('derived', 'manual')),
  inspector_id uuid,
  inspector_source text not null default 'derived'
    check (inspector_source in ('derived', 'manual')),
  branch_id uuid,
  status text not null default 'active'
    check (status in ('active', 'voided')),
  source_type text not null
    check (source_type in (
      'inspection_job',
      'manual',
      'work_completion',
      'corrected_activity',
      'separated_report',
      'import'
    )),
  source_id uuid,
  source_key text not null check (length(trim(source_key)) > 0),
  override_building_number text,
  override_street text,
  override_city text,
  override_zip_code text,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, source_key),
  foreign key (organization_id, inspection_job_id)
    references public.inspection_jobs(organization_id, id) on delete restrict,
  foreign key (organization_id, report_version_id)
    references public.document_versions(organization_id, id) on delete restrict,
  foreign key (organization_id, property_id)
    references public.properties(organization_id, id) on delete restrict,
  foreign key (organization_id, inspector_id)
    references public.inspectors(organization_id, id) on delete restrict,
  foreign key (organization_id, branch_id)
    references public.wdo_branches(organization_id, id) on delete restrict
);

create index wdo_activities_org_date_idx
on public.wdo_activities (organization_id, activity_date desc, id);

create index wdo_activities_org_status_date_idx
on public.wdo_activities (organization_id, status, activity_date desc);

create index wdo_activities_org_branch_date_idx
on public.wdo_activities (organization_id, branch_id, activity_date desc);

create index wdo_activities_job_idx on public.wdo_activities (inspection_job_id);
create index wdo_activities_report_version_idx on public.wdo_activities (report_version_id);
create index wdo_activities_property_idx on public.wdo_activities (property_id);
create index wdo_activities_inspector_idx on public.wdo_activities (inspector_id);
create index wdo_activities_branch_idx on public.wdo_activities (branch_id);
create index wdo_activities_created_by_idx on public.wdo_activities (created_by);

create table public.wdo_export_batches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  generated_at timestamptz not null default now(),
  created_by uuid not null references public.profiles(id) on delete restrict,
  date_from date,
  date_to date,
  branch_id uuid,
  number_of_activities integer not null check (number_of_activities > 0),
  filename text not null check (length(trim(filename)) > 0),
  status text not null default 'generated'
    check (status in ('generated', 'filed')),
  serializer_version text not null check (length(trim(serializer_version)) > 0),
  file_checksum_sha256 text not null
    check (file_checksum_sha256 ~ '^[0-9a-f]{64}$'),
  idempotency_key text not null check (length(trim(idempotency_key)) >= 16),
  reexport_reason text,
  submitted_on date,
  filed_at timestamptz,
  submitted_by uuid references public.profiles(id) on delete set null,
  spcb_submittal_number text,
  submission_notes text,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, idempotency_key),
  foreign key (organization_id, branch_id)
    references public.wdo_branches(organization_id, id) on delete restrict,
  check (date_from is null or date_to is null or date_from <= date_to),
  check (
    (status = 'generated' and submitted_on is null and filed_at is null and submitted_by is null)
    or
    (status = 'filed' and submitted_on is not null and filed_at is not null
      and submitted_by is not null and nullif(trim(spcb_submittal_number), '') is not null)
  )
);

create index wdo_export_batches_org_generated_idx
on public.wdo_export_batches (organization_id, generated_at desc);

create index wdo_export_batches_org_status_generated_idx
on public.wdo_export_batches (organization_id, status, generated_at desc);

create index wdo_export_batches_branch_idx on public.wdo_export_batches (branch_id);
create index wdo_export_batches_created_by_idx on public.wdo_export_batches (created_by);
create index wdo_export_batches_submitted_by_idx on public.wdo_export_batches (submitted_by);

create table public.wdo_export_batch_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  export_batch_id uuid not null,
  wdo_activity_id uuid not null,
  line_number integer not null check (line_number > 0),
  normalized_record jsonb not null check (jsonb_typeof(normalized_record) = 'object'),
  serializer_version text not null check (length(trim(serializer_version)) > 0),
  created_at timestamptz not null default now(),
  unique (export_batch_id, wdo_activity_id),
  unique (export_batch_id, line_number),
  foreign key (organization_id, export_batch_id)
    references public.wdo_export_batches(organization_id, id) on delete restrict,
  foreign key (organization_id, wdo_activity_id)
    references public.wdo_activities(organization_id, id) on delete restrict
);

create index wdo_export_batch_items_batch_idx
on public.wdo_export_batch_items (export_batch_id, line_number);

create index wdo_export_batch_items_activity_idx
on public.wdo_export_batch_items (wdo_activity_id, created_at desc);

create index wdo_export_batch_items_org_idx
on public.wdo_export_batch_items (organization_id);

create or replace function public.wdo_activity_code_for_report_type(report_type_name text)
returns smallint
language sql
immutable
strict
set search_path = ''
as $$
  select case report_type_name
    when 'complete' then 1::smallint
    when 'limited' then 2::smallint
    when 'supplemental' then 3::smallint
    when 'reinspection' then 4::smallint
    else null::smallint
  end;
$$;

create or replace function public.sync_wdo_inspection_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  organization_timezone text;
  derived_activity_date date;
  derived_activity_code smallint;
begin
  select organization.timezone
  into organization_timezone
  from public.organizations organization
  where organization.id = new.organization_id;

  derived_activity_date := case
    when new.inspection_at is null then null
    else (new.inspection_at at time zone coalesce(organization_timezone, 'America/Los_Angeles'))::date
  end;
  derived_activity_code := public.wdo_activity_code_for_report_type(new.report_type);

  if derived_activity_code is null then
    return new;
  end if;

  insert into public.wdo_activities (
    organization_id,
    inspection_job_id,
    property_id,
    activity_date,
    activity_date_source,
    activity_code,
    activity_code_source,
    inspector_id,
    inspector_source,
    source_type,
    source_id,
    source_key,
    created_by,
    updated_by
  )
  values (
    new.organization_id,
    new.id,
    new.property_id,
    derived_activity_date,
    'derived',
    derived_activity_code,
    'derived',
    new.inspected_by_id,
    'derived',
    'inspection_job',
    new.id,
    'inspection_job:' || new.id::text,
    new.created_by,
    new.created_by
  )
  on conflict (organization_id, source_key) do update set
    inspection_job_id = excluded.inspection_job_id,
    property_id = excluded.property_id,
    activity_date = case
      when public.wdo_activities.activity_date_source = 'derived' then excluded.activity_date
      else public.wdo_activities.activity_date
    end,
    activity_code = case
      when public.wdo_activities.activity_code_source = 'derived' then excluded.activity_code
      else public.wdo_activities.activity_code
    end,
    inspector_id = case
      when public.wdo_activities.inspector_source = 'derived' then excluded.inspector_id
      else public.wdo_activities.inspector_id
    end,
    updated_at = now();

  return new;
end;
$$;

drop trigger if exists inspection_jobs_sync_wdo_activity on public.inspection_jobs;
create trigger inspection_jobs_sync_wdo_activity
after insert or update of report_type, inspection_at, property_id, inspected_by_id
on public.inspection_jobs
for each row execute procedure public.sync_wdo_inspection_activity();

drop trigger if exists wdo_branches_set_updated_at on public.wdo_branches;
create trigger wdo_branches_set_updated_at
before update on public.wdo_branches
for each row execute procedure public.set_updated_at();

drop trigger if exists wdo_activities_set_updated_at on public.wdo_activities;
create trigger wdo_activities_set_updated_at
before update on public.wdo_activities
for each row execute procedure public.set_updated_at();

create or replace function public.protect_wdo_export_batch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'WDO export batches cannot be deleted.';
  end if;

  if new.organization_id is distinct from old.organization_id
     or new.generated_at is distinct from old.generated_at
     or new.created_by is distinct from old.created_by
     or new.date_from is distinct from old.date_from
     or new.date_to is distinct from old.date_to
     or new.branch_id is distinct from old.branch_id
     or new.number_of_activities is distinct from old.number_of_activities
     or new.filename is distinct from old.filename
     or new.serializer_version is distinct from old.serializer_version
     or new.file_checksum_sha256 is distinct from old.file_checksum_sha256
     or new.idempotency_key is distinct from old.idempotency_key
     or new.reexport_reason is distinct from old.reexport_reason
     or new.created_at is distinct from old.created_at then
    raise exception 'Generated WDO batch history is immutable.';
  end if;

  return new;
end;
$$;

create trigger wdo_export_batches_protect_history
before update or delete on public.wdo_export_batches
for each row execute procedure public.protect_wdo_export_batch();

create or replace function public.protect_wdo_export_batch_item()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'WDO export batch items are immutable.';
end;
$$;

create trigger wdo_export_batch_items_protect_history
before update or delete on public.wdo_export_batch_items
for each row execute procedure public.protect_wdo_export_batch_item();

alter table public.wdo_branches enable row level security;
alter table public.wdo_activities enable row level security;
alter table public.wdo_export_batches enable row level security;
alter table public.wdo_export_batch_items enable row level security;

revoke all on public.wdo_branches from public, anon, authenticated;
revoke all on public.wdo_activities from public, anon, authenticated;
revoke all on public.wdo_export_batches from public, anon, authenticated;
revoke all on public.wdo_export_batch_items from public, anon, authenticated;

create policy wdo_branches_compliance_select on public.wdo_branches
for select to authenticated
using (public.has_organization_role(
  organization_id,
  array['administrator', 'manager', 'office_coordinator']::public.membership_role[]
));

create policy wdo_branches_manager_insert on public.wdo_branches
for insert to authenticated
with check (public.has_organization_role(
  organization_id,
  array['administrator', 'manager']::public.membership_role[]
));

create policy wdo_branches_manager_update on public.wdo_branches
for update to authenticated
using (public.has_organization_role(
  organization_id,
  array['administrator', 'manager']::public.membership_role[]
))
with check (public.has_organization_role(
  organization_id,
  array['administrator', 'manager']::public.membership_role[]
));

create policy wdo_activities_compliance_select on public.wdo_activities
for select to authenticated
using (public.has_organization_role(
  organization_id,
  array['administrator', 'manager', 'office_coordinator']::public.membership_role[]
));

create policy wdo_export_batches_compliance_select on public.wdo_export_batches
for select to authenticated
using (public.has_organization_role(
  organization_id,
  array['administrator', 'manager', 'office_coordinator']::public.membership_role[]
));

create policy wdo_export_batch_items_compliance_select on public.wdo_export_batch_items
for select to authenticated
using (public.has_organization_role(
  organization_id,
  array['administrator', 'manager', 'office_coordinator']::public.membership_role[]
));

grant select, insert, update on public.wdo_branches to authenticated;
grant select on public.wdo_activities to authenticated;
grant select on public.wdo_export_batches to authenticated;
grant select on public.wdo_export_batch_items to authenticated;

create or replace function public.reconcile_wdo_inspection_activities(
  target_organization_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  jobs_examined integer;
  already_existing integer;
  activities_created integer;
  needs_attention integer;
begin
  if not public.has_organization_role(
    target_organization_id,
    array['administrator', 'manager', 'office_coordinator']::public.membership_role[]
  ) then
    raise exception 'WDO compliance access required.';
  end if;

  perform pg_advisory_xact_lock(hashtext(target_organization_id::text || ':wdo-reconcile'));

  select count(*) into jobs_examined
  from public.inspection_jobs job
  where job.organization_id = target_organization_id
    and public.wdo_activity_code_for_report_type(job.report_type) is not null;

  select count(*) into already_existing
  from public.inspection_jobs job
  join public.wdo_activities activity
    on activity.organization_id = job.organization_id
   and activity.source_key = 'inspection_job:' || job.id::text
  where job.organization_id = target_organization_id
    and public.wdo_activity_code_for_report_type(job.report_type) is not null;

  insert into public.wdo_activities (
    organization_id,
    inspection_job_id,
    property_id,
    activity_date,
    activity_date_source,
    activity_code,
    activity_code_source,
    inspector_id,
    inspector_source,
    source_type,
    source_id,
    source_key,
    created_by,
    updated_by
  )
  select
    job.organization_id,
    job.id,
    job.property_id,
    case
      when job.inspection_at is null then null
      else (job.inspection_at at time zone organization.timezone)::date
    end,
    'derived',
    public.wdo_activity_code_for_report_type(job.report_type),
    'derived',
    job.inspected_by_id,
    'derived',
    'inspection_job',
    job.id,
    'inspection_job:' || job.id::text,
    job.created_by,
    (select auth.uid())
  from public.inspection_jobs job
  join public.organizations organization on organization.id = job.organization_id
  where job.organization_id = target_organization_id
    and public.wdo_activity_code_for_report_type(job.report_type) is not null
  on conflict (organization_id, source_key) do update set
    inspection_job_id = excluded.inspection_job_id,
    property_id = excluded.property_id,
    activity_date = case
      when public.wdo_activities.activity_date_source = 'derived' then excluded.activity_date
      else public.wdo_activities.activity_date
    end,
    activity_code = case
      when public.wdo_activities.activity_code_source = 'derived' then excluded.activity_code
      else public.wdo_activities.activity_code
    end,
    inspector_id = case
      when public.wdo_activities.inspector_source = 'derived' then excluded.inspector_id
      else public.wdo_activities.inspector_id
    end,
    updated_by = (select auth.uid()),
    updated_at = now();

  activities_created := greatest(jobs_examined - already_existing, 0);

  select count(*) into needs_attention
  from public.wdo_activities activity
  join public.properties property on property.id = activity.property_id
  left join public.inspectors inspector on inspector.id = activity.inspector_id
  left join public.organization_report_profiles profile
    on profile.organization_id = activity.organization_id
  where activity.organization_id = target_organization_id
    and activity.status = 'active'
    and (
      activity.activity_date is null
      or activity.activity_code is null
      or nullif(trim(coalesce(profile.legal_name, '')), '') is null
      or nullif(trim(coalesce(profile.registration_number, '')), '') is null
      or nullif(trim(coalesce(inspector.license_number, '')), '') is null
      or nullif(trim(property.street_line_1), '') is null
      or property.street_line_1 !~ '^\s*[0-9][A-Za-z0-9-]*\s+\S'
      or nullif(trim(property.city), '') is null
      or nullif(trim(property.postal_code), '') is null
    );

  insert into public.audit_events (
    organization_id,
    actor_user_id,
    action,
    entity_type,
    summary,
    changes
  )
  values (
    target_organization_id,
    (select auth.uid()),
    'wdo_activities_reconciled',
    'wdo_activity',
    'Existing inspection jobs reconciled with the WDO activity queue.',
    jsonb_build_object(
      'jobsExamined', jobs_examined,
      'activitiesCreated', activities_created,
      'alreadyExisting', already_existing,
      'needsAttention', needs_attention,
      'skipped', 0
    )
  );

  return jsonb_build_object(
    'jobsExamined', jobs_examined,
    'activitiesCreated', activities_created,
    'alreadyExisting', already_existing,
    'needsAttention', needs_attention,
    'skipped', 0,
    'skipReasons', '[]'::jsonb
  );
end;
$$;

create or replace function public.create_wdo_activity(
  target_organization_id uuid,
  target_job_id uuid,
  regulatory_activity_date date,
  regulatory_activity_code smallint,
  regulatory_inspector_id uuid,
  regulatory_branch_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  activity_property_id uuid;
  new_activity_id uuid := gen_random_uuid();
begin
  if not public.has_organization_role(
    target_organization_id,
    array['administrator', 'manager', 'office_coordinator']::public.membership_role[]
  ) then
    raise exception 'WDO compliance access required.';
  end if;

  if regulatory_activity_code is null or regulatory_activity_code not between 1 and 7 then
    raise exception 'Choose a recognized WDO activity type.';
  end if;

  select job.property_id into activity_property_id
  from public.inspection_jobs job
  where job.id = target_job_id
    and job.organization_id = target_organization_id;

  if activity_property_id is null then
    raise exception 'Inspection job not found.';
  end if;

  if regulatory_inspector_id is not null and not exists (
    select 1 from public.inspectors inspector
    where inspector.id = regulatory_inspector_id
      and inspector.organization_id = target_organization_id
  ) then
    raise exception 'Inspector not found.';
  end if;

  if regulatory_branch_id is not null and not exists (
    select 1 from public.wdo_branches branch
    where branch.id = regulatory_branch_id
      and branch.organization_id = target_organization_id
      and branch.is_active
  ) then
    raise exception 'Active WDO branch not found.';
  end if;

  insert into public.wdo_activities (
    id,
    organization_id,
    inspection_job_id,
    property_id,
    activity_date,
    activity_date_source,
    activity_code,
    activity_code_source,
    inspector_id,
    inspector_source,
    branch_id,
    source_type,
    source_key,
    created_by,
    updated_by
  )
  values (
    new_activity_id,
    target_organization_id,
    target_job_id,
    activity_property_id,
    regulatory_activity_date,
    'manual',
    regulatory_activity_code,
    'manual',
    regulatory_inspector_id,
    'manual',
    regulatory_branch_id,
    case regulatory_activity_code
      when 5 then 'work_completion'
      when 6 then 'corrected_activity'
      when 7 then 'separated_report'
      else 'manual'
    end,
    'manual:' || new_activity_id::text,
    (select auth.uid()),
    (select auth.uid())
  );

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
    (select auth.uid()),
    'wdo_activity_created',
    'wdo_activity',
    new_activity_id,
    'WDO regulatory activity created.',
    jsonb_build_object('jobId', target_job_id, 'activityCode', regulatory_activity_code)
  );

  return new_activity_id;
end;
$$;

create or replace function public.update_wdo_activity(
  target_organization_id uuid,
  target_activity_id uuid,
  regulatory_activity_date date,
  regulatory_activity_code smallint,
  regulatory_inspector_id uuid,
  regulatory_branch_id uuid,
  regulatory_building_number text,
  regulatory_street text,
  regulatory_city text,
  regulatory_zip_code text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.has_organization_role(
    target_organization_id,
    array['administrator', 'manager', 'office_coordinator']::public.membership_role[]
  ) then
    raise exception 'WDO compliance access required.';
  end if;

  if regulatory_activity_code is null or regulatory_activity_code not between 1 and 7 then
    raise exception 'Choose a recognized WDO activity type.';
  end if;

  if regulatory_inspector_id is not null and not exists (
    select 1 from public.inspectors inspector
    where inspector.id = regulatory_inspector_id
      and inspector.organization_id = target_organization_id
  ) then
    raise exception 'Inspector not found.';
  end if;

  if regulatory_branch_id is not null and not exists (
    select 1 from public.wdo_branches branch
    where branch.id = regulatory_branch_id
      and branch.organization_id = target_organization_id
      and branch.is_active
  ) then
    raise exception 'Active WDO branch not found.';
  end if;

  update public.wdo_activities
  set
    activity_date = regulatory_activity_date,
    activity_date_source = 'manual',
    activity_code = regulatory_activity_code,
    activity_code_source = 'manual',
    inspector_id = regulatory_inspector_id,
    inspector_source = 'manual',
    branch_id = regulatory_branch_id,
    override_building_number = nullif(trim(regulatory_building_number), ''),
    override_street = nullif(regexp_replace(trim(regulatory_street), '\s+', ' ', 'g'), ''),
    override_city = nullif(regexp_replace(trim(regulatory_city), '\s+', ' ', 'g'), ''),
    override_zip_code = nullif(trim(regulatory_zip_code), ''),
    updated_by = (select auth.uid())
  where id = target_activity_id
    and organization_id = target_organization_id
    and status = 'active';

  if not found then
    raise exception 'Active WDO activity not found.';
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
    (select auth.uid()),
    'wdo_activity_updated',
    'wdo_activity',
    target_activity_id,
    'WDO regulatory activity updated.',
    jsonb_build_object('activityCode', regulatory_activity_code)
  );
end;
$$;

create or replace function public.create_wdo_export_batch(
  target_organization_id uuid,
  export_date_from date,
  export_date_to date,
  export_branch_id uuid,
  export_filename text,
  export_serializer_version text,
  export_checksum_sha256 text,
  export_idempotency_key text,
  export_items jsonb,
  export_reexport_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_batch_id uuid;
  existing_batch record;
  item_count integer;
  selected_activity_count integer;
  prior_export_count integer;
begin
  if not public.has_organization_role(
    target_organization_id,
    array['administrator', 'manager', 'office_coordinator']::public.membership_role[]
  ) then
    raise exception 'WDO compliance access required.';
  end if;

  if jsonb_typeof(export_items) <> 'array' then
    raise exception 'Export items must be an array.';
  end if;

  item_count := jsonb_array_length(export_items);
  if item_count < 1 or item_count > 5000 then
    raise exception 'Select between 1 and 5,000 WDO activities.';
  end if;

  if export_date_from is not null and export_date_to is not null
     and export_date_from > export_date_to then
    raise exception 'Activity Date From must be on or before Activity Date To.';
  end if;

  if nullif(trim(export_filename), '') is null
     or trim(export_filename) !~ '^[A-Za-z0-9_.-]+\.(TXT|txt)$' then
    raise exception 'Invalid WDO export filename.';
  end if;

  if nullif(trim(export_serializer_version), '') is null then
    raise exception 'Serializer version is required.';
  end if;

  if lower(trim(export_checksum_sha256)) !~ '^[0-9a-f]{64}$' then
    raise exception 'A valid SHA-256 checksum is required.';
  end if;

  if length(trim(coalesce(export_idempotency_key, ''))) < 16 then
    raise exception 'A valid idempotency key is required.';
  end if;

  if export_branch_id is not null then
    raise exception 'Branch-office TXT format requires verification before generation.';
  end if;

  perform pg_advisory_xact_lock(
    hashtext(target_organization_id::text || ':wdo-export:' || trim(export_idempotency_key))
  );

  select batch.id, batch.file_checksum_sha256
  into existing_batch
  from public.wdo_export_batches batch
  where batch.organization_id = target_organization_id
    and batch.idempotency_key = trim(export_idempotency_key);

  if found then
    if existing_batch.file_checksum_sha256 <> lower(trim(export_checksum_sha256)) then
      raise exception 'This export request was already used for different file content.';
    end if;
    return existing_batch.id;
  end if;

  if exists (
    select 1
    from jsonb_array_elements(export_items) item
    where nullif(item->>'activityId', '') is null
      or jsonb_typeof(item->'normalizedRecord') <> 'object'
  ) then
    raise exception 'Every export item requires an activity and normalized record.';
  end if;

  select count(distinct activity.id)
  into selected_activity_count
  from public.wdo_activities activity
  join (
    select (item->>'activityId')::uuid as activity_id
    from jsonb_array_elements(export_items) item
  ) selected on selected.activity_id = activity.id
  where activity.organization_id = target_organization_id
    and activity.status = 'active';

  if selected_activity_count <> item_count then
    raise exception 'One or more selected WDO activities are invalid or duplicated.';
  end if;

  if exists (
    select 1
    from public.wdo_activities activity
    join (
      select (item->>'activityId')::uuid as activity_id
      from jsonb_array_elements(export_items) item
    ) selected on selected.activity_id = activity.id
    where activity.organization_id = target_organization_id
      and activity.branch_id is not null
  ) then
    raise exception 'Branch-office TXT format requires verification before generation.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(export_items) item
    where not (
      (item->'normalizedRecord') ?& array[
        'companyName',
        'registrationNumber',
        'activityDate',
        'buildingNumber',
        'street',
        'city',
        'zipCode',
        'inspectorLicenseNumber',
        'activityCode'
      ]
    )
  ) then
    raise exception 'A normalized WDO export record is incomplete.';
  end if;

  select count(*)
  into prior_export_count
  from public.wdo_export_batch_items prior_item
  join public.wdo_export_batches prior_batch
    on prior_batch.id = prior_item.export_batch_id
   and prior_batch.organization_id = prior_item.organization_id
  join (
    select (item->>'activityId')::uuid as activity_id
    from jsonb_array_elements(export_items) item
  ) selected on selected.activity_id = prior_item.wdo_activity_id
  where prior_item.organization_id = target_organization_id;

  if prior_export_count > 0 and nullif(trim(coalesce(export_reexport_reason, '')), '') is null then
    raise exception 'A re-export reason is required for previously generated activities.';
  end if;

  insert into public.wdo_export_batches (
    organization_id,
    created_by,
    date_from,
    date_to,
    branch_id,
    number_of_activities,
    filename,
    serializer_version,
    file_checksum_sha256,
    idempotency_key,
    reexport_reason
  )
  values (
    target_organization_id,
    (select auth.uid()),
    export_date_from,
    export_date_to,
    export_branch_id,
    item_count,
    trim(export_filename),
    trim(export_serializer_version),
    lower(trim(export_checksum_sha256)),
    trim(export_idempotency_key),
    nullif(trim(export_reexport_reason), '')
  )
  returning id into new_batch_id;

  insert into public.wdo_export_batch_items (
    organization_id,
    export_batch_id,
    wdo_activity_id,
    line_number,
    normalized_record,
    serializer_version
  )
  select
    target_organization_id,
    new_batch_id,
    (item.value->>'activityId')::uuid,
    item.ordinality::integer,
    item.value->'normalizedRecord',
    trim(export_serializer_version)
  from jsonb_array_elements(export_items) with ordinality item(value, ordinality);

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
    (select auth.uid()),
    'wdo_export_generated',
    'wdo_export_batch',
    new_batch_id,
    'California WDO TXT export generated.',
    jsonb_build_object(
      'filename', trim(export_filename),
      'activityCount', item_count,
      'serializerVersion', trim(export_serializer_version),
      'checksumSha256', lower(trim(export_checksum_sha256)),
      'priorExportReferences', prior_export_count
    )
  );

  return new_batch_id;
end;
$$;

create or replace function public.mark_wdo_export_batch_filed(
  target_organization_id uuid,
  target_batch_id uuid,
  filing_submitted_on date,
  filing_submittal_number text,
  filing_notes text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.has_organization_role(
    target_organization_id,
    array['administrator', 'manager', 'office_coordinator']::public.membership_role[]
  ) then
    raise exception 'WDO compliance access required.';
  end if;

  if filing_submitted_on is null then
    raise exception 'SPCB submitted date is required.';
  end if;

  if nullif(trim(filing_submittal_number), '') is null then
    raise exception 'SPCB submittal number is required.';
  end if;

  update public.wdo_export_batches
  set
    status = 'filed',
    submitted_on = filing_submitted_on,
    filed_at = now(),
    submitted_by = (select auth.uid()),
    spcb_submittal_number = trim(filing_submittal_number),
    submission_notes = nullif(trim(filing_notes), '')
  where id = target_batch_id
    and organization_id = target_organization_id;

  if not found then
    raise exception 'WDO export batch not found.';
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
    (select auth.uid()),
    'wdo_export_filed',
    'wdo_export_batch',
    target_batch_id,
    'WDO export batch marked filed with SPCB.',
    jsonb_build_object(
      'submittedOn', filing_submitted_on,
      'spcbSubmittalNumber', trim(filing_submittal_number)
    )
  );
end;
$$;

-- Backfill existing inspection jobs without tying activity existence to report generation.
insert into public.wdo_activities (
  organization_id,
  inspection_job_id,
  property_id,
  activity_date,
  activity_date_source,
  activity_code,
  activity_code_source,
  inspector_id,
  inspector_source,
  source_type,
  source_id,
  source_key,
  created_by,
  updated_by
)
select
  job.organization_id,
  job.id,
  job.property_id,
  case
    when job.inspection_at is null then null
    else (job.inspection_at at time zone organization.timezone)::date
  end,
  'derived',
  public.wdo_activity_code_for_report_type(job.report_type),
  'derived',
  job.inspected_by_id,
  'derived',
  'inspection_job',
  job.id,
  'inspection_job:' || job.id::text,
  job.created_by,
  job.created_by
from public.inspection_jobs job
join public.organizations organization on organization.id = job.organization_id
where public.wdo_activity_code_for_report_type(job.report_type) is not null
on conflict (organization_id, source_key) do nothing;

revoke all on function public.wdo_activity_code_for_report_type(text) from public, anon, authenticated;
revoke all on function public.sync_wdo_inspection_activity() from public, anon, authenticated;
revoke all on function public.protect_wdo_export_batch() from public, anon, authenticated;
revoke all on function public.protect_wdo_export_batch_item() from public, anon, authenticated;
revoke all on function public.reconcile_wdo_inspection_activities(uuid) from public, anon, authenticated;
revoke all on function public.create_wdo_activity(uuid, uuid, date, smallint, uuid, uuid) from public, anon, authenticated;
revoke all on function public.update_wdo_activity(uuid, uuid, date, smallint, uuid, uuid, text, text, text, text) from public, anon, authenticated;
revoke all on function public.create_wdo_export_batch(uuid, date, date, uuid, text, text, text, text, jsonb, text) from public, anon, authenticated;
revoke all on function public.mark_wdo_export_batch_filed(uuid, uuid, date, text, text) from public, anon, authenticated;

grant execute on function public.reconcile_wdo_inspection_activities(uuid) to authenticated;
grant execute on function public.create_wdo_activity(uuid, uuid, date, smallint, uuid, uuid) to authenticated;
grant execute on function public.update_wdo_activity(uuid, uuid, date, smallint, uuid, uuid, text, text, text, text) to authenticated;
grant execute on function public.create_wdo_export_batch(uuid, date, date, uuid, text, text, text, text, jsonb, text) to authenticated;
grant execute on function public.mark_wdo_export_batch_filed(uuid, uuid, date, text, text) to authenticated;

commit;
