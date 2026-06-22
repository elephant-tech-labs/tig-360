-- Organization report identity, reusable legal content, inspection tags,
-- and delivery package metadata.

create table public.organization_report_profiles (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  legal_name text,
  street_line_1 text,
  street_line_2 text,
  city text,
  region text,
  postal_code text,
  phone text,
  email text,
  website text,
  registration_number text,
  operator_license text,
  contractor_license text,
  regulatory_contact text,
  logo_path text,
  logo_filename text,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.report_content_blocks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  title text not null,
  body text not null,
  placement text not null default 'before_findings'
    check (placement in ('before_findings', 'after_findings', 'contract')),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  is_required boolean not null default true,
  report_types text[] not null default array['complete', 'limited', 'supplemental', 'reinspection'],
  version integer not null default 1 check (version > 0),
  effective_from date,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index report_content_blocks_org_placement_idx
on public.report_content_blocks(organization_id, placement, sort_order);

alter table public.inspection_jobs
  add column if not exists inspection_tag_posted text,
  add column if not exists other_tags_posted text,
  add column if not exists garage_description text;

alter table public.deliveries
  add column if not exists package_mode text not null default 'report_only'
    check (package_mode in ('report_only', 'append_contract', 'separate_attachments', 'contract_only')),
  add column if not exists attachment_version_ids uuid[] not null default '{}';

drop trigger if exists organization_report_profiles_set_updated_at on public.organization_report_profiles;
create trigger organization_report_profiles_set_updated_at
before update on public.organization_report_profiles
for each row execute procedure public.set_updated_at();

drop trigger if exists report_content_blocks_set_updated_at on public.report_content_blocks;
create trigger report_content_blocks_set_updated_at
before update on public.report_content_blocks
for each row execute procedure public.set_updated_at();

alter table public.organization_report_profiles enable row level security;
alter table public.report_content_blocks enable row level security;

create policy organization_report_profiles_org_select on public.organization_report_profiles
for select to authenticated
using (public.is_organization_member(organization_id));

create policy organization_report_profiles_manager_write on public.organization_report_profiles
for all to authenticated
using (public.has_organization_role(
  organization_id,
  array['administrator', 'manager']::public.membership_role[]
))
with check (public.has_organization_role(
  organization_id,
  array['administrator', 'manager']::public.membership_role[]
));

create policy report_content_blocks_org_select on public.report_content_blocks
for select to authenticated
using (public.is_organization_member(organization_id));

create policy report_content_blocks_manager_write on public.report_content_blocks
for all to authenticated
using (public.has_organization_role(
  organization_id,
  array['administrator', 'manager']::public.membership_role[]
))
with check (public.has_organization_role(
  organization_id,
  array['administrator', 'manager']::public.membership_role[]
));

grant select, insert, update, delete on public.organization_report_profiles to authenticated;
grant select, insert, update, delete on public.report_content_blocks to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'organization-branding',
  'organization-branding',
  false,
  10485760,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists organization_branding_select on storage.objects;
create policy organization_branding_select
on storage.objects for select to authenticated
using (
  bucket_id = 'organization-branding'
  and public.is_organization_member(((storage.foldername(name))[1])::uuid)
);

drop policy if exists organization_branding_manager_insert on storage.objects;
create policy organization_branding_manager_insert
on storage.objects for insert to authenticated
with check (
  bucket_id = 'organization-branding'
  and public.has_organization_role(
    ((storage.foldername(name))[1])::uuid,
    array['administrator', 'manager']::public.membership_role[]
  )
);

drop policy if exists organization_branding_manager_delete on storage.objects;
create policy organization_branding_manager_delete
on storage.objects for delete to authenticated
using (
  bucket_id = 'organization-branding'
  and public.has_organization_role(
    ((storage.foldername(name))[1])::uuid,
    array['administrator', 'manager']::public.membership_role[]
  )
);

insert into public.organization_report_profiles (organization_id, legal_name)
select id, name from public.organizations
on conflict (organization_id) do nothing;

insert into public.report_content_blocks (
  organization_id, title, body, placement, sort_order, is_required
)
select
  organization.id,
  seed.title,
  seed.body,
  'before_findings',
  seed.sort_order,
  true
from public.organizations organization
cross join (
  values
    (
      'Scope of inspection',
      'This report describes visible and accessible conditions observed on the inspection date. Areas that are concealed, obstructed, unsafe, or inaccessible without damaging finishes were not inspected unless specifically stated.',
      10
    ),
    (
      'Section I, Section II, and further inspection',
      'Section I identifies visible evidence of active infestation, infection, or resulting damage. Section II identifies conditions considered likely to lead to infestation or infection where no visible evidence was found. Further inspection identifies areas that could not be fully inspected and cannot yet be classified as Section I or Section II.',
      20
    ),
    (
      'Roof and mold limitations',
      'The exterior roof surface and water-tightness are outside the scope of this structural pest inspection. Mold is not classified as a wood-destroying organism under this report. Consult appropriately licensed professionals when additional roof or mold evaluation is desired.',
      30
    ),
    (
      'Regulatory and second-opinion notice',
      'Questions about this report should first be directed to the inspection company. Reports from registered companies should identify the same observable conditions, although recommendations may differ. The property owner may obtain another opinion from a registered structural pest control company.',
      40
    )
) as seed(title, body, sort_order)
where not exists (
  select 1 from public.report_content_blocks existing
  where existing.organization_id = organization.id
);

create or replace function public.create_report_delivery_draft_v2(
  target_organization_id uuid,
  target_job_id uuid,
  target_version_id uuid,
  email_subject text,
  email_message text,
  recipient_items jsonb,
  delivery_package_mode text,
  supporting_version_ids uuid[] default '{}'
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

  if delivery_package_mode not in (
    'report_only', 'append_contract', 'separate_attachments', 'contract_only'
  ) then
    raise exception 'Invalid delivery package mode.';
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
    raise exception 'Select a contract or disclosure version for this package.';
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

  if jsonb_array_length(coalesce(recipient_items, '[]'::jsonb)) = 0 then
    raise exception 'Select at least one recipient.';
  end if;

  insert into public.deliveries (
    organization_id,
    inspection_job_id,
    document_version_id,
    status,
    subject,
    message_body,
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
    delivery_package_mode,
    coalesce(supporting_version_ids, '{}')
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
    jsonb_build_object(
      'jobId', target_job_id,
      'documentVersionId', target_version_id,
      'packageMode', delivery_package_mode,
      'supportingVersionIds', coalesce(supporting_version_ids, '{}')
    )
  );

  return saved_delivery_id;
end;
$$;

grant execute on function public.create_report_delivery_draft_v2(
  uuid, uuid, uuid, text, text, jsonb, text, uuid[]
) to authenticated;
