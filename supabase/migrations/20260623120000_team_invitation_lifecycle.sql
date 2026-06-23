begin;

alter table public.organization_invitations
  add column if not exists expires_at timestamptz,
  add column if not exists last_sent_at timestamptz,
  add column if not exists send_count integer not null default 0,
  add column if not exists recipient_name text;

update public.organization_invitations
set expires_at = coalesce(expires_at, created_at + interval '24 hours');

alter table public.organization_invitations
  alter column expires_at set default (now() + interval '24 hours'),
  alter column expires_at set not null;

alter table public.organization_invitations
  drop constraint if exists organization_invitations_status_check;

alter table public.organization_invitations
  add constraint organization_invitations_status_check
  check (status in ('pending', 'accepted', 'revoked', 'failed', 'expired'));

update public.organization_invitations
set status = 'expired'
where status = 'pending'
  and expires_at <= now();

create or replace function public.create_organization_invitation(
  target_organization_id uuid,
  invitation_email text,
  invitation_role public.membership_role,
  target_inspector_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_email text := lower(trim(invitation_email));
  existing_invitation_id uuid;
  new_invitation_id uuid;
begin
  if not public.has_organization_role(
    target_organization_id,
    array['administrator']::public.membership_role[]
  ) then
    raise exception 'Administrator access required';
  end if;

  if nullif(normalized_email, '') is null then
    raise exception 'Invitation email is required';
  end if;

  if target_inspector_id is not null and invitation_role <> 'inspector' then
    raise exception 'Only inspector invitations may link an inspector profile';
  end if;

  if target_inspector_id is not null and not exists (
    select 1
    from public.inspectors inspector
    where inspector.id = target_inspector_id
      and inspector.organization_id = target_organization_id
  ) then
    raise exception 'Inspector not found';
  end if;

  if exists (
    select 1
    from public.organization_memberships membership
    join public.profiles profile on profile.id = membership.user_id
    where membership.organization_id = target_organization_id
      and membership.status = 'active'
      and lower(profile.email) = normalized_email
  ) then
    raise exception 'This person already has active access';
  end if;

  update public.organization_invitations
  set status = 'expired'
  where organization_id = target_organization_id
    and lower(email) = normalized_email
    and status = 'pending'
    and expires_at <= now();

  select invitation.id into existing_invitation_id
  from public.organization_invitations invitation
  where invitation.organization_id = target_organization_id
    and lower(invitation.email) = normalized_email
    and invitation.status = 'pending'
  order by invitation.created_at desc
  limit 1
  for update;

  if existing_invitation_id is not null then
    update public.organization_invitations
    set
      inspector_id = target_inspector_id,
      role = invitation_role,
      invited_by = (select auth.uid()),
      expires_at = now() + interval '24 hours',
      updated_at = now()
    where id = existing_invitation_id;

    return existing_invitation_id;
  end if;

  insert into public.organization_invitations (
    organization_id,
    inspector_id,
    email,
    role,
    invited_by,
    expires_at
  )
  values (
    target_organization_id,
    target_inspector_id,
    normalized_email,
    invitation_role,
    (select auth.uid()),
    now() + interval '24 hours'
  )
  returning id into new_invitation_id;

  return new_invitation_id;
end;
$$;

create or replace function public.mark_organization_invitation_sent(
  target_organization_id uuid,
  target_invitation_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.has_organization_role(
    target_organization_id,
    array['administrator']::public.membership_role[]
  ) then
    raise exception 'Administrator access required';
  end if;

  update public.organization_invitations
  set
    status = 'pending',
    last_sent_at = now(),
    send_count = send_count + 1,
    expires_at = now() + interval '24 hours',
    updated_at = now()
  where id = target_invitation_id
    and organization_id = target_organization_id;

  if not found then
    raise exception 'Invitation not found';
  end if;
end;
$$;

create or replace function public.revoke_organization_invitation(
  target_organization_id uuid,
  target_invitation_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.has_organization_role(
    target_organization_id,
    array['administrator']::public.membership_role[]
  ) then
    raise exception 'Administrator access required';
  end if;

  update public.organization_invitations
  set
    status = 'revoked',
    revoked_at = now(),
    updated_at = now()
  where id = target_invitation_id
    and organization_id = target_organization_id
    and status in ('pending', 'expired', 'failed');

  if not found then
    raise exception 'Invitation cannot be revoked';
  end if;
end;
$$;

create or replace function public.get_current_invitation()
returns table (
  invitation_id uuid,
  organization_id uuid,
  organization_name text,
  invitation_email text,
  invitation_role public.membership_role,
  invitation_status text,
  expires_at timestamptz,
  inspector_id uuid
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    invitation.id,
    invitation.organization_id,
    organization.name,
    invitation.email,
    invitation.role,
    case
      when invitation.status = 'pending' and invitation.expires_at <= now() then 'expired'
      else invitation.status
    end,
    invitation.expires_at,
    invitation.inspector_id
  from public.organization_invitations invitation
  join public.organizations organization on organization.id = invitation.organization_id
  where invitation.email = lower(coalesce((select auth.jwt() ->> 'email'), ''))
    and (
      invitation.auth_user_id is null
      or invitation.auth_user_id = (select auth.uid())
    )
    and invitation.status in ('pending', 'expired')
  order by invitation.created_at desc
  limit 1;
$$;

create or replace function public.activate_current_invitation()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  current_email text := lower(coalesce((select auth.jwt() ->> 'email'), ''));
  invitation_record public.organization_invitations%rowtype;
begin
  if current_user_id is null or current_email = '' then
    raise exception 'Authentication required';
  end if;

  select invitation.* into invitation_record
  from public.organization_invitations invitation
  where invitation.email = current_email
    and invitation.status = 'pending'
    and invitation.expires_at > now()
    and (
      invitation.auth_user_id is null
      or invitation.auth_user_id = current_user_id
    )
  order by invitation.created_at desc
  limit 1
  for update;

  if not found then
    raise exception 'No active invitation was found for this account';
  end if;

  insert into public.organization_memberships (
    organization_id,
    user_id,
    role,
    status
  )
  values (
    invitation_record.organization_id,
    current_user_id,
    invitation_record.role,
    'active'
  )
  on conflict (organization_id, user_id) do update set
    role = excluded.role,
    status = 'active',
    updated_at = now();

  update public.organization_invitations
  set
    status = 'accepted',
    auth_user_id = current_user_id,
    accepted_at = now(),
    updated_at = now()
  where id = invitation_record.id;

  if invitation_record.inspector_id is not null then
    update public.inspectors
    set linked_user_id = current_user_id
    where id = invitation_record.inspector_id
      and organization_id = invitation_record.organization_id;
  end if;

  return jsonb_build_object(
    'invitationId', invitation_record.id,
    'organizationId', invitation_record.organization_id,
    'role', invitation_record.role
  );
end;
$$;

create or replace function public.accept_current_invitation()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.activate_current_invitation();
end;
$$;

create or replace function public.update_organization_member_access(
  target_organization_id uuid,
  target_user_id uuid,
  target_role public.membership_role,
  target_status text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  existing_role public.membership_role;
  existing_status text;
  active_admin_count integer;
begin
  if not public.has_organization_role(
    target_organization_id,
    array['administrator']::public.membership_role[]
  ) then
    raise exception 'Administrator access required';
  end if;

  if target_status not in ('active', 'suspended') then
    raise exception 'Invalid membership status';
  end if;

  select membership.role, membership.status
  into existing_role, existing_status
  from public.organization_memberships membership
  where membership.organization_id = target_organization_id
    and membership.user_id = target_user_id
  for update;

  if not found then
    raise exception 'Team member not found';
  end if;

  if target_user_id = current_user_id
    and (target_role <> 'administrator' or target_status <> 'active') then
    raise exception 'You cannot remove your own administrator access';
  end if;

  if existing_role = 'administrator'
    and existing_status = 'active'
    and (target_role <> 'administrator' or target_status <> 'active') then
    select count(*) into active_admin_count
    from public.organization_memberships membership
    where membership.organization_id = target_organization_id
      and membership.role = 'administrator'
      and membership.status = 'active';

    if active_admin_count <= 1 then
      raise exception 'The organization must keep at least one active administrator';
    end if;
  end if;

  update public.organization_memberships
  set
    role = target_role,
    status = target_status,
    updated_at = now()
  where organization_id = target_organization_id
    and user_id = target_user_id;
end;
$$;

revoke all on function public.mark_organization_invitation_sent(uuid, uuid) from public;
revoke all on function public.revoke_organization_invitation(uuid, uuid) from public;
revoke all on function public.get_current_invitation() from public;
revoke all on function public.activate_current_invitation() from public;
revoke all on function public.update_organization_member_access(
  uuid,
  uuid,
  public.membership_role,
  text
) from public;

grant execute on function public.mark_organization_invitation_sent(uuid, uuid) to authenticated;
grant execute on function public.revoke_organization_invitation(uuid, uuid) to authenticated;
grant execute on function public.get_current_invitation() to authenticated;
grant execute on function public.activate_current_invitation() to authenticated;
grant execute on function public.update_organization_member_access(
  uuid,
  uuid,
  public.membership_role,
  text
) to authenticated;

commit;
