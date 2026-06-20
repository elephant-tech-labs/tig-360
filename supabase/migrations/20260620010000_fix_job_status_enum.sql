begin;

create or replace function public.create_inspection_job(
  target_organization_id uuid,
  property_street_line_1 text,
  property_street_line_2 text,
  property_city text,
  property_region text,
  property_postal_code text,
  property_type_name text,
  inspection_report_type text,
  inspection_date timestamptz
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  new_property_id uuid;
  new_job_id uuid;
begin
  if not public.is_organization_member(target_organization_id) then
    raise exception 'Active organization membership required';
  end if;

  if inspection_report_type not in ('complete', 'limited', 'supplemental', 'reinspection') then
    raise exception 'Invalid report type';
  end if;

  insert into public.properties (
    organization_id,
    street_line_1,
    street_line_2,
    city,
    region,
    postal_code,
    property_type
  )
  values (
    target_organization_id,
    trim(property_street_line_1),
    nullif(trim(property_street_line_2), ''),
    trim(property_city),
    upper(trim(property_region)),
    trim(property_postal_code),
    nullif(trim(property_type_name), '')
  )
  returning id into new_property_id;

  insert into public.inspection_jobs (
    organization_id,
    property_id,
    report_type,
    status,
    inspection_at,
    assigned_inspector_id,
    created_by
  )
  values (
    target_organization_id,
    new_property_id,
    inspection_report_type,
    case
      when inspection_date is null then 'draft'::public.job_status
      else 'scheduled'::public.job_status
    end,
    inspection_date,
    (select auth.uid()),
    (select auth.uid())
  )
  returning id into new_job_id;

  return new_job_id;
end;
$$;

commit;
