begin;

create unique index if not exists job_parties_contact_role_unique
on public.job_parties (inspection_job_id, role, contact_id)
where contact_id is not null;

create unique index if not exists job_parties_primary_role_unique
on public.job_parties (inspection_job_id, role)
where is_primary;

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
  contact_notes text
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  contact_company_id uuid;
  new_contact_id uuid;
begin
  if not public.is_organization_member(target_organization_id) then
    raise exception 'Active organization membership required';
  end if;

  if trim(coalesce(contact_first_name, '') || ' ' || coalesce(contact_last_name, '')) = '' then
    raise exception 'Contact name is required';
  end if;

  if nullif(trim(contact_company_name), '') is not null then
    select company.id
    into contact_company_id
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

  insert into public.contacts (
    organization_id,
    company_id,
    first_name,
    last_name,
    email,
    secondary_email,
    mobile_phone,
    home_phone,
    job_title,
    notes
  )
  values (
    target_organization_id,
    contact_company_id,
    trim(coalesce(contact_first_name, '')),
    trim(coalesce(contact_last_name, '')),
    nullif(lower(trim(contact_email)), ''),
    nullif(lower(trim(contact_secondary_email)), ''),
    nullif(trim(contact_mobile_phone), ''),
    nullif(trim(contact_home_phone), ''),
    nullif(trim(contact_job_title), ''),
    nullif(trim(contact_notes), '')
  )
  returning id into new_contact_id;

  return new_contact_id;
end;
$$;

create or replace function public.assign_contact_to_job(
  target_organization_id uuid,
  target_job_id uuid,
  target_contact_id uuid,
  party_role text,
  make_primary boolean default false,
  receive_report boolean default false
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  existing_party_id uuid;
begin
  if not public.is_organization_member(target_organization_id) then
    raise exception 'Active organization membership required';
  end if;

  if party_role not in (
    'ordered_by',
    'property_owner',
    'report_recipient',
    'party_of_interest',
    'signer'
  ) then
    raise exception 'Invalid job party role';
  end if;

  if not exists (
    select 1
    from public.inspection_jobs job
    where job.id = target_job_id
      and job.organization_id = target_organization_id
  ) then
    raise exception 'Inspection job not found';
  end if;

  if not exists (
    select 1
    from public.contacts contact
    where contact.id = target_contact_id
      and contact.organization_id = target_organization_id
  ) then
    raise exception 'Contact not found';
  end if;

  if make_primary then
    update public.job_parties
    set is_primary = false
    where inspection_job_id = target_job_id
      and role = party_role
      and is_primary;
  end if;

  select party.id
  into existing_party_id
  from public.job_parties party
  where party.inspection_job_id = target_job_id
    and party.role = party_role
    and party.contact_id = target_contact_id
  limit 1;

  if existing_party_id is null then
    insert into public.job_parties (
      organization_id,
      inspection_job_id,
      role,
      contact_id,
      is_primary,
      receive_report_by_default
    )
    values (
      target_organization_id,
      target_job_id,
      party_role,
      target_contact_id,
      make_primary,
      receive_report or party_role = 'report_recipient'
    )
    returning id into existing_party_id;
  else
    update public.job_parties
    set
      is_primary = make_primary,
      receive_report_by_default = receive_report or party_role = 'report_recipient'
    where id = existing_party_id;
  end if;

  return existing_party_id;
end;
$$;

create or replace function public.remove_job_party(
  target_organization_id uuid,
  target_party_id uuid
)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if not public.is_organization_member(target_organization_id) then
    raise exception 'Active organization membership required';
  end if;

  delete from public.job_parties
  where id = target_party_id
    and organization_id = target_organization_id;
end;
$$;

revoke all on function public.create_contact(
  uuid, text, text, text, text, text, text, text, text, text
) from public;
revoke all on function public.assign_contact_to_job(
  uuid, uuid, uuid, text, boolean, boolean
) from public;
revoke all on function public.remove_job_party(uuid, uuid) from public;

grant execute on function public.create_contact(
  uuid, text, text, text, text, text, text, text, text, text
) to authenticated;
grant execute on function public.assign_contact_to_job(
  uuid, uuid, uuid, text, boolean, boolean
) to authenticated;
grant execute on function public.remove_job_party(uuid, uuid) to authenticated;

commit;
