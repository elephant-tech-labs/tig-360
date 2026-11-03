-- TIG-360 is a private, invitation-only workspace.
-- Preserve initial organization bootstrap for a fresh installation, but
-- disallow a verified, uninvited Auth user from creating an additional org.
create or replace function public.create_organization(
  organization_name text,
  organization_slug text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_organization_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;

  -- Prevent concurrent initial requests from creating two organizations.
  perform pg_catalog.pg_advisory_xact_lock(360, 1);

  if exists (select 1 from public.organizations) then
    raise exception 'Workspace setup is complete. Ask an administrator for an invitation.';
  end if;

  insert into public.organizations (name, slug)
  values (trim(organization_name), lower(trim(organization_slug)))
  returning id into new_organization_id;

  insert into public.organization_memberships (organization_id, user_id, role, status)
  values (new_organization_id, (select auth.uid()), 'administrator', 'active');

  return new_organization_id;
end;
$$;

-- Accept only a real, unexpired invitation linked to the signed-in email.
-- A previously suspended user must be re-enabled by an administrator rather
-- than reactivating themselves through a stale or repeated invite.
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
  existing_status text;
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
    raise exception 'No valid pending invitation was found for this account';
  end if;

  select membership.status into existing_status
  from public.organization_memberships membership
  where membership.organization_id = invitation_record.organization_id
    and membership.user_id = current_user_id
  for update;

  if existing_status = 'suspended' then
    raise exception 'Access is suspended. An administrator must restore it.';
  end if;

  insert into public.organization_memberships (
    organization_id, user_id, role, status
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

-- Prefer a usable pending invitation over a newer expired invitation.
-- This avoids a valid resend getting shadowed by stale invitation history.
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
  order by
    case when invitation.status = 'pending' and invitation.expires_at > now() then 0 else 1 end,
    invitation.created_at desc
  limit 1;
$$;

-- These invitation/organization RPCs are only intended for a verified
-- Supabase session. Remove existing direct anon and PUBLIC EXECUTE grants.
revoke execute on function public.create_organization(text, text) from public, anon;
revoke execute on function public.activate_current_invitation() from public, anon;
revoke execute on function public.accept_current_invitation() from public, anon;
revoke execute on function public.get_current_invitation() from public, anon;
revoke execute on function public.create_organization_invitation(
  uuid, text, public.membership_role, uuid
) from public, anon;
revoke execute on function public.mark_organization_invitation_sent(
  uuid, uuid
) from public, anon;

grant execute on function public.create_organization(text, text) to authenticated;
grant execute on function public.activate_current_invitation() to authenticated;
grant execute on function public.accept_current_invitation() to authenticated;
grant execute on function public.get_current_invitation() to authenticated;
grant execute on function public.create_organization_invitation(
  uuid, text, public.membership_role, uuid
) to authenticated;
grant execute on function public.mark_organization_invitation_sent(
  uuid, uuid
) to authenticated;
