-- Inspection photo workspace: private uploads, report controls, finding links,
-- capture workflow state, and non-destructive annotations.

alter table public.assets
  add column if not exists caption text,
  add column if not exists photo_category text,
  add column if not exists include_in_report boolean not null default true,
  add column if not exists is_cover boolean not null default false,
  add column if not exists sort_order integer not null default 0,
  add column if not exists annotation_json jsonb not null default '{"objects":[]}'::jsonb,
  add column if not exists annotated_render_path text,
  add column if not exists location_label text,
  add column if not exists uploaded_by_inspector_id uuid references public.inspectors(id) on delete set null;

alter table public.assets drop constraint if exists assets_photo_category_check;
alter table public.assets add constraint assets_photo_category_check
check (
  photo_category is null
  or photo_category in ('cover', 'inspection', 'finding_evidence', 'reference', 'internal')
);

create unique index if not exists assets_one_cover_per_job_idx
on public.assets(inspection_job_id)
where is_cover = true and status <> 'archived';

create index if not exists assets_photo_order_idx
on public.assets(inspection_job_id, sort_order, created_at)
where kind in ('property_photo', 'inspection_photo');

create table if not exists public.job_photo_states (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  inspection_job_id uuid not null references public.inspection_jobs(id) on delete cascade,
  status text not null default 'draft'
    check (status in ('draft', 'capture_in_progress', 'complete', 'not_required')),
  capture_started_at timestamptz,
  capture_finished_at timestamptz,
  started_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (inspection_job_id)
);

create trigger job_photo_states_set_updated_at
before update on public.job_photo_states
for each row execute procedure public.set_updated_at();

alter table public.job_photo_states enable row level security;
create policy job_photo_states_org_access on public.job_photo_states for all to authenticated
using (public.is_organization_member(organization_id))
with check (public.is_organization_member(organization_id));

grant select, insert, update, delete on public.job_photo_states to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'inspection-photos',
  'inspection-photos',
  false,
  26214400,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists inspection_photos_select on storage.objects;
create policy inspection_photos_select on storage.objects
for select to authenticated
using (
  bucket_id = 'inspection-photos'
  and public.is_organization_member(((storage.foldername(name))[1])::uuid)
);

drop policy if exists inspection_photos_insert on storage.objects;
create policy inspection_photos_insert on storage.objects
for insert to authenticated
with check (
  bucket_id = 'inspection-photos'
  and public.is_organization_member(((storage.foldername(name))[1])::uuid)
);

drop policy if exists inspection_photos_update on storage.objects;
create policy inspection_photos_update on storage.objects
for update to authenticated
using (
  bucket_id = 'inspection-photos'
  and public.is_organization_member(((storage.foldername(name))[1])::uuid)
)
with check (
  bucket_id = 'inspection-photos'
  and public.is_organization_member(((storage.foldername(name))[1])::uuid)
);

drop policy if exists inspection_photos_delete on storage.objects;
create policy inspection_photos_delete on storage.objects
for delete to authenticated
using (
  bucket_id = 'inspection-photos'
  and public.is_organization_member(((storage.foldername(name))[1])::uuid)
);

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
    and user_id = auth.uid()
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

create or replace function public.update_job_photo(
  target_organization_id uuid,
  target_asset_id uuid,
  photo_caption text,
  category_value text,
  report_included boolean,
  cover_value boolean,
  photo_location text,
  linked_finding_ids jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  job_id uuid;
  finding_item jsonb;
begin
  if not public.is_organization_member(target_organization_id) then
    raise exception 'You do not have access to this organization.';
  end if;
  if category_value not in ('cover', 'inspection', 'finding_evidence', 'reference', 'internal') then
    raise exception 'Invalid photo category.';
  end if;

  select inspection_job_id into job_id
  from public.assets
  where id = target_asset_id
    and organization_id = target_organization_id
    and kind in ('property_photo', 'inspection_photo')
    and status <> 'archived';

  if job_id is null then raise exception 'Photo was not found.'; end if;

  if cover_value then
    update public.assets set
      is_cover = false,
      photo_category = case when photo_category = 'cover' then 'inspection' else photo_category end
    where inspection_job_id = job_id and is_cover = true and id <> target_asset_id;
  end if;

  update public.assets set
    caption = nullif(trim(photo_caption), ''),
    photo_category = case when cover_value then 'cover' else category_value end,
    include_in_report = case when category_value = 'internal' then false else report_included end,
    is_cover = cover_value,
    location_label = nullif(trim(photo_location), '')
  where id = target_asset_id;

  delete from public.evidence_links
  where asset_id = target_asset_id and finding_id is not null;

  for finding_item in
    select value from jsonb_array_elements(coalesce(linked_finding_ids, '[]'::jsonb))
  loop
    if exists (
      select 1 from public.findings
      where id = (finding_item#>>'{}')::uuid
        and inspection_job_id = job_id
        and organization_id = target_organization_id
        and archived_at is null
    ) then
      insert into public.evidence_links (
        organization_id, asset_id, finding_id
      )
      values (
        target_organization_id, target_asset_id, (finding_item#>>'{}')::uuid
      );
    end if;
  end loop;
end;
$$;

create or replace function public.save_photo_annotation(
  target_organization_id uuid,
  target_asset_id uuid,
  annotation_data jsonb,
  render_path text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_organization_member(target_organization_id) then
    raise exception 'You do not have access to this organization.';
  end if;
  update public.assets set
    annotation_json = coalesce(annotation_data, '{"objects":[]}'::jsonb),
    annotated_render_path = nullif(render_path, '')
  where id = target_asset_id
    and organization_id = target_organization_id
    and kind in ('property_photo', 'inspection_photo');
  if not found then raise exception 'Photo was not found.'; end if;
end;
$$;

create or replace function public.set_job_photo_status(
  target_organization_id uuid,
  target_job_id uuid,
  status_value text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_organization_member(target_organization_id) then
    raise exception 'You do not have access to this organization.';
  end if;
  if status_value not in ('draft', 'capture_in_progress', 'complete', 'not_required') then
    raise exception 'Invalid photo workflow status.';
  end if;
  insert into public.job_photo_states (
    organization_id,
    inspection_job_id,
    status,
    capture_started_at,
    capture_finished_at,
    started_by,
    updated_by
  )
  values (
    target_organization_id,
    target_job_id,
    status_value,
    case when status_value = 'capture_in_progress' then now() end,
    case when status_value in ('complete', 'not_required') then now() end,
    case when status_value = 'capture_in_progress' then auth.uid() end,
    auth.uid()
  )
  on conflict (inspection_job_id) do update set
    status = excluded.status,
    capture_started_at = case
      when excluded.status = 'capture_in_progress'
        then coalesce(public.job_photo_states.capture_started_at, now())
      else public.job_photo_states.capture_started_at
    end,
    capture_finished_at = case
      when excluded.status in ('complete', 'not_required') then now()
      else null
    end,
    started_by = case
      when excluded.status = 'capture_in_progress'
        then coalesce(public.job_photo_states.started_by, auth.uid())
      else public.job_photo_states.started_by
    end,
    updated_by = auth.uid();
end;
$$;

create or replace function public.move_job_photo(
  target_organization_id uuid,
  target_asset_id uuid,
  movement text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_job_id uuid;
  current_order integer;
  swap_asset_id uuid;
  swap_order integer;
begin
  if not public.is_organization_member(target_organization_id) then
    raise exception 'You do not have access to this organization.';
  end if;
  if movement not in ('up', 'down') then raise exception 'Invalid movement.'; end if;

  select inspection_job_id, sort_order into current_job_id, current_order
  from public.assets
  where id = target_asset_id
    and organization_id = target_organization_id
    and kind in ('property_photo', 'inspection_photo')
    and status <> 'archived';

  if current_job_id is null then raise exception 'Photo was not found.'; end if;

  if movement = 'up' then
    select id, sort_order into swap_asset_id, swap_order
    from public.assets
    where inspection_job_id = current_job_id
      and kind in ('property_photo', 'inspection_photo')
      and status <> 'archived'
      and sort_order < current_order
    order by sort_order desc, created_at desc
    limit 1;
  else
    select id, sort_order into swap_asset_id, swap_order
    from public.assets
    where inspection_job_id = current_job_id
      and kind in ('property_photo', 'inspection_photo')
      and status <> 'archived'
      and sort_order > current_order
    order by sort_order, created_at
    limit 1;
  end if;

  if swap_asset_id is not null then
    update public.assets set sort_order = swap_order where id = target_asset_id;
    update public.assets set sort_order = current_order where id = swap_asset_id;
  end if;
end;
$$;

revoke all on function public.register_job_photo(uuid, uuid, text, text, text, bigint, timestamptz, text) from public;
revoke all on function public.update_job_photo(uuid, uuid, text, text, boolean, boolean, text, jsonb) from public;
revoke all on function public.save_photo_annotation(uuid, uuid, jsonb, text) from public;
revoke all on function public.set_job_photo_status(uuid, uuid, text) from public;
revoke all on function public.move_job_photo(uuid, uuid, text) from public;

grant execute on function public.register_job_photo(uuid, uuid, text, text, text, bigint, timestamptz, text) to authenticated;
grant execute on function public.update_job_photo(uuid, uuid, text, text, boolean, boolean, text, jsonb) to authenticated;
grant execute on function public.save_photo_annotation(uuid, uuid, jsonb, text) to authenticated;
grant execute on function public.set_job_photo_status(uuid, uuid, text) to authenticated;
grant execute on function public.move_job_photo(uuid, uuid, text) to authenticated;
