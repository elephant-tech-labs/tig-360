-- Report review, immutable PDF versions, approval, and delivery drafts.

alter table public.document_versions
  add column if not exists approval_status text not null default 'pending'
    check (approval_status in ('pending', 'approved', 'rejected')),
  add column if not exists approved_by uuid references public.profiles(id) on delete set null,
  add column if not exists approved_at timestamptz,
  add column if not exists approval_note text;

create index if not exists document_versions_document_created_idx
on public.document_versions(document_id, version desc);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'report-pdfs',
  'report-pdfs',
  false,
  52428800,
  array['application/pdf']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists report_pdfs_select on storage.objects;
create policy report_pdfs_select
on storage.objects for select to authenticated
using (
  bucket_id = 'report-pdfs'
  and public.is_organization_member(((storage.foldername(name))[1])::uuid)
);

drop policy if exists report_pdfs_insert on storage.objects;
create policy report_pdfs_insert
on storage.objects for insert to authenticated
with check (
  bucket_id = 'report-pdfs'
  and public.is_organization_member(((storage.foldername(name))[1])::uuid)
);

drop policy if exists report_pdfs_delete on storage.objects;
create policy report_pdfs_delete
on storage.objects for delete to authenticated
using (
  bucket_id = 'report-pdfs'
  and public.has_organization_role(
    ((storage.foldername(name))[1])::uuid,
    array['administrator', 'manager']::public.membership_role[]
  )
);

create or replace function public.begin_inspection_report_version(
  target_organization_id uuid,
  target_job_id uuid,
  report_snapshot jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  report_document_id uuid;
  report_version_id uuid;
  next_version integer;
  report_job_number bigint;
begin
  if not public.has_organization_role(
    target_organization_id,
    array['administrator', 'manager', 'office_coordinator', 'inspector']::public.membership_role[]
  ) then
    raise exception 'You do not have permission to generate reports.';
  end if;

  select job_number into report_job_number
  from public.inspection_jobs
  where id = target_job_id and organization_id = target_organization_id;

  if report_job_number is null then
    raise exception 'Inspection job was not found.';
  end if;

  perform pg_advisory_xact_lock(hashtext(target_job_id::text || ':inspection-report'));

  insert into public.documents (
    organization_id,
    inspection_job_id,
    kind,
    title
  )
  values (
    target_organization_id,
    target_job_id,
    'inspection_report',
    'Inspection Report #' || report_job_number
  )
  on conflict (inspection_job_id, kind) do update set
    title = excluded.title
  returning id into report_document_id;

  select coalesce(max(version), 0) + 1 into next_version
  from public.document_versions
  where document_id = report_document_id;

  insert into public.document_versions (
    organization_id,
    document_id,
    version,
    status,
    snapshot,
    generated_by
  )
  values (
    target_organization_id,
    report_document_id,
    next_version,
    'generating',
    coalesce(report_snapshot, '{}'::jsonb),
    auth.uid()
  )
  returning id into report_version_id;

  update public.inspection_jobs
  set status = 'in_review'
  where id = target_job_id;

  insert into public.audit_events (
    organization_id,
    actor_user_id,
    action,
    entity_type,
    entity_id,
    summary,
    changes
  )
  values (
    target_organization_id,
    auth.uid(),
    'report_generation_started',
    'document_version',
    report_version_id,
    'Inspection report version ' || next_version || ' generation started.',
    jsonb_build_object('jobId', target_job_id, 'version', next_version)
  );

  return jsonb_build_object(
    'documentId', report_document_id,
    'versionId', report_version_id,
    'version', next_version
  );
end;
$$;

create or replace function public.complete_inspection_report_version(
  target_organization_id uuid,
  target_job_id uuid,
  target_version_id uuid,
  storage_path text,
  original_name text,
  file_size bigint,
  file_checksum text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  report_asset_id uuid;
begin
  if not public.is_organization_member(target_organization_id) then
    raise exception 'You do not have access to this organization.';
  end if;

  if not exists (
    select 1
    from public.document_versions version_row
    join public.documents document_row on document_row.id = version_row.document_id
    where version_row.id = target_version_id
      and version_row.organization_id = target_organization_id
      and document_row.inspection_job_id = target_job_id
      and document_row.kind = 'inspection_report'
  ) then
    raise exception 'Report version was not found.';
  end if;

  insert into public.assets (
    organization_id,
    inspection_job_id,
    kind,
    storage_provider,
    provider_file_id,
    original_filename,
    content_type,
    size_bytes,
    checksum_sha256,
    status,
    created_by,
    metadata
  )
  values (
    target_organization_id,
    target_job_id,
    'report_pdf',
    'supabase',
    storage_path,
    original_name,
    'application/pdf',
    file_size,
    file_checksum,
    'ready',
    auth.uid(),
    jsonb_build_object('documentVersionId', target_version_id)
  )
  returning id into report_asset_id;

  update public.document_versions
  set
    status = 'ready',
    asset_id = report_asset_id,
    checksum_sha256 = file_checksum,
    generated_at = now(),
    failure_message = null
  where id = target_version_id;

  insert into public.audit_events (
    organization_id,
    actor_user_id,
    action,
    entity_type,
    entity_id,
    summary,
    changes
  )
  values (
    target_organization_id,
    auth.uid(),
    'report_generated',
    'document_version',
    target_version_id,
    'Inspection report PDF generated.',
    jsonb_build_object('assetId', report_asset_id, 'storagePath', storage_path)
  );

  return report_asset_id;
end;
$$;

create or replace function public.fail_inspection_report_version(
  target_organization_id uuid,
  target_version_id uuid,
  failure_text text
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

  update public.document_versions
  set status = 'failed', failure_message = left(coalesce(failure_text, 'Report generation failed.'), 2000)
  where id = target_version_id and organization_id = target_organization_id;
end;
$$;

create or replace function public.approve_inspection_report_version(
  target_organization_id uuid,
  target_job_id uuid,
  target_version_id uuid,
  approval_comment text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.has_organization_role(
    target_organization_id,
    array['administrator', 'manager']::public.membership_role[]
  ) then
    raise exception 'Only an administrator or manager can approve a report.';
  end if;

  if not exists (
    select 1
    from public.document_versions version_row
    join public.documents document_row on document_row.id = version_row.document_id
    where version_row.id = target_version_id
      and version_row.organization_id = target_organization_id
      and version_row.status = 'ready'
      and document_row.inspection_job_id = target_job_id
      and document_row.kind = 'inspection_report'
  ) then
    raise exception 'A ready inspection report version is required.';
  end if;

  update public.document_versions
  set
    approval_status = 'approved',
    approved_by = auth.uid(),
    approved_at = now(),
    approval_note = nullif(trim(approval_comment), '')
  where id = target_version_id;

  update public.inspection_jobs set status = 'ready' where id = target_job_id;

  insert into public.audit_events (
    organization_id,
    actor_user_id,
    action,
    entity_type,
    entity_id,
    summary,
    changes
  )
  values (
    target_organization_id,
    auth.uid(),
    'report_approved',
    'document_version',
    target_version_id,
    'Inspection report version approved.',
    jsonb_build_object('jobId', target_job_id, 'note', nullif(trim(approval_comment), ''))
  );
end;
$$;

create or replace function public.create_report_delivery_draft(
  target_organization_id uuid,
  target_job_id uuid,
  target_version_id uuid,
  email_subject text,
  email_message text,
  recipient_items jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  saved_delivery_id uuid;
  recipient_item jsonb;
begin
  if not public.has_organization_role(
    target_organization_id,
    array['administrator', 'manager', 'office_coordinator']::public.membership_role[]
  ) then
    raise exception 'You do not have permission to prepare report delivery.';
  end if;

  if not exists (
    select 1
    from public.document_versions version_row
    join public.documents document_row on document_row.id = version_row.document_id
    where version_row.id = target_version_id
      and version_row.organization_id = target_organization_id
      and version_row.status = 'ready'
      and version_row.approval_status = 'approved'
      and document_row.inspection_job_id = target_job_id
  ) then
    raise exception 'An approved report version is required.';
  end if;

  if jsonb_array_length(coalesce(recipient_items, '[]'::jsonb)) = 0 then
    raise exception 'Select at least one recipient.';
  end if;

  insert into public.deliveries (
    organization_id,
    inspection_job_id,
    document_version_id,
    status,
    subject,
    message_body
  )
  values (
    target_organization_id,
    target_job_id,
    target_version_id,
    'draft',
    trim(email_subject),
    trim(email_message)
  )
  returning id into saved_delivery_id;

  for recipient_item in
    select value from jsonb_array_elements(recipient_items)
  loop
    insert into public.delivery_recipients (
      organization_id,
      delivery_id,
      contact_id,
      recipient_type,
      email,
      display_name
    )
    values (
      target_organization_id,
      saved_delivery_id,
      nullif(recipient_item->>'contactId', '')::uuid,
      coalesce(nullif(recipient_item->>'type', ''), 'to'),
      lower(trim(recipient_item->>'email')),
      nullif(trim(recipient_item->>'name'), '')
    );
  end loop;

  insert into public.audit_events (
    organization_id,
    actor_user_id,
    action,
    entity_type,
    entity_id,
    summary,
    changes
  )
  values (
    target_organization_id,
    auth.uid(),
    'report_delivery_draft_created',
    'delivery',
    saved_delivery_id,
    'Report delivery draft created.',
    jsonb_build_object('jobId', target_job_id, 'documentVersionId', target_version_id)
  );

  return saved_delivery_id;
end;
$$;

grant execute on function public.begin_inspection_report_version(uuid, uuid, jsonb) to authenticated;
grant execute on function public.complete_inspection_report_version(uuid, uuid, uuid, text, text, bigint, text) to authenticated;
grant execute on function public.fail_inspection_report_version(uuid, uuid, text) to authenticated;
grant execute on function public.approve_inspection_report_version(uuid, uuid, uuid, text) to authenticated;
grant execute on function public.create_report_delivery_draft(uuid, uuid, uuid, text, text, jsonb) to authenticated;
