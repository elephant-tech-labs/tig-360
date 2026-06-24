begin;

alter table public.deliveries
  add column if not exists reply_to text,
  add column if not exists retry_of_delivery_id uuid references public.deliveries(id) on delete set null,
  add column if not exists attempt_count integer not null default 0,
  add column if not exists last_attempt_at timestamptz,
  add column if not exists idempotency_key text,
  add column if not exists crm_sync_status text not null default 'not_configured'
    check (crm_sync_status in ('not_configured', 'pending', 'synced', 'failed')),
  add column if not exists crm_activity_id text,
  add column if not exists crm_failure_message text;

create unique index if not exists deliveries_idempotency_key_idx
on public.deliveries(idempotency_key)
where idempotency_key is not null;

create table if not exists public.delivery_attempts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  delivery_id uuid not null references public.deliveries(id) on delete cascade,
  attempt_number integer not null check (attempt_number > 0),
  provider text not null,
  status text not null default 'sending'
    check (status in ('sending', 'sent', 'failed')),
  idempotency_key text not null,
  provider_message_id text,
  failure_message text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  unique (delivery_id, attempt_number),
  unique (idempotency_key)
);

create index if not exists delivery_attempts_delivery_idx
on public.delivery_attempts(delivery_id, attempt_number desc);

alter table public.delivery_attempts enable row level security;

drop policy if exists delivery_attempts_org_access on public.delivery_attempts;
create policy delivery_attempts_org_access
on public.delivery_attempts for all to authenticated
using (public.is_organization_member(organization_id))
with check (public.is_organization_member(organization_id));

create or replace function public.save_report_delivery_v3(
  target_organization_id uuid,
  target_job_id uuid,
  target_version_id uuid,
  target_delivery_id uuid,
  email_subject text,
  email_message text,
  email_reply_to text,
  recipient_items jsonb,
  delivery_package_mode text,
  supporting_version_ids uuid[] default '{}',
  allow_empty_recipients boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  saved_delivery_id uuid;
  recipient_item jsonb;
  normalized_email text;
  recipient_count integer := jsonb_array_length(coalesce(recipient_items, '[]'::jsonb));
  to_recipient_count integer := 0;
begin
  if not public.has_organization_role(
    target_organization_id,
    array['administrator', 'manager', 'office_coordinator']::public.membership_role[]
  ) then
    raise exception 'You do not have permission to prepare report delivery.';
  end if;

  if delivery_package_mode not in (
    'report_only', 'append_contract', 'separate_attachments', 'contract_only'
  ) then
    raise exception 'Invalid delivery package mode.';
  end if;

  if nullif(trim(email_subject), '') is null or nullif(trim(email_message), '') is null then
    raise exception 'Email subject and message are required.';
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
      and document_row.kind = 'inspection_report'
  ) then
    raise exception 'An approved report version is required.';
  end if;

  if delivery_package_mode <> 'report_only'
     and coalesce(array_length(supporting_version_ids, 1), 0) = 0 then
    raise exception 'Select a contract or proposal version for this package.';
  end if;

  if exists (
    select unnest(coalesce(supporting_version_ids, '{}')) as version_id
    except
    select version_row.id
    from public.document_versions version_row
    join public.documents document_row on document_row.id = version_row.document_id
    where version_row.organization_id = target_organization_id
      and version_row.status = 'ready'
      and document_row.inspection_job_id = target_job_id
      and document_row.kind in ('contract', 'proposal')
  ) then
    raise exception 'One or more supporting document versions are invalid.';
  end if;

  if not allow_empty_recipients and recipient_count = 0 then
    raise exception 'Select at least one recipient.';
  end if;

  for recipient_item in
    select value from jsonb_array_elements(coalesce(recipient_items, '[]'::jsonb))
  loop
    normalized_email := lower(trim(recipient_item->>'email'));
    if normalized_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
      raise exception 'A recipient email address is invalid.';
    end if;
    if coalesce(nullif(recipient_item->>'type', ''), 'to') not in ('to', 'cc', 'bcc') then
      raise exception 'A recipient type is invalid.';
    end if;
    if coalesce(nullif(recipient_item->>'type', ''), 'to') = 'to' then
      to_recipient_count := to_recipient_count + 1;
    end if;
  end loop;

  if not allow_empty_recipients and to_recipient_count = 0 then
    raise exception 'Select at least one To recipient.';
  end if;

  if target_delivery_id is not null then
    update public.deliveries
    set
      document_version_id = target_version_id,
      status = 'draft',
      subject = trim(email_subject),
      message_body = trim(email_message),
      reply_to = nullif(lower(trim(email_reply_to)), ''),
      package_mode = delivery_package_mode,
      attachment_version_ids = coalesce(supporting_version_ids, '{}'),
      failure_message = null,
      updated_at = now()
    where id = target_delivery_id
      and organization_id = target_organization_id
      and inspection_job_id = target_job_id
      and status in ('draft', 'failed')
    returning id into saved_delivery_id;

    if saved_delivery_id is null then
      raise exception 'Only draft or failed deliveries can be edited.';
    end if;

    delete from public.delivery_recipients
    where delivery_id = saved_delivery_id;
  else
    insert into public.deliveries (
      organization_id,
      inspection_job_id,
      document_version_id,
      status,
      subject,
      message_body,
      reply_to,
      package_mode,
      attachment_version_ids
    )
    values (
      target_organization_id,
      target_job_id,
      target_version_id,
      'draft',
      trim(email_subject),
      trim(email_message),
      nullif(lower(trim(email_reply_to)), ''),
      delivery_package_mode,
      coalesce(supporting_version_ids, '{}')
    )
    returning id into saved_delivery_id;
  end if;

  for recipient_item in
    select distinct on (
      lower(trim(value->>'email')),
      coalesce(nullif(value->>'type', ''), 'to')
    ) value
    from jsonb_array_elements(coalesce(recipient_items, '[]'::jsonb))
    order by
      lower(trim(value->>'email')),
      coalesce(nullif(value->>'type', ''), 'to')
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
    case when target_delivery_id is null
      then 'report_delivery_draft_created'
      else 'report_delivery_draft_updated'
    end,
    'delivery',
    saved_delivery_id,
    case when target_delivery_id is null
      then 'Report delivery draft created.'
      else 'Report delivery draft updated.'
    end,
    jsonb_build_object(
      'jobId', target_job_id,
      'documentVersionId', target_version_id,
      'packageMode', delivery_package_mode,
      'supportingVersionIds', coalesce(supporting_version_ids, '{}'),
      'recipientCount', recipient_count
    )
  );

  return saved_delivery_id;
end;
$$;

create or replace function public.begin_report_delivery_attempt(
  target_organization_id uuid,
  target_delivery_id uuid,
  delivery_provider text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  next_attempt integer;
  saved_attempt_id uuid;
  request_key text;
begin
  if not public.has_organization_role(
    target_organization_id,
    array['administrator', 'manager', 'office_coordinator']::public.membership_role[]
  ) then
    raise exception 'You do not have permission to send reports.';
  end if;

  select delivery.attempt_count + 1 into next_attempt
  from public.deliveries delivery
  where delivery.id = target_delivery_id
    and delivery.organization_id = target_organization_id
    and delivery.status in ('draft', 'failed')
  for update;

  if next_attempt is null then
    raise exception 'This delivery is not available to send.';
  end if;

  if not exists (
    select 1 from public.delivery_recipients recipient
    where recipient.delivery_id = target_delivery_id
      and recipient.recipient_type = 'to'
  ) then
    raise exception 'Select at least one To recipient.';
  end if;

  request_key := target_delivery_id::text || ':attempt:' || next_attempt::text;

  insert into public.delivery_attempts (
    organization_id,
    delivery_id,
    attempt_number,
    provider,
    idempotency_key,
    created_by
  )
  values (
    target_organization_id,
    target_delivery_id,
    next_attempt,
    delivery_provider,
    request_key,
    auth.uid()
  )
  returning id into saved_attempt_id;

  update public.deliveries
  set
    status = 'sending',
    provider = delivery_provider,
    sent_by = auth.uid(),
    queued_at = coalesce(queued_at, now()),
    last_attempt_at = now(),
    attempt_count = next_attempt,
    idempotency_key = request_key,
    failure_message = null,
    updated_at = now()
  where id = target_delivery_id;

  return jsonb_build_object(
    'attemptId', saved_attempt_id,
    'attemptNumber', next_attempt,
    'idempotencyKey', request_key
  );
end;
$$;

create or replace function public.complete_report_delivery_attempt(
  target_organization_id uuid,
  target_delivery_id uuid,
  target_attempt_id uuid,
  attempt_status text,
  provider_message text default null,
  failure_text text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_job_id uuid;
begin
  if not public.has_organization_role(
    target_organization_id,
    array['administrator', 'manager', 'office_coordinator']::public.membership_role[]
  ) then
    raise exception 'You do not have permission to update report delivery.';
  end if;

  if attempt_status not in ('sent', 'failed') then
    raise exception 'Invalid delivery attempt status.';
  end if;

  update public.delivery_attempts
  set
    status = attempt_status,
    provider_message_id = nullif(provider_message, ''),
    failure_message = nullif(left(coalesce(failure_text, ''), 2000), ''),
    completed_at = now()
  where id = target_attempt_id
    and organization_id = target_organization_id
    and delivery_id = target_delivery_id
    and status = 'sending';

  if not found then
    raise exception 'Delivery attempt was not found.';
  end if;

  update public.deliveries
  set
    status = attempt_status::public.delivery_status,
    provider_message_id = nullif(provider_message, ''),
    sent_at = case when attempt_status = 'sent' then now() else sent_at end,
    failure_message = nullif(left(coalesce(failure_text, ''), 2000), ''),
    crm_sync_status = case when attempt_status = 'sent' then 'pending' else crm_sync_status end,
    updated_at = now()
  where id = target_delivery_id
    and organization_id = target_organization_id
  returning inspection_job_id into target_job_id;

  update public.delivery_recipients
  set delivery_status = attempt_status
  where delivery_id = target_delivery_id;

  if attempt_status = 'sent' then
    update public.inspection_jobs
    set status = 'delivered', updated_at = now()
    where id = target_job_id
      and organization_id = target_organization_id;
  end if;
end;
$$;

revoke all on function public.save_report_delivery_v3(
  uuid, uuid, uuid, uuid, text, text, text, jsonb, text, uuid[], boolean
) from public;
revoke all on function public.begin_report_delivery_attempt(uuid, uuid, text) from public;
revoke all on function public.complete_report_delivery_attempt(
  uuid, uuid, uuid, text, text, text
) from public;

grant execute on function public.save_report_delivery_v3(
  uuid, uuid, uuid, uuid, text, text, text, jsonb, text, uuid[], boolean
) to authenticated;
grant execute on function public.begin_report_delivery_attempt(uuid, uuid, text) to authenticated;
grant execute on function public.complete_report_delivery_attempt(
  uuid, uuid, uuid, text, text, text
) to authenticated;

commit;
