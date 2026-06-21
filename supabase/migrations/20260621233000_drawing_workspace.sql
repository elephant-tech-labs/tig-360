-- Native drawing workspace with autosaved drafts, finding-linked markers,
-- immutable published versions, and private report-ready PNG renders.

create table public.diagram_drafts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  inspection_job_id uuid not null references public.inspection_jobs(id) on delete cascade,
  source_json jsonb not null default '{"objects":[]}'::jsonb,
  status text not null default 'draft'
    check (status in ('draft', 'complete', 'skipped')),
  canvas_width integer not null default 1200 check (canvas_width between 400 and 4000),
  canvas_height integer not null default 780 check (canvas_height between 300 and 3000),
  latest_render_path text,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (inspection_job_id)
);

create table public.diagram_markers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  diagram_draft_id uuid not null references public.diagram_drafts(id) on delete cascade,
  marker_key text not null,
  finding_id uuid references public.findings(id) on delete set null,
  label_snapshot text not null,
  x numeric not null,
  y numeric not null,
  created_at timestamptz not null default now(),
  unique (diagram_draft_id, marker_key)
);

alter table public.diagrams
  add column if not exists render_path text,
  add column if not exists canvas_width integer not null default 1200,
  add column if not exists canvas_height integer not null default 780,
  add column if not exists status text not null default 'complete';

alter table public.diagrams drop constraint if exists diagrams_status_check;
alter table public.diagrams
  add constraint diagrams_status_check check (status in ('complete', 'skipped'));

create table public.diagram_version_markers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  diagram_id uuid not null references public.diagrams(id) on delete cascade,
  marker_key text not null,
  finding_id uuid references public.findings(id) on delete set null,
  label_snapshot text not null,
  x numeric not null,
  y numeric not null,
  created_at timestamptz not null default now(),
  unique (diagram_id, marker_key)
);

create index diagram_markers_draft_idx on public.diagram_markers(diagram_draft_id);
create index diagram_markers_finding_idx on public.diagram_markers(finding_id);
create index diagram_version_markers_diagram_idx on public.diagram_version_markers(diagram_id);

create trigger diagram_drafts_set_updated_at
before update on public.diagram_drafts
for each row execute procedure public.set_updated_at();

alter table public.diagram_drafts enable row level security;
alter table public.diagram_markers enable row level security;
alter table public.diagram_version_markers enable row level security;

create policy diagram_drafts_org_access on public.diagram_drafts for all to authenticated
using (public.is_organization_member(organization_id))
with check (public.is_organization_member(organization_id));

create policy diagram_markers_org_access on public.diagram_markers for all to authenticated
using (public.is_organization_member(organization_id))
with check (public.is_organization_member(organization_id));

create policy diagram_version_markers_org_access on public.diagram_version_markers for all to authenticated
using (public.is_organization_member(organization_id))
with check (public.is_organization_member(organization_id));

grant select, insert, update, delete on public.diagram_drafts to authenticated;
grant select, insert, update, delete on public.diagram_markers to authenticated;
grant select on public.diagram_version_markers to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'diagram-renders',
  'diagram-renders',
  false,
  15728640,
  array['image/png']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists diagram_renders_select on storage.objects;
create policy diagram_renders_select
on storage.objects for select to authenticated
using (
  bucket_id = 'diagram-renders'
  and public.is_organization_member(((storage.foldername(name))[1])::uuid)
);

drop policy if exists diagram_renders_insert on storage.objects;
create policy diagram_renders_insert
on storage.objects for insert to authenticated
with check (
  bucket_id = 'diagram-renders'
  and public.is_organization_member(((storage.foldername(name))[1])::uuid)
);

drop policy if exists diagram_renders_update on storage.objects;
create policy diagram_renders_update
on storage.objects for update to authenticated
using (
  bucket_id = 'diagram-renders'
  and public.is_organization_member(((storage.foldername(name))[1])::uuid)
)
with check (
  bucket_id = 'diagram-renders'
  and public.is_organization_member(((storage.foldername(name))[1])::uuid)
);

drop policy if exists diagram_renders_delete on storage.objects;
create policy diagram_renders_delete
on storage.objects for delete to authenticated
using (
  bucket_id = 'diagram-renders'
  and public.is_organization_member(((storage.foldername(name))[1])::uuid)
);

create or replace function public.save_diagram_draft(
  target_organization_id uuid,
  target_job_id uuid,
  diagram_source_json jsonb,
  marker_items jsonb,
  diagram_canvas_width integer,
  diagram_canvas_height integer,
  diagram_status text default 'draft'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  saved_draft_id uuid;
  marker_item jsonb;
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

  if diagram_status not in ('draft', 'complete', 'skipped') then
    raise exception 'Invalid diagram status.';
  end if;

  insert into public.diagram_drafts (
    organization_id,
    inspection_job_id,
    source_json,
    status,
    canvas_width,
    canvas_height,
    updated_by
  )
  values (
    target_organization_id,
    target_job_id,
    coalesce(diagram_source_json, '{"objects":[]}'::jsonb),
    diagram_status,
    diagram_canvas_width,
    diagram_canvas_height,
    auth.uid()
  )
  on conflict (inspection_job_id) do update set
    source_json = excluded.source_json,
    status = excluded.status,
    canvas_width = excluded.canvas_width,
    canvas_height = excluded.canvas_height,
    updated_by = auth.uid()
  returning id into saved_draft_id;

  delete from public.diagram_markers where diagram_draft_id = saved_draft_id;

  for marker_item in select value from jsonb_array_elements(coalesce(marker_items, '[]'::jsonb))
  loop
    insert into public.diagram_markers (
      organization_id,
      diagram_draft_id,
      marker_key,
      finding_id,
      label_snapshot,
      x,
      y
    )
    values (
      target_organization_id,
      saved_draft_id,
      marker_item->>'key',
      nullif(marker_item->>'findingId', '')::uuid,
      marker_item->>'label',
      (marker_item->>'x')::numeric,
      (marker_item->>'y')::numeric
    );
  end loop;

  return saved_draft_id;
end;
$$;

create or replace function public.publish_diagram_version(
  target_organization_id uuid,
  target_job_id uuid,
  diagram_source_json jsonb,
  marker_items jsonb,
  diagram_canvas_width integer,
  diagram_canvas_height integer,
  diagram_render_path text,
  diagram_status text default 'complete'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  next_version integer;
  saved_diagram_id uuid;
  saved_draft_id uuid;
  marker_item jsonb;
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

  if diagram_status not in ('complete', 'skipped') then
    raise exception 'Published diagrams must be complete or skipped.';
  end if;

  perform pg_advisory_xact_lock(hashtext(target_job_id::text));

  select coalesce(max(version), 0) + 1 into next_version
  from public.diagrams
  where inspection_job_id = target_job_id;

  insert into public.diagrams (
    organization_id,
    inspection_job_id,
    source_json,
    render_path,
    canvas_width,
    canvas_height,
    status,
    version,
    created_by
  )
  values (
    target_organization_id,
    target_job_id,
    coalesce(diagram_source_json, '{"objects":[]}'::jsonb),
    diagram_render_path,
    diagram_canvas_width,
    diagram_canvas_height,
    diagram_status,
    next_version,
    auth.uid()
  )
  returning id into saved_diagram_id;

  for marker_item in select value from jsonb_array_elements(coalesce(marker_items, '[]'::jsonb))
  loop
    insert into public.diagram_version_markers (
      organization_id,
      diagram_id,
      marker_key,
      finding_id,
      label_snapshot,
      x,
      y
    )
    values (
      target_organization_id,
      saved_diagram_id,
      marker_item->>'key',
      nullif(marker_item->>'findingId', '')::uuid,
      marker_item->>'label',
      (marker_item->>'x')::numeric,
      (marker_item->>'y')::numeric
    );
  end loop;

  insert into public.diagram_drafts (
    organization_id,
    inspection_job_id,
    source_json,
    status,
    canvas_width,
    canvas_height,
    latest_render_path,
    updated_by
  )
  values (
    target_organization_id,
    target_job_id,
    coalesce(diagram_source_json, '{"objects":[]}'::jsonb),
    diagram_status,
    diagram_canvas_width,
    diagram_canvas_height,
    diagram_render_path,
    auth.uid()
  )
  on conflict (inspection_job_id) do update set
    source_json = excluded.source_json,
    status = excluded.status,
    canvas_width = excluded.canvas_width,
    canvas_height = excluded.canvas_height,
    latest_render_path = excluded.latest_render_path,
    updated_by = auth.uid()
  returning id into saved_draft_id;

  delete from public.diagram_markers where diagram_draft_id = saved_draft_id;
  for marker_item in select value from jsonb_array_elements(coalesce(marker_items, '[]'::jsonb))
  loop
    insert into public.diagram_markers (
      organization_id,
      diagram_draft_id,
      marker_key,
      finding_id,
      label_snapshot,
      x,
      y
    )
    values (
      target_organization_id,
      saved_draft_id,
      marker_item->>'key',
      nullif(marker_item->>'findingId', '')::uuid,
      marker_item->>'label',
      (marker_item->>'x')::numeric,
      (marker_item->>'y')::numeric
    );
  end loop;

  return jsonb_build_object('diagramId', saved_diagram_id, 'version', next_version);
end;
$$;

revoke all on function public.save_diagram_draft(uuid, uuid, jsonb, jsonb, integer, integer, text) from public;
revoke all on function public.publish_diagram_version(uuid, uuid, jsonb, jsonb, integer, integer, text, text) from public;
grant execute on function public.save_diagram_draft(uuid, uuid, jsonb, jsonb, integer, integer, text) to authenticated;
grant execute on function public.publish_diagram_version(uuid, uuid, jsonb, jsonb, integer, integer, text, text) to authenticated;
