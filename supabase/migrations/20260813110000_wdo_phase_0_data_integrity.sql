begin;

-- Phase 0 moves California WDO source-data integrity upstream while preserving
-- the existing 206-character serializer and immutable export history.

alter table public.inspection_jobs
  add column if not exists wdo_filing_requirement text not null default 'required'
    check (wdo_filing_requirement in ('required', 'not_required')),
  add column if not exists wdo_exclusion_reason text
    check (wdo_exclusion_reason is null or wdo_exclusion_reason in (
      'test_or_training',
      'created_in_error_or_duplicate',
      'inspection_never_commenced',
      'other_non_reportable'
    )),
  add column if not exists wdo_exclusion_notes text,
  add column if not exists wdo_excluded_at timestamptz,
  add column if not exists wdo_excluded_by uuid references public.profiles(id) on delete set null;

do $$ begin
if not exists (select 1 from pg_constraint where conname = 'inspection_jobs_wdo_exclusion_consistent' and conrelid = 'public.inspection_jobs'::regclass) then
  alter table public.inspection_jobs add constraint inspection_jobs_wdo_exclusion_consistent check (
    (wdo_filing_requirement = 'required'
      and wdo_exclusion_reason is null
      and wdo_exclusion_notes is null
      and wdo_excluded_at is null
      and wdo_excluded_by is null)
    or
    (wdo_filing_requirement = 'not_required'
      and wdo_exclusion_reason is not null
      and wdo_excluded_at is not null
      and wdo_excluded_by is not null
      and (wdo_exclusion_reason <> 'other_non_reportable'
        or nullif(trim(wdo_exclusion_notes), '') is not null))
  );
end if;
end $$;

create index if not exists inspection_jobs_org_wdo_requirement_idx
on public.inspection_jobs (organization_id, wdo_filing_requirement, inspection_at desc);

create index if not exists inspection_jobs_wdo_excluded_by_idx
on public.inspection_jobs (wdo_excluded_by);

alter table public.properties
  add column if not exists building_number text,
  add column if not exists street_name text,
  add column if not exists unit_or_suite text;

do $$ begin
if not exists (select 1 from pg_constraint where conname = 'properties_structured_address_consistent' and conrelid = 'public.properties'::regclass) then
  alter table public.properties add constraint properties_structured_address_consistent check (
    (building_number is null and street_name is null)
    or
    (nullif(trim(building_number), '') is not null
      and nullif(trim(street_name), '') is not null)
  );
end if;
end $$;

-- Only split legacy addresses that match the same conservative parser used by TIG.
-- Ambiguous rows remain incomplete and must be confirmed by office staff.
update public.properties
set
  building_number = (regexp_match(trim(street_line_1), '^([0-9][A-Za-z0-9-]*)\s+(.+)$'))[1],
  street_name = (regexp_match(trim(street_line_1), '^([0-9][A-Za-z0-9-]*)\s+(.+)$'))[2],
  unit_or_suite = nullif(trim(street_line_2), '')
where building_number is null
  and street_name is null
  and trim(street_line_1) ~ '^([0-9][A-Za-z0-9-]*)\s+(.+)$';

alter table public.wdo_activities
  add column if not exists void_reason text,
  add column if not exists voided_at timestamptz,
  add column if not exists voided_by uuid references public.profiles(id) on delete set null;

-- The earlier WDO release did not expose a void operation, but preserve a safe
-- upgrade path if an operator has already marked a row voided manually.
update public.wdo_activities activity
set
  void_reason = coalesce(nullif(trim(activity.void_reason), ''), 'Legacy void retained during Phase 0 migration'),
  voided_at = coalesce(activity.voided_at, activity.updated_at, now()),
  voided_by = coalesce(
    activity.voided_by,
    activity.updated_by,
    activity.created_by,
    (select membership.user_id
      from public.organization_memberships membership
      where membership.organization_id = activity.organization_id
        and membership.status = 'active'
      order by membership.created_at
      limit 1)
  )
where activity.status = 'voided';

do $$ begin
if not exists (select 1 from pg_constraint where conname = 'wdo_activities_void_consistent' and conrelid = 'public.wdo_activities'::regclass) then
  alter table public.wdo_activities add constraint wdo_activities_void_consistent check (
    (status = 'active' and void_reason is null and voided_at is null and voided_by is null)
    or
    (status = 'voided'
      and nullif(trim(void_reason), '') is not null
      and voided_at is not null
      and voided_by is not null)
  );
end if;
end $$;

create index if not exists wdo_activities_voided_by_idx on public.wdo_activities (voided_by);

do $$ begin
if not exists (select 1 from pg_constraint where conname = 'inspectors_wdo_license_format' and conrelid = 'public.inspectors'::regclass) then
  alter table public.inspectors add constraint inspectors_wdo_license_format check (
    license_number is null
    or (
      length(license_number) between 1 and 10
      and license_number ~ '^[ -~]+$'
      and license_number !~ '\s'
      and license_number ~ '[0-9]'
    )
  ) not valid;
end if;
end $$;

create or replace function public.sync_wdo_inspection_activity_for_job(
  target_job_id uuid,
  target_actor_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  job_record public.inspection_jobs%rowtype;
  organization_timezone text;
  derived_activity_date date;
  derived_activity_code smallint;
  existing_activity public.wdo_activities%rowtype;
  prior_export_count integer := 0;
  actor_id uuid;
begin
  select * into job_record
  from public.inspection_jobs job
  where job.id = target_job_id;
  if job_record.id is null then raise exception 'Inspection job not found.'; end if;

  actor_id := coalesce(target_actor_id, (select auth.uid()), job_record.created_by);
  select organization.timezone into organization_timezone
  from public.organizations organization
  where organization.id = job_record.organization_id;
  derived_activity_date := case when job_record.inspection_at is null then null
    else (job_record.inspection_at at time zone coalesce(organization_timezone, 'America/Los_Angeles'))::date end;
  derived_activity_code := public.wdo_activity_code_for_report_type(job_record.report_type);

  select * into existing_activity
  from public.wdo_activities activity
  where activity.organization_id = job_record.organization_id
    and activity.source_key = 'inspection_job:' || job_record.id::text
  for update;

  if job_record.wdo_filing_requirement = 'not_required' or derived_activity_code is null then
    if existing_activity.id is null then return; end if;
    if existing_activity.status = 'voided' then
      if job_record.wdo_filing_requirement = 'not_required' then
        update public.wdo_activities
        set void_reason = 'Job excluded: ' || replace(job_record.wdo_exclusion_reason, '_', ' ')
          || coalesce(' — ' || nullif(trim(job_record.wdo_exclusion_notes), ''), ''),
          updated_by = actor_id, updated_at = now()
        where id = existing_activity.id;
      end if;
      return;
    end if;
    select count(*) into prior_export_count
    from public.wdo_export_batch_items item
    where item.organization_id = job_record.organization_id
      and item.wdo_activity_id = existing_activity.id;

    if prior_export_count > 0 and not public.has_organization_role(
      job_record.organization_id,
      array['administrator', 'manager']::public.membership_role[]
    ) then
      raise exception 'Manager or administrator approval is required because this WDO activity has generated filing history.';
    end if;

    update public.wdo_activities
    set status = 'voided',
      void_reason = case
        when job_record.wdo_filing_requirement = 'not_required'
          then 'Job excluded: ' || replace(job_record.wdo_exclusion_reason, '_', ' ')
            || coalesce(' — ' || nullif(trim(job_record.wdo_exclusion_notes), ''), '')
        else 'Job report type no longer creates an inspection WDO activity'
      end,
      voided_at = now(), voided_by = actor_id, updated_by = actor_id
    where id = existing_activity.id;

    insert into public.audit_events (
      organization_id, actor_user_id, action, entity_type, entity_id, summary, changes
    ) values (
      job_record.organization_id, actor_id,
      case when prior_export_count > 0 then 'wdo_activity_voided_with_history' else 'wdo_activity_voided' end,
      'wdo_activity', existing_activity.id,
      'Job-derived WDO activity voided without deleting filing history.',
      jsonb_build_object('jobId', job_record.id, 'priorExportCount', prior_export_count,
        'reason', job_record.wdo_exclusion_reason, 'notes', job_record.wdo_exclusion_notes)
    );
    return;
  end if;

  insert into public.wdo_activities (
    organization_id, inspection_job_id, property_id, activity_date,
    activity_date_source, activity_code, activity_code_source,
    inspector_id, inspector_source, source_type, source_id, source_key,
    created_by, updated_by
  ) values (
    job_record.organization_id, job_record.id, job_record.property_id,
    derived_activity_date, 'derived', derived_activity_code, 'derived',
    job_record.inspected_by_id, 'derived', 'inspection_job', job_record.id,
    'inspection_job:' || job_record.id::text, job_record.created_by, actor_id
  )
  on conflict (organization_id, source_key) do update set
    inspection_job_id = excluded.inspection_job_id,
    property_id = excluded.property_id,
    activity_date = case when public.wdo_activities.activity_date_source = 'derived'
      then excluded.activity_date else public.wdo_activities.activity_date end,
    activity_code = case when public.wdo_activities.activity_code_source = 'derived'
      then excluded.activity_code else public.wdo_activities.activity_code end,
    inspector_id = case when public.wdo_activities.inspector_source = 'derived'
      then excluded.inspector_id else public.wdo_activities.inspector_id end,
    status = 'active', void_reason = null, voided_at = null, voided_by = null,
    updated_by = actor_id, updated_at = now();
end;
$$;

create or replace function public.sync_wdo_inspection_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if current_setting('tig.wdo_defer_sync', true) = 'true' then return new; end if;
  perform public.sync_wdo_inspection_activity_for_job(
    new.id,
    coalesce((select auth.uid()), new.created_by)
  );
  return new;
end;
$$;

drop trigger if exists inspection_jobs_sync_wdo_activity on public.inspection_jobs;
create trigger inspection_jobs_sync_wdo_activity
after insert or update of
  report_type, inspection_at, property_id, inspected_by_id,
  wdo_filing_requirement, wdo_exclusion_reason, wdo_exclusion_notes
on public.inspection_jobs
for each row execute procedure public.sync_wdo_inspection_activity();

create or replace function public.reconcile_wdo_inspection_activities(
  target_organization_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  job_record record;
  jobs_examined integer := 0;
  already_existing integer := 0;
  activities_created integer := 0;
  needs_attention integer := 0;
  skipped integer := 0;
begin
  if not public.has_organization_role(
    target_organization_id,
    array['administrator', 'manager', 'office_coordinator']::public.membership_role[]
  ) then
    raise exception 'WDO compliance access required.';
  end if;

  perform pg_advisory_xact_lock(hashtext(target_organization_id::text || ':wdo-reconcile'));

  for job_record in
    select job.*
    from public.inspection_jobs job
    where job.organization_id = target_organization_id
      and public.wdo_activity_code_for_report_type(job.report_type) is not null
    order by job.id
  loop
    jobs_examined := jobs_examined + 1;
    if job_record.wdo_filing_requirement = 'not_required' then
      skipped := skipped + 1;
    elsif exists (
      select 1 from public.wdo_activities activity
      where activity.organization_id = target_organization_id
        and activity.source_key = 'inspection_job:' || job_record.id::text
    ) then
      already_existing := already_existing + 1;
    else
      activities_created := activities_created + 1;
    end if;
    perform public.sync_wdo_inspection_activity_for_job(job_record.id, (select auth.uid()));
  end loop;

  select count(*) into needs_attention
  from public.wdo_activities activity
  join public.inspection_jobs job on job.id = activity.inspection_job_id
  join public.properties property on property.id = activity.property_id
  left join public.inspectors inspector on inspector.id = activity.inspector_id
  left join public.organization_report_profiles profile
    on profile.organization_id = activity.organization_id
  where activity.organization_id = target_organization_id
    and activity.status = 'active'
    and job.wdo_filing_requirement = 'required'
    and (
      activity.activity_date is null or activity.activity_code is null
      or nullif(trim(coalesce(profile.legal_name, '')), '') is null
      or nullif(trim(coalesce(profile.registration_number, '')), '') is null
      or nullif(trim(coalesce(inspector.license_number, '')), '') is null
      or inspector.license_number !~ '[0-9]'
      or length(inspector.license_number) > 10
      or property.region <> 'CA'
      or nullif(trim(property.building_number), '') is null
      or nullif(trim(property.street_name), '') is null
      or nullif(trim(property.city), '') is null
      or property.postal_code !~ '^(\d{5}|\d{9})$'
    );

  insert into public.audit_events (
    organization_id, actor_user_id, action, entity_type, summary, changes
  ) values (
    target_organization_id, (select auth.uid()), 'wdo_activities_reconciled',
    'wdo_activity', 'Inspection jobs reconciled with WDO filing requirements.',
    jsonb_build_object('jobsExamined', jobs_examined, 'activitiesCreated', activities_created,
      'alreadyExisting', already_existing, 'needsAttention', needs_attention,
      'skipped', skipped)
  );

  return jsonb_build_object(
    'jobsExamined', jobs_examined, 'activitiesCreated', activities_created,
    'alreadyExisting', already_existing, 'needsAttention', needs_attention,
    'skipped', skipped,
    'skipReasons', jsonb_build_array(jsonb_build_object(
      'reason', 'wdo_not_required', 'count', skipped
    ))
  );
$$;

revoke all on function public.sync_wdo_inspection_activity_for_job(uuid, uuid) from public, anon, authenticated;

create or replace function public.set_inspection_job_wdo_requirement(
  target_organization_id uuid,
  target_job_id uuid,
  job_wdo_filing_requirement text,
  job_wdo_exclusion_reason text,
  job_wdo_exclusion_notes text
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  previous_requirement text;
  previous_reason text;
  previous_notes text;
begin
  if not public.has_organization_role(
    target_organization_id,
    array['administrator', 'manager', 'office_coordinator']::public.membership_role[]
  ) then
    raise exception 'Job management access required.';
  end if;
  if job_wdo_filing_requirement not in ('required', 'not_required') then
    raise exception 'Choose Required or Not required for WDO filing.';
  end if;
  if job_wdo_filing_requirement = 'not_required' and job_wdo_exclusion_reason not in (
    'test_or_training', 'created_in_error_or_duplicate',
    'inspection_never_commenced', 'other_non_reportable'
  ) then
    raise exception 'Choose a reason when WDO filing is not required.';
  end if;
  if job_wdo_filing_requirement = 'not_required'
    and job_wdo_exclusion_reason = 'other_non_reportable'
    and nullif(trim(job_wdo_exclusion_notes), '') is null
  then
    raise exception 'Explain why this job is not reportable.';
  end if;

  select job.wdo_filing_requirement, job.wdo_exclusion_reason, job.wdo_exclusion_notes
  into previous_requirement, previous_reason, previous_notes
  from public.inspection_jobs job
  where job.organization_id = target_organization_id and job.id = target_job_id
  for update;
  if previous_requirement is null then raise exception 'Inspection job not found.'; end if;

  update public.inspection_jobs
  set
    wdo_filing_requirement = job_wdo_filing_requirement,
    wdo_exclusion_reason = case when job_wdo_filing_requirement = 'not_required'
      then job_wdo_exclusion_reason else null end,
    wdo_exclusion_notes = case when job_wdo_filing_requirement = 'not_required'
      then nullif(trim(job_wdo_exclusion_notes), '') else null end,
    wdo_excluded_at = case when job_wdo_filing_requirement = 'not_required'
      then coalesce(wdo_excluded_at, now()) else null end,
    wdo_excluded_by = case when job_wdo_filing_requirement = 'not_required'
      then coalesce(wdo_excluded_by, actor_id) else null end
  where organization_id = target_organization_id and id = target_job_id;

  if previous_requirement is distinct from job_wdo_filing_requirement
    or previous_reason is distinct from case when job_wdo_filing_requirement = 'not_required'
      then job_wdo_exclusion_reason else null end
    or previous_notes is distinct from case when job_wdo_filing_requirement = 'not_required'
      then nullif(trim(job_wdo_exclusion_notes), '') else null end
  then
    insert into public.audit_events (
      organization_id, actor_user_id, action, entity_type, entity_id, summary, changes
    ) values (
      target_organization_id, actor_id, 'inspection_job_wdo_requirement_changed',
      'inspection_job', target_job_id, 'California WDO filing requirement changed.',
      jsonb_build_object(
        'from', previous_requirement, 'to', job_wdo_filing_requirement,
        'reason', job_wdo_exclusion_reason, 'notes', nullif(trim(job_wdo_exclusion_notes), '')
      )
    );
  end if;
end;
$$;

create or replace function public.void_manual_wdo_activity(
  target_organization_id uuid,
  target_activity_id uuid,
  activity_void_reason text
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  activity_record public.wdo_activities%rowtype;
  prior_export_count integer;
  actor_id uuid := (select auth.uid());
begin
  if not public.has_organization_role(
    target_organization_id,
    array['administrator', 'manager', 'office_coordinator']::public.membership_role[]
  ) then raise exception 'WDO compliance access required.'; end if;
  if nullif(trim(activity_void_reason), '') is null then
    raise exception 'A void reason is required.';
  end if;

  select * into activity_record from public.wdo_activities activity
  where activity.organization_id = target_organization_id and activity.id = target_activity_id
  for update;
  if activity_record.id is null then raise exception 'WDO activity not found.'; end if;
  if activity_record.source_type = 'inspection_job' then
    raise exception 'Change the source job WDO filing requirement instead.';
  end if;
  if activity_record.status = 'voided' then return; end if;

  select count(*) into prior_export_count from public.wdo_export_batch_items item
  where item.organization_id = target_organization_id
    and item.wdo_activity_id = target_activity_id;
  if prior_export_count > 0 and not public.has_organization_role(
    target_organization_id,
    array['administrator', 'manager']::public.membership_role[]
  ) then
    raise exception 'Manager or administrator approval is required because this WDO activity has generated filing history.';
  end if;

  update public.wdo_activities set
    status = 'voided', void_reason = trim(activity_void_reason),
    voided_at = now(), voided_by = actor_id, updated_by = actor_id
  where id = target_activity_id;
  insert into public.audit_events (
    organization_id, actor_user_id, action, entity_type, entity_id, summary, changes
  ) values (
    target_organization_id, actor_id,
    case when prior_export_count > 0 then 'wdo_activity_voided_with_history' else 'wdo_activity_voided' end,
    'wdo_activity', target_activity_id,
    'Manual WDO activity voided without deleting filing history.',
    jsonb_build_object('reason', trim(activity_void_reason), 'priorExportCount', prior_export_count)
  );
end;
$$;

create or replace function public.create_california_inspection_job(
  target_organization_id uuid,
  property_building_number text,
  property_street_name text,
  property_unit_or_suite text,
  property_city text,
  property_postal_code text,
  property_type_name text,
  inspection_report_type text,
  inspection_date timestamptz,
  prior_inspection_job_id uuid,
  job_general_description text,
  job_escrow_number text,
  property_county text,
  job_inspected_by_id uuid,
  job_include_inspector_signature boolean,
  job_wdo_filing_requirement text,
  job_wdo_exclusion_reason text,
  job_wdo_exclusion_notes text
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  new_job_id uuid;
  target_property_id uuid;
  combined_street text;
  wdo_street text;
begin
  if nullif(trim(property_building_number), '') is null
    or nullif(trim(property_street_name), '') is null
    or nullif(trim(property_city), '') is null
    or trim(property_postal_code) !~ '^(\d{5}|\d{9})$'
  then
    raise exception 'Building number, street name, city, and a 5- or 9-digit ZIP code are required.';
  end if;
  combined_street := trim(property_building_number) || ' ' || trim(property_street_name);
  wdo_street := trim(property_street_name)
    || coalesce(' ' || nullif(trim(property_unit_or_suite), ''), '');
  if job_wdo_filing_requirement = 'required' and (
    length(trim(property_building_number)) > 6
    or length(wdo_street) > 50
    or length(trim(property_city)) > 50
    or combined_street !~ '^[ -~]+$'
    or wdo_street !~ '^[ -~]+$'
    or trim(property_city) !~ '^[ -~]+$'
  ) then
    raise exception 'Property address exceeds or cannot be represented in the California WDO TXT format.';
  end if;

  -- Defer legacy RPC triggers until structured source data and the explicit
  -- filing requirement are present, so excluded jobs never create an activity.
  perform set_config('tig.wdo_defer_sync', 'true', true);
  new_job_id := public.create_inspection_job(
    target_organization_id, combined_street,
    nullif(trim(property_unit_or_suite), ''), trim(property_city), 'CA',
    trim(property_postal_code), property_type_name, inspection_report_type,
    inspection_date, prior_inspection_job_id, job_general_description,
    job_escrow_number, property_county, job_inspected_by_id,
    job_include_inspector_signature
  );
  perform set_config('tig.wdo_defer_sync', 'false', true);

  select job.property_id into target_property_id
  from public.inspection_jobs job
  where job.id = new_job_id and job.organization_id = target_organization_id;
  update public.properties
  set building_number = trim(property_building_number),
    street_name = trim(property_street_name),
    unit_or_suite = nullif(trim(property_unit_or_suite), ''),
    region = 'CA'
  where id = target_property_id and organization_id = target_organization_id;

  perform public.set_inspection_job_wdo_requirement(
    target_organization_id, new_job_id, job_wdo_filing_requirement,
    job_wdo_exclusion_reason, job_wdo_exclusion_notes
  );
  return new_job_id;
end;
$$;

create or replace function public.update_california_inspection_job(
  target_organization_id uuid,
  target_job_id uuid,
  property_building_number text,
  property_street_name text,
  property_unit_or_suite text,
  property_city text,
  property_postal_code text,
  property_type_name text,
  inspection_report_type text,
  inspection_date timestamptz,
  prior_inspection_job_id uuid,
  job_internal_notes text,
  job_general_description text,
  job_escrow_number text,
  property_county text,
  job_inspected_by_id uuid,
  job_include_inspector_signature boolean,
  job_wdo_filing_requirement text,
  job_wdo_exclusion_reason text,
  job_wdo_exclusion_notes text
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  target_property_id uuid;
  combined_street text;
  wdo_street text;
begin
  if nullif(trim(property_building_number), '') is null
    or nullif(trim(property_street_name), '') is null
    or nullif(trim(property_city), '') is null
    or trim(property_postal_code) !~ '^(\d{5}|\d{9})$'
  then
    raise exception 'Building number, street name, city, and a 5- or 9-digit ZIP code are required.';
  end if;
  combined_street := trim(property_building_number) || ' ' || trim(property_street_name);
  wdo_street := trim(property_street_name)
    || coalesce(' ' || nullif(trim(property_unit_or_suite), ''), '');
  if job_wdo_filing_requirement = 'required' and (
    length(trim(property_building_number)) > 6
    or length(wdo_street) > 50
    or length(trim(property_city)) > 50
    or combined_street !~ '^[ -~]+$'
    or wdo_street !~ '^[ -~]+$'
    or trim(property_city) !~ '^[ -~]+$'
  ) then
    raise exception 'Property address exceeds or cannot be represented in the California WDO TXT format.';
  end if;

  perform public.update_inspection_job(
    target_organization_id, target_job_id, combined_street,
    nullif(trim(property_unit_or_suite), ''), trim(property_city), 'CA',
    trim(property_postal_code), property_type_name, inspection_report_type,
    inspection_date, prior_inspection_job_id, job_internal_notes,
    job_general_description, job_escrow_number, property_county,
    job_inspected_by_id, job_include_inspector_signature
  );
  select job.property_id into target_property_id
  from public.inspection_jobs job
  where job.id = target_job_id and job.organization_id = target_organization_id;
  update public.properties
  set building_number = trim(property_building_number),
    street_name = trim(property_street_name),
    unit_or_suite = nullif(trim(property_unit_or_suite), ''),
    region = 'CA'
  where id = target_property_id and organization_id = target_organization_id;

  perform public.set_inspection_job_wdo_requirement(
    target_organization_id, target_job_id, job_wdo_filing_requirement,
    job_wdo_exclusion_reason, job_wdo_exclusion_notes
  );
end;
$$;

revoke all on function public.set_inspection_job_wdo_requirement(uuid, uuid, text, text, text) from public, anon;
revoke all on function public.void_manual_wdo_activity(uuid, uuid, text) from public, anon;
revoke all on function public.create_california_inspection_job(
  uuid, text, text, text, text, text, text, text, timestamptz, uuid,
  text, text, text, uuid, boolean, text, text, text
) from public, anon;
revoke all on function public.update_california_inspection_job(
  uuid, uuid, text, text, text, text, text, text, text, timestamptz, uuid,
  text, text, text, text, uuid, boolean, text, text, text
) from public, anon;

grant execute on function public.set_inspection_job_wdo_requirement(uuid, uuid, text, text, text) to authenticated;
grant execute on function public.void_manual_wdo_activity(uuid, uuid, text) to authenticated;
grant execute on function public.create_california_inspection_job(
  uuid, text, text, text, text, text, text, text, timestamptz, uuid,
  text, text, text, uuid, boolean, text, text, text
) to authenticated;
grant execute on function public.update_california_inspection_job(
  uuid, uuid, text, text, text, text, text, text, text, timestamptz, uuid,
  text, text, text, text, uuid, boolean, text, text, text
) to authenticated;

-- Backfill missing derived activities and refresh active ones through the shared rule.
-- Preserve any pre-existing void decision and avoid rewriting job timestamps.
do $$
declare
  job_record record;
begin
  for job_record in
    select job.id, job.created_by
    from public.inspection_jobs job
    left join public.wdo_activities activity
      on activity.organization_id = job.organization_id
      and activity.source_key = 'inspection_job:' || job.id::text
    where activity.id is null or activity.status = 'active'
    order by job.id
  loop
    perform public.sync_wdo_inspection_activity_for_job(job_record.id, job_record.created_by);
  end loop;
end;
$$;

commit;
