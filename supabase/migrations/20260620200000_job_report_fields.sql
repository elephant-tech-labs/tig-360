begin;

alter table public.inspection_jobs
add column if not exists escrow_number text;

create or replace function public.create_inspection_job(
  target_organization_id uuid,
  property_street_line_1 text,
  property_street_line_2 text,
  property_city text,
  property_region text,
  property_postal_code text,
  property_type_name text,
  inspection_report_type text,
  inspection_date timestamptz,
  prior_inspection_job_id uuid,
  job_general_description text,
  job_escrow_number text
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  new_property_id uuid;
  new_job_id uuid;
begin
  if not public.is_organization_member(target_organization_id) then raise exception 'Active organization membership required'; end if;
  if inspection_report_type not in ('complete', 'limited', 'supplemental', 'reinspection') then raise exception 'Invalid report type'; end if;
  if inspection_report_type in ('supplemental', 'reinspection') and prior_inspection_job_id is null then raise exception 'A prior inspection is required for supplemental and reinspection reports'; end if;
  if inspection_report_type in ('complete', 'limited') and prior_inspection_job_id is not null then raise exception 'Only supplemental and reinspection reports may reference a prior inspection'; end if;

  if prior_inspection_job_id is not null then
    select job.property_id into new_property_id from public.inspection_jobs job
    where job.id = prior_inspection_job_id and job.organization_id = target_organization_id;
    if new_property_id is null then raise exception 'Prior inspection not found'; end if;
    update public.properties set
      street_line_1 = trim(property_street_line_1), street_line_2 = nullif(trim(property_street_line_2), ''),
      city = trim(property_city), region = upper(trim(property_region)), postal_code = trim(property_postal_code),
      property_type = nullif(trim(property_type_name), '')
    where id = new_property_id and organization_id = target_organization_id;
  else
    insert into public.properties (organization_id, street_line_1, street_line_2, city, region, postal_code, property_type)
    values (target_organization_id, trim(property_street_line_1), nullif(trim(property_street_line_2), ''), trim(property_city), upper(trim(property_region)), trim(property_postal_code), nullif(trim(property_type_name), ''))
    returning id into new_property_id;
  end if;

  insert into public.inspection_jobs (
    organization_id, property_id, prior_job_id, report_type, status, inspection_at, summary, escrow_number,
    assigned_inspector_id, created_by
  ) values (
    target_organization_id, new_property_id, prior_inspection_job_id, inspection_report_type,
    case when inspection_date is null then 'draft'::public.job_status else 'scheduled'::public.job_status end,
    inspection_date, nullif(trim(job_general_description), ''), nullif(trim(job_escrow_number), ''),
    (select auth.uid()), (select auth.uid())
  ) returning id into new_job_id;
  return new_job_id;
end;
$$;

create or replace function public.create_inspection_job(
  target_organization_id uuid, property_street_line_1 text, property_street_line_2 text,
  property_city text, property_region text, property_postal_code text, property_type_name text,
  inspection_report_type text, inspection_date timestamptz, prior_inspection_job_id uuid
)
returns uuid language sql set search_path = '' as $$
  select public.create_inspection_job(
    target_organization_id, property_street_line_1, property_street_line_2, property_city,
    property_region, property_postal_code, property_type_name, inspection_report_type,
    inspection_date, prior_inspection_job_id, null::text, null::text
  );
$$;

create or replace function public.update_inspection_job(
  target_organization_id uuid, target_job_id uuid, property_street_line_1 text,
  property_street_line_2 text, property_city text, property_region text, property_postal_code text,
  property_type_name text, inspection_report_type text, inspection_date timestamptz,
  prior_inspection_job_id uuid, job_internal_notes text, job_general_description text, job_escrow_number text
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  target_property_id uuid;
  prior_property_id uuid;
begin
  if not public.is_organization_member(target_organization_id) then raise exception 'Active organization membership required'; end if;
  if inspection_report_type not in ('complete', 'limited', 'supplemental', 'reinspection') then raise exception 'Invalid report type'; end if;
  if prior_inspection_job_id = target_job_id then raise exception 'A job cannot reference itself as its prior inspection'; end if;
  if inspection_report_type in ('supplemental', 'reinspection') and prior_inspection_job_id is null then raise exception 'A prior inspection is required for supplemental and reinspection reports'; end if;
  if inspection_report_type in ('complete', 'limited') and prior_inspection_job_id is not null then raise exception 'Only supplemental and reinspection reports may reference a prior inspection'; end if;

  select job.property_id into target_property_id from public.inspection_jobs job
  where job.id = target_job_id and job.organization_id = target_organization_id;
  if target_property_id is null then raise exception 'Inspection job not found'; end if;

  if prior_inspection_job_id is not null then
    if exists (
      with recursive prior_chain as (
        select job.id, job.prior_job_id from public.inspection_jobs job
        where job.id = prior_inspection_job_id and job.organization_id = target_organization_id
        union all
        select parent.id, parent.prior_job_id from public.inspection_jobs parent
        join prior_chain chain on parent.id = chain.prior_job_id
        where parent.organization_id = target_organization_id
      ) select 1 from prior_chain where id = target_job_id
    ) then raise exception 'Prior inspection relationships cannot form a circular chain'; end if;

    select job.property_id into prior_property_id from public.inspection_jobs job
    where job.id = prior_inspection_job_id and job.organization_id = target_organization_id;
    if prior_property_id is null then raise exception 'Prior inspection not found'; end if;
    target_property_id := prior_property_id;
  end if;

  update public.properties set
    street_line_1 = trim(property_street_line_1), street_line_2 = nullif(trim(property_street_line_2), ''),
    city = trim(property_city), region = upper(trim(property_region)), postal_code = trim(property_postal_code),
    property_type = nullif(trim(property_type_name), '')
  where id = target_property_id and organization_id = target_organization_id;

  update public.inspection_jobs set
    property_id = target_property_id, prior_job_id = prior_inspection_job_id, report_type = inspection_report_type,
    inspection_at = inspection_date, summary = nullif(trim(job_general_description), ''),
    escrow_number = nullif(trim(job_escrow_number), ''), internal_notes = nullif(trim(job_internal_notes), ''),
    status = case when status in ('draft'::public.job_status, 'scheduled'::public.job_status)
      then case when inspection_date is null then 'draft'::public.job_status else 'scheduled'::public.job_status end
      else status end
  where id = target_job_id and organization_id = target_organization_id;
end;
$$;

create or replace function public.update_inspection_job(
  target_organization_id uuid, target_job_id uuid, property_street_line_1 text,
  property_street_line_2 text, property_city text, property_region text, property_postal_code text,
  property_type_name text, inspection_report_type text, inspection_date timestamptz,
  prior_inspection_job_id uuid, job_internal_notes text
)
returns void language plpgsql set search_path = '' as $$
declare
  existing_general_description text;
  existing_escrow_number text;
begin
  select job.summary, job.escrow_number into existing_general_description, existing_escrow_number
  from public.inspection_jobs job
  where job.id = target_job_id and job.organization_id = target_organization_id;

  perform public.update_inspection_job(
    target_organization_id, target_job_id, property_street_line_1, property_street_line_2,
    property_city, property_region, property_postal_code, property_type_name, inspection_report_type,
    inspection_date, prior_inspection_job_id, job_internal_notes,
    existing_general_description, existing_escrow_number
  );
end;
$$;

revoke all on function public.create_inspection_job(uuid, text, text, text, text, text, text, text, timestamptz, uuid, text, text) from public;
revoke all on function public.update_inspection_job(uuid, uuid, text, text, text, text, text, text, text, timestamptz, uuid, text, text, text) from public;
grant execute on function public.create_inspection_job(uuid, text, text, text, text, text, text, text, timestamptz, uuid, text, text) to authenticated;
grant execute on function public.update_inspection_job(uuid, uuid, text, text, text, text, text, text, text, timestamptz, uuid, text, text, text) to authenticated;

commit;
