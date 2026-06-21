begin;

create table public.inspectors (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  linked_user_id uuid references public.profiles(id) on delete set null,
  full_name text not null check (length(trim(full_name)) > 0),
  email text,
  phone text,
  license_number text,
  license_expires_on date,
  signature_path text,
  signature_filename text,
  signature_content_type text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, linked_user_id)
);

insert into public.inspectors (
  id,
  organization_id,
  linked_user_id,
  full_name,
  email,
  phone,
  license_number,
  license_expires_on,
  signature_path,
  signature_filename,
  signature_content_type,
  is_active,
  created_at,
  updated_at
)
select
  inspector.user_id,
  inspector.organization_id,
  inspector.user_id,
  coalesce(nullif(trim(profile.full_name), ''), profile.email, 'Inspector'),
  profile.email,
  profile.phone,
  inspector.license_number,
  inspector.license_expires_on,
  inspector.signature_path,
  inspector.signature_filename,
  inspector.signature_content_type,
  inspector.is_active,
  inspector.created_at,
  inspector.updated_at
from public.inspector_profiles inspector
join public.profiles profile on profile.id = inspector.user_id
on conflict (id) do nothing;

alter table public.inspection_jobs
  drop constraint if exists inspection_jobs_inspected_by_profile_fkey;

alter table public.inspection_jobs
  add constraint inspection_jobs_inspected_by_inspector_fkey
  foreign key (organization_id, inspected_by_id)
  references public.inspectors(organization_id, id)
  on delete restrict;

create or replace function public.sync_legacy_inspector_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.inspectors (
    id,
    organization_id,
    linked_user_id,
    full_name,
    email,
    phone,
    license_number,
    license_expires_on,
    signature_path,
    signature_filename,
    signature_content_type,
    is_active
  )
  select
    new.user_id,
    new.organization_id,
    new.user_id,
    coalesce(nullif(trim(profile.full_name), ''), profile.email, 'Inspector'),
    profile.email,
    profile.phone,
    new.license_number,
    new.license_expires_on,
    new.signature_path,
    new.signature_filename,
    new.signature_content_type,
    new.is_active
  from public.profiles profile
  where profile.id = new.user_id
  on conflict (id) do update set
    license_number = excluded.license_number,
    license_expires_on = excluded.license_expires_on,
    signature_path = excluded.signature_path,
    signature_filename = excluded.signature_filename,
    signature_content_type = excluded.signature_content_type,
    is_active = excluded.is_active;

  return new;
end;
$$;

drop trigger if exists inspector_profiles_sync_independent on public.inspector_profiles;
create trigger inspector_profiles_sync_independent
after insert or update on public.inspector_profiles
for each row execute procedure public.sync_legacy_inspector_profile();

create trigger inspectors_set_updated_at
before update on public.inspectors
for each row execute procedure public.set_updated_at();

alter table public.inspectors enable row level security;

create policy inspectors_org_select
on public.inspectors for select to authenticated
using (public.is_organization_member(organization_id));

create policy inspectors_manager_write
on public.inspectors for all to authenticated
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

grant select, insert, update, delete on public.inspectors to authenticated;

create table public.organization_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  inspector_id uuid references public.inspectors(id) on delete set null,
  email text not null,
  role public.membership_role not null,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'revoked', 'failed')),
  auth_user_id uuid references public.profiles(id) on delete set null,
  invited_by uuid references public.profiles(id) on delete set null,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index organization_invitations_pending_email_unique
on public.organization_invitations (organization_id, lower(email))
where status = 'pending';

create index organization_invitations_org_status_idx
on public.organization_invitations (organization_id, status, created_at desc);

create trigger organization_invitations_set_updated_at
before update on public.organization_invitations
for each row execute procedure public.set_updated_at();

alter table public.organization_invitations enable row level security;

create policy invitations_manager_access
on public.organization_invitations for all to authenticated
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

grant select, insert, update, delete on public.organization_invitations to authenticated;

create or replace function public.create_inspector(
  target_organization_id uuid,
  inspector_full_name text,
  inspector_email text,
  inspector_phone text,
  inspector_license_number text,
  inspector_license_expires_on date,
  inspector_is_active boolean
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  new_inspector_id uuid;
begin
  if not public.has_organization_role(
    target_organization_id,
    array['administrator', 'manager']::public.membership_role[]
  ) then
    raise exception 'Administrator or manager access required';
  end if;

  if nullif(trim(inspector_full_name), '') is null then
    raise exception 'Inspector name is required';
  end if;

  insert into public.inspectors (
    organization_id,
    full_name,
    email,
    phone,
    license_number,
    license_expires_on,
    is_active
  )
  values (
    target_organization_id,
    trim(inspector_full_name),
    nullif(lower(trim(inspector_email)), ''),
    nullif(trim(inspector_phone), ''),
    nullif(trim(inspector_license_number), ''),
    inspector_license_expires_on,
    coalesce(inspector_is_active, true)
  )
  returning id into new_inspector_id;

  return new_inspector_id;
end;
$$;

create or replace function public.update_inspector(
  target_organization_id uuid,
  target_inspector_id uuid,
  inspector_full_name text,
  inspector_email text,
  inspector_phone text,
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

  update public.inspectors
  set
    full_name = trim(inspector_full_name),
    email = nullif(lower(trim(inspector_email)), ''),
    phone = nullif(trim(inspector_phone), ''),
    license_number = nullif(trim(inspector_license_number), ''),
    license_expires_on = inspector_license_expires_on,
    is_active = coalesce(inspector_is_active, true),
    signature_path = coalesce(nullif(trim(inspector_signature_path), ''), signature_path),
    signature_filename = coalesce(nullif(trim(inspector_signature_filename), ''), signature_filename),
    signature_content_type = coalesce(nullif(trim(inspector_signature_content_type), ''), signature_content_type)
  where id = target_inspector_id
    and organization_id = target_organization_id;

  if not found then
    raise exception 'Inspector not found';
  end if;
end;
$$;

create or replace function public.create_organization_invitation(
  target_organization_id uuid,
  invitation_email text,
  invitation_role public.membership_role,
  target_inspector_id uuid default null
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  new_invitation_id uuid;
begin
  if not public.has_organization_role(
    target_organization_id,
    array['administrator']::public.membership_role[]
  ) then
    raise exception 'Administrator access required';
  end if;

  if nullif(lower(trim(invitation_email)), '') is null then
    raise exception 'Invitation email is required';
  end if;

  if target_inspector_id is not null and invitation_role <> 'inspector' then
    raise exception 'Only inspector invitations may link an inspector profile';
  end if;

  if target_inspector_id is not null and not exists (
    select 1 from public.inspectors inspector
    where inspector.id = target_inspector_id
      and inspector.organization_id = target_organization_id
  ) then
    raise exception 'Inspector not found';
  end if;

  insert into public.organization_invitations (
    organization_id,
    inspector_id,
    email,
    role,
    invited_by
  )
  values (
    target_organization_id,
    target_inspector_id,
    lower(trim(invitation_email)),
    invitation_role,
    (select auth.uid())
  )
  returning id into new_invitation_id;

  return new_invitation_id;
end;
$$;

create or replace function public.accept_current_invitation()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  current_email text := lower(coalesce((select auth.jwt() ->> 'email'), ''));
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  update public.organization_memberships membership
  set status = 'active'
  from public.organization_invitations invitation
  where invitation.auth_user_id = current_user_id
    and invitation.email = current_email
    and invitation.status = 'pending'
    and membership.organization_id = invitation.organization_id
    and membership.user_id = current_user_id;

  update public.organization_invitations
  set
    status = 'accepted',
    accepted_at = now()
  where auth_user_id = current_user_id
    and email = current_email
    and status = 'pending';
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  invitation_id uuid;
  invitation_record public.organization_invitations%rowtype;
begin
  insert into public.profiles (id, full_name, email, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    new.email,
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do update set
    email = excluded.email,
    full_name = coalesce(public.profiles.full_name, excluded.full_name);

  begin
    invitation_id := nullif(new.raw_user_meta_data ->> 'tig360_invitation_id', '')::uuid;
  exception when invalid_text_representation then
    invitation_id := null;
  end;

  if invitation_id is not null then
    select * into invitation_record
    from public.organization_invitations invitation
    where invitation.id = invitation_id
      and invitation.status = 'pending'
      and invitation.email = lower(new.email);

    if found then
      insert into public.organization_memberships (
        organization_id,
        user_id,
        role,
        status
      )
      values (
        invitation_record.organization_id,
        new.id,
        invitation_record.role,
        'invited'
      )
      on conflict (organization_id, user_id) do update set
        role = excluded.role,
        status = 'invited';

      update public.organization_invitations
      set auth_user_id = new.id
      where id = invitation_record.id;

      if invitation_record.inspector_id is not null then
        update public.inspectors
        set linked_user_id = new.id
        where id = invitation_record.inspector_id
          and organization_id = invitation_record.organization_id;
      end if;
    end if;
  end if;

  return new;
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
    select 1 from public.inspectors inspector
    where inspector.organization_id = target_organization_id
      and inspector.id = job_inspected_by_id
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
    select 1 from public.inspectors inspector
    where inspector.organization_id = target_organization_id
      and inspector.id = job_inspected_by_id
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

revoke all on function public.create_inspector(uuid, text, text, text, text, date, boolean) from public;
revoke all on function public.update_inspector(uuid, uuid, text, text, text, text, date, boolean, text, text, text) from public;
revoke all on function public.create_organization_invitation(uuid, text, public.membership_role, uuid) from public;
revoke all on function public.accept_current_invitation() from public;

grant execute on function public.create_inspector(uuid, text, text, text, text, date, boolean) to authenticated;
grant execute on function public.update_inspector(uuid, uuid, text, text, text, text, date, boolean, text, text, text) to authenticated;
grant execute on function public.create_organization_invitation(uuid, text, public.membership_role, uuid) to authenticated;
grant execute on function public.accept_current_invitation() to authenticated;

commit;
