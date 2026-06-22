-- Correct the independent inspector linkage used by photo registration.

create or replace function public.register_job_photo(
  target_organization_id uuid,
  target_job_id uuid,
  storage_path text,
  original_name text,
  mime_type text,
  file_size bigint,
  captured_timestamp timestamptz default null,
  photo_location text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  saved_asset_id uuid;
  next_order integer;
  inspector_id uuid;
begin
  if not public.is_organization_member(target_organization_id) then
    raise exception 'You do not have access to this organization.';
  end if;
  if not exists (
    select 1 from public.inspection_jobs
    where id = target_job_id and organization_id = target_organization_id
  ) then
    raise exception 'Inspection job was not found.';
  end if;
  if storage_path not like target_organization_id::text || '/%' then
    raise exception 'Invalid photo storage path.';
  end if;

  select id into inspector_id
  from public.inspectors
  where organization_id = target_organization_id
    and linked_user_id = auth.uid()
  limit 1;

  select coalesce(max(sort_order), -1) + 1 into next_order
  from public.assets
  where inspection_job_id = target_job_id
    and kind in ('property_photo', 'inspection_photo')
    and status <> 'archived';

  insert into public.assets (
    organization_id,
    inspection_job_id,
    kind,
    storage_provider,
    provider_file_id,
    original_filename,
    content_type,
    size_bytes,
    status,
    photo_category,
    include_in_report,
    sort_order,
    location_label,
    captured_at,
    created_by,
    uploaded_by_inspector_id
  )
  values (
    target_organization_id,
    target_job_id,
    'inspection_photo',
    'supabase',
    storage_path,
    original_name,
    mime_type,
    file_size,
    'ready',
    'inspection',
    true,
    next_order,
    nullif(trim(photo_location), ''),
    coalesce(captured_timestamp, now()),
    auth.uid(),
    inspector_id
  )
  returning id into saved_asset_id;

  insert into public.job_photo_states (
    organization_id, inspection_job_id, status, updated_by
  )
  values (target_organization_id, target_job_id, 'draft', auth.uid())
  on conflict (inspection_job_id) do update set updated_by = auth.uid();

  return saved_asset_id;
end;
$$;

revoke all on function public.register_job_photo(
  uuid, uuid, text, text, text, bigint, timestamptz, text
) from public;

grant execute on function public.register_job_photo(
  uuid, uuid, text, text, text, bigint, timestamptz, text
) to authenticated;
