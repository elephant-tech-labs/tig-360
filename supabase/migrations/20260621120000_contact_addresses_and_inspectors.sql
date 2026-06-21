begin;

alter table public.contacts
  add column if not exists category text not null default 'other',
  add column if not exists street_line_1 text,
  add column if not exists street_line_2 text,
  add column if not exists city text,
  add column if not exists region text,
  add column if not exists postal_code text,
  add column if not exists county text;

alter table public.contacts
  drop constraint if exists contacts_category_check;

alter table public.contacts
  add constraint contacts_category_check
  check (category in (
    'agent',
    'homeowner',
    'property_manager',
    'escrow',
    'contractor',
    'other'
  ));

alter table public.properties
  add column if not exists county text;

create table if not exists public.inspector_profiles (
  organization_id uuid not null,
  user_id uuid not null,
  license_number text,
  license_expires_on date,
  signature_path text,
  signature_filename text,
  signature_content_type text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, user_id),
  foreign key (organization_id, user_id)
    references public.organization_memberships(organization_id, user_id)
    on delete cascade
);

alter table public.inspection_jobs
  add column if not exists inspected_by_id uuid,
  add column if not exists include_inspector_signature boolean not null default true;

alter table public.inspection_jobs
  drop constraint if exists inspection_jobs_inspected_by_profile_fkey;

alter table public.inspection_jobs
  add constraint inspection_jobs_inspected_by_profile_fkey
  foreign key (organization_id, inspected_by_id)
  references public.inspector_profiles(organization_id, user_id)
  on delete restrict;

create index if not exists inspection_jobs_inspected_by_idx
on public.inspection_jobs (organization_id, inspected_by_id);

drop trigger if exists inspector_profiles_set_updated_at on public.inspector_profiles;
create trigger inspector_profiles_set_updated_at
before update on public.inspector_profiles
for each row execute procedure public.set_updated_at();

alter table public.inspector_profiles enable row level security;

drop policy if exists inspector_profiles_org_select on public.inspector_profiles;
create policy inspector_profiles_org_select
on public.inspector_profiles for select to authenticated
using (public.is_organization_member(organization_id));

drop policy if exists inspector_profiles_manager_write on public.inspector_profiles;
create policy inspector_profiles_manager_write
on public.inspector_profiles for all to authenticated
using (
  public.has_organization_role(
    organization_id,
    array['administrator', 'manager']::public.membership_role[]
  )
)
with check (
  public.has_organization_role(
    organization_id,
    array['administrator', 'manager']::public.membership_role[]
  )
);

grant select, insert, update, delete on public.inspector_profiles to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'inspector-signatures',
  'inspector-signatures',
  false,
  5242880,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists inspector_signatures_org_read on storage.objects;
create policy inspector_signatures_org_read
on storage.objects for select to authenticated
using (
  bucket_id = 'inspector-signatures'
  and public.is_organization_member(
    ((storage.foldername(name))[1])::uuid
  )
);

drop policy if exists inspector_signatures_manager_insert on storage.objects;
create policy inspector_signatures_manager_insert
on storage.objects for insert to authenticated
with check (
  bucket_id = 'inspector-signatures'
  and public.has_organization_role(
    ((storage.foldername(name))[1])::uuid,
    array['administrator', 'manager']::public.membership_role[]
  )
);

drop policy if exists inspector_signatures_manager_update on storage.objects;
create policy inspector_signatures_manager_update
on storage.objects for update to authenticated
using (
  bucket_id = 'inspector-signatures'
  and public.has_organization_role(
    ((storage.foldername(name))[1])::uuid,
    array['administrator', 'manager']::public.membership_role[]
  )
)
with check (
  bucket_id = 'inspector-signatures'
  and public.has_organization_role(
    ((storage.foldername(name))[1])::uuid,
    array['administrator', 'manager']::public.membership_role[]
  )
);

drop policy if exists inspector_signatures_manager_delete on storage.objects;
create policy inspector_signatures_manager_delete
on storage.objects for delete to authenticated
using (
  bucket_id = 'inspector-signatures'
  and public.has_organization_role(
    ((storage.foldername(name))[1])::uuid,
    array['administrator', 'manager']::public.membership_role[]
  )
);

create or replace function public.create_contact(
  target_organization_id uuid,
  contact_first_name text,
  contact_last_name text,
  contact_email text,
  contact_secondary_email text,
  contact_mobile_phone text,
  contact_home_phone text,
  contact_job_title text,
  contact_company_name text,
  contact_notes text,
  contact_category text,
  contact_street_line_1 text,
  contact_street_line_2 text,
  contact_city text,
  contact_region text,
  contact_postal_code text,
  contact_county text
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  new_contact_id uuid;
begin
  new_contact_id := public.create_contact(
    target_organization_id,
    contact_first_name,
    contact_last_name,
    contact_email,
    contact_secondary_email,
    contact_mobile_phone,
    contact_home_phone,
    contact_job_title,
    contact_company_name,
    contact_notes
  );

  update public.contacts
  set
    category = coalesce(nullif(trim(contact_category), ''), 'other'),
    street_line_1 = nullif(trim(contact_street_line_1), ''),
    street_line_2 = nullif(trim(contact_street_line_2), ''),
    city = nullif(trim(contact_city), ''),
    region = nullif(upper(trim(contact_region)), ''),
    postal_code = nullif(trim(contact_postal_code), ''),
    county = nullif(trim(contact_county), '')
  where id = new_contact_id
    and organization_id = target_organization_id;

  return new_contact_id;
end;
$$;

create or replace function public.update_contact(
  target_organization_id uuid,
  target_contact_id uuid,
  contact_first_name text,
  contact_last_name text,
  contact_email text,
  contact_secondary_email text,
  contact_mobile_phone text,
  contact_home_phone text,
  contact_job_title text,
  contact_company_name text,
  contact_notes text,
  contact_category text,
  contact_street_line_1 text,
  contact_street_line_2 text,
  contact_city text,
  contact_region text,
  contact_postal_code text,
  contact_county text
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  contact_company_id uuid;
begin
  if not public.is_organization_member(target_organization_id) then
    raise exception 'Active organization membership required';
  end if;

  if trim(coalesce(contact_first_name, '') || ' ' || coalesce(contact_last_name, '')) = '' then
    raise exception 'Contact name is required';
  end if;

  if not exists (
    select 1 from public.contacts
    where id = target_contact_id
      and organization_id = target_organization_id
  ) then
    raise exception 'Contact not found';
  end if;

  if nullif(trim(contact_company_name), '') is not null then
    select company.id into contact_company_id
    from public.companies company
    where company.organization_id = target_organization_id
      and lower(company.name) = lower(trim(contact_company_name))
    limit 1;

    if contact_company_id is null then
      insert into public.companies (organization_id, name)
      values (target_organization_id, trim(contact_company_name))
      returning id into contact_company_id;
    end if;
  end if;

  update public.contacts
  set
    company_id = contact_company_id,
    first_name = trim(coalesce(contact_first_name, '')),
    last_name = trim(coalesce(contact_last_name, '')),
    email = nullif(lower(trim(contact_email)), ''),
    secondary_email = nullif(lower(trim(contact_secondary_email)), ''),
    mobile_phone = nullif(trim(contact_mobile_phone), ''),
    home_phone = nullif(trim(contact_home_phone), ''),
    job_title = nullif(trim(contact_job_title), ''),
    notes = nullif(trim(contact_notes), ''),
    category = coalesce(nullif(trim(contact_category), ''), 'other'),
    street_line_1 = nullif(trim(contact_street_line_1), ''),
    street_line_2 = nullif(trim(contact_street_line_2), ''),
    city = nullif(trim(contact_city), ''),
    region = nullif(upper(trim(contact_region)), ''),
    postal_code = nullif(trim(contact_postal_code), ''),
    county = nullif(trim(contact_county), '')
  where id = target_contact_id
    and organization_id = target_organization_id;
end;
$$;

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
  job_escrow_number text,
  property_county text,
  job_inspected_by_id uuid,
  job_include_inspector_signature boolean
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  new_job_id uuid;
begin
  if job_inspected_by_id is not null and not exists (
    select 1 from public.inspector_profiles inspector
    where inspector.organization_id = target_organization_id
      and inspector.user_id = job_inspected_by_id
      and inspector.is_active
  ) then
    raise exception 'Choose an active inspector';
  end if;

  new_job_id := public.create_inspection_job(
    target_organization_id,
    property_street_line_1,
    property_street_line_2,
    property_city,
    property_region,
    property_postal_code,
    property_type_name,
    inspection_report_type,
    inspection_date,
    prior_inspection_job_id,
    job_general_description,
    job_escrow_number
  );

  update public.properties property
  set county = nullif(trim(property_county), '')
  from public.inspection_jobs job
  where job.id = new_job_id
    and job.property_id = property.id
    and job.organization_id = target_organization_id;

  update public.inspection_jobs
  set
    inspected_by_id = job_inspected_by_id,
    include_inspector_signature = coalesce(job_include_inspector_signature, true)
  where id = new_job_id
    and organization_id = target_organization_id;

  return new_job_id;
end;
$$;

create or replace function public.update_inspection_job(
  target_organization_id uuid,
  target_job_id uuid,
  property_street_line_1 text,
  property_street_line_2 text,
  property_city text,
  property_region text,
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
  job_include_inspector_signature boolean
)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if job_inspected_by_id is not null and not exists (
    select 1 from public.inspector_profiles inspector
    where inspector.organization_id = target_organization_id
      and inspector.user_id = job_inspected_by_id
      and inspector.is_active
  ) then
    raise exception 'Choose an active inspector';
  end if;

  perform public.update_inspection_job(
    target_organization_id,
    target_job_id,
    property_street_line_1,
    property_street_line_2,
    property_city,
    property_region,
    property_postal_code,
    property_type_name,
    inspection_report_type,
    inspection_date,
    prior_inspection_job_id,
    job_internal_notes,
    job_general_description,
    job_escrow_number
  );

  update public.properties property
  set county = nullif(trim(property_county), '')
  from public.inspection_jobs job
  where job.id = target_job_id
    and job.property_id = property.id
    and job.organization_id = target_organization_id;

  update public.inspection_jobs
  set
    inspected_by_id = job_inspected_by_id,
    include_inspector_signature = coalesce(job_include_inspector_signature, true)
  where id = target_job_id
    and organization_id = target_organization_id;
end;
$$;

create or replace function public.save_inspector_profile(
  target_organization_id uuid,
  target_user_id uuid,
  inspector_license_number text,
  inspector_license_expires_on date,
  inspector_is_active boolean,
  inspector_signature_path text,
  inspector_signature_filename text,
  inspector_signature_content_type text
)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if not public.has_organization_role(
    target_organization_id,
    array['administrator', 'manager']::public.membership_role[]
  ) then
    raise exception 'Administrator or manager access required';
  end if;

  if not exists (
    select 1 from public.organization_memberships membership
    where membership.organization_id = target_organization_id
      and membership.user_id = target_user_id
      and membership.status = 'active'
  ) then
    raise exception 'Active team member not found';
  end if;

  insert into public.inspector_profiles (
    organization_id,
    user_id,
    license_number,
    license_expires_on,
    is_active,
    signature_path,
    signature_filename,
    signature_content_type
  )
  values (
    target_organization_id,
    target_user_id,
    nullif(trim(inspector_license_number), ''),
    inspector_license_expires_on,
    coalesce(inspector_is_active, true),
    nullif(trim(inspector_signature_path), ''),
    nullif(trim(inspector_signature_filename), ''),
    nullif(trim(inspector_signature_content_type), '')
  )
  on conflict (organization_id, user_id) do update set
    license_number = excluded.license_number,
    license_expires_on = excluded.license_expires_on,
    is_active = excluded.is_active,
    signature_path = coalesce(excluded.signature_path, inspector_profiles.signature_path),
    signature_filename = coalesce(excluded.signature_filename, inspector_profiles.signature_filename),
    signature_content_type = coalesce(excluded.signature_content_type, inspector_profiles.signature_content_type);
end;
$$;

revoke all on function public.create_contact(
  uuid, text, text, text, text, text, text, text, text, text,
  text, text, text, text, text, text, text
) from public;
revoke all on function public.update_contact(
  uuid, uuid, text, text, text, text, text, text, text, text,
  text, text, text, text, text, text, text, text
) from public;
revoke all on function public.create_inspection_job(
  uuid, text, text, text, text, text, text, text, timestamptz,
  uuid, text, text, text, uuid, boolean
) from public;
revoke all on function public.update_inspection_job(
  uuid, uuid, text, text, text, text, text, text, text, timestamptz,
  uuid, text, text, text, text, uuid, boolean
) from public;
revoke all on function public.save_inspector_profile(
  uuid, uuid, text, date, boolean, text, text, text
) from public;

grant execute on function public.create_contact(
  uuid, text, text, text, text, text, text, text, text, text,
  text, text, text, text, text, text, text
) to authenticated;
grant execute on function public.update_contact(
  uuid, uuid, text, text, text, text, text, text, text, text,
  text, text, text, text, text, text, text, text
) to authenticated;
grant execute on function public.create_inspection_job(
  uuid, text, text, text, text, text, text, text, timestamptz,
  uuid, text, text, text, uuid, boolean
) to authenticated;
grant execute on function public.update_inspection_job(
  uuid, uuid, text, text, text, text, text, text, text, timestamptz,
  uuid, text, text, text, text, uuid, boolean
) to authenticated;
grant execute on function public.save_inspector_profile(
  uuid, uuid, text, date, boolean, text, text, text
) to authenticated;

commit;
