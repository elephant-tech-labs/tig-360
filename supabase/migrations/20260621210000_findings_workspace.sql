begin;

create table public.job_finding_summaries (
  inspection_job_id uuid primary key references public.inspection_jobs(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  subterranean_termites boolean not null default false,
  drywood_termites boolean not null default false,
  fungus_dryrot boolean not null default false,
  other_findings boolean not null default false,
  further_inspection boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger job_finding_summaries_set_updated_at
before update on public.job_finding_summaries
for each row execute procedure public.set_updated_at();

alter table public.job_finding_summaries enable row level security;
create policy job_finding_summaries_org_access
on public.job_finding_summaries for all to authenticated
using (public.is_organization_member(organization_id))
with check (public.is_organization_member(organization_id));
grant select, insert, update, delete on public.job_finding_summaries to authenticated;

create table public.finding_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  template_code text not null,
  title text,
  area_code integer check (area_code is null or area_code between 1 and 11),
  finding_text text,
  recommendation_text text,
  default_classification text check (
    default_classification is null or
    default_classification in ('section_i', 'section_ii', 'further_inspection', 'other')
  ),
  default_quote_price numeric(12,2) check (default_quote_price is null or default_quote_price >= 0),
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, template_code)
);

create index finding_templates_search_idx
on public.finding_templates (organization_id, is_active, template_code);

create trigger finding_templates_set_updated_at
before update on public.finding_templates
for each row execute procedure public.set_updated_at();

alter table public.finding_templates enable row level security;
create policy finding_templates_org_select
on public.finding_templates for select to authenticated
using (public.is_organization_member(organization_id));
create policy finding_templates_manager_write
on public.finding_templates for all to authenticated
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
grant select, insert, update, delete on public.finding_templates to authenticated;

alter table public.findings
  add column entry_type text not null default 'finding',
  add column area_code integer,
  add column finding_letter text,
  add column note_placement text,
  add column source_template_id uuid references public.finding_templates(id) on delete set null,
  add column source_finding_id uuid references public.findings(id) on delete set null,
  add column archived_at timestamptz;

alter table public.findings
  add constraint findings_entry_type_check
  check (entry_type in ('finding', 'note')),
  add constraint findings_area_code_check
  check (area_code is null or area_code between 1 and 11),
  add constraint findings_letter_check
  check (finding_letter is null or finding_letter in ('A','B','C','D','E','F','G','H')),
  add constraint findings_note_placement_check
  check (note_placement is null or note_placement in ('before', 'after'));

alter table public.findings drop constraint if exists findings_classification_check;
update public.findings set classification = 'other' where classification = 'informational';
alter table public.findings
  add constraint findings_classification_check
  check (
    classification is null or classification in (
      'section_i', 'section_ii', 'further_inspection', 'other', 'note'
    )
  );

create unique index findings_active_reference_unique
on public.findings (inspection_job_id, area_code, finding_letter)
where entry_type = 'finding' and archived_at is null;

create unique index findings_active_note_letter_unique
on public.findings (inspection_job_id, finding_letter)
where entry_type = 'note' and archived_at is null;

alter table public.recommendations
  add column recommendation_type text not null default 'primary',
  add column archived_at timestamptz;

alter table public.recommendations
  add constraint recommendations_type_check
  check (recommendation_type in ('primary', 'alternate'));

alter table public.recommendations drop constraint if exists recommendations_section_check;
update public.recommendations set section = 'other' where section = 'informational';
alter table public.recommendations
  add constraint recommendations_section_check
  check (
    section is null or section in (
      'section_i', 'section_ii', 'further_inspection', 'other'
    )
  );

create or replace function public.save_job_finding_summary(
  target_organization_id uuid,
  target_job_id uuid,
  has_subterranean_termites boolean,
  has_drywood_termites boolean,
  has_fungus_dryrot boolean,
  has_other_findings boolean,
  needs_further_inspection boolean
)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if not public.is_organization_member(target_organization_id) then
    raise exception 'Active organization membership required';
  end if;
  if not exists (
    select 1 from public.inspection_jobs
    where id = target_job_id and organization_id = target_organization_id
  ) then
    raise exception 'Inspection job not found';
  end if;

  insert into public.job_finding_summaries (
    inspection_job_id, organization_id, subterranean_termites,
    drywood_termites, fungus_dryrot, other_findings, further_inspection
  )
  values (
    target_job_id, target_organization_id, coalesce(has_subterranean_termites, false),
    coalesce(has_drywood_termites, false), coalesce(has_fungus_dryrot, false),
    coalesce(has_other_findings, false), coalesce(needs_further_inspection, false)
  )
  on conflict (inspection_job_id) do update set
    subterranean_termites = excluded.subterranean_termites,
    drywood_termites = excluded.drywood_termites,
    fungus_dryrot = excluded.fungus_dryrot,
    other_findings = excluded.other_findings,
    further_inspection = excluded.further_inspection;
end;
$$;

create or replace function public.save_finding_entry(
  target_organization_id uuid,
  target_job_id uuid,
  target_finding_id uuid,
  finding_entry_type text,
  finding_area_code integer,
  finding_letter_value text,
  finding_text_value text,
  finding_classification text,
  finding_note_placement text,
  finding_source_template_id uuid,
  recommendation_items jsonb
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  saved_finding_id uuid;
  next_sort_order integer;
  area_name text;
  recommendation_item jsonb;
  recommendation_position integer := 0;
begin
  if not public.is_organization_member(target_organization_id) then
    raise exception 'Active organization membership required';
  end if;
  if not exists (
    select 1 from public.inspection_jobs
    where id = target_job_id and organization_id = target_organization_id
  ) then
    raise exception 'Inspection job not found';
  end if;
  if finding_entry_type not in ('finding', 'note') then
    raise exception 'Invalid entry type';
  end if;
  if nullif(trim(finding_text_value), '') is null then
    raise exception 'Finding or note text is required';
  end if;

  if finding_entry_type = 'finding' then
    if finding_area_code is null or finding_area_code not between 1 and 11 then
      raise exception 'Area is required';
    end if;
    if finding_letter_value is null or finding_letter_value not in ('A','B','C','D','E','F','G','H') then
      raise exception 'Finding letter is required';
    end if;
    if finding_classification is null or finding_classification not in ('section_i','section_ii','further_inspection','other') then
      raise exception 'Section classification is required';
    end if;
  else
    if finding_letter_value is null or finding_letter_value not in ('A','B','C','D','E','F','G','H') then
      raise exception 'Note letter is required';
    end if;
    finding_area_code := null;
    finding_classification := 'note';
    finding_note_placement := coalesce(finding_note_placement, 'after');
  end if;

  area_name := case finding_area_code
    when 1 then 'Substructure Area' when 2 then 'Stall Shower'
    when 3 then 'Foundations' when 4 then 'Porches'
    when 5 then 'Ventilation' when 6 then 'Abutments'
    when 7 then 'Attic' when 8 then 'Garages'
    when 9 then 'Decks / Patios' when 10 then 'Other / Interior'
    when 11 then 'Other / Exterior' else 'Note'
  end;

  if target_finding_id is null then
    select coalesce(max(sort_order), -1) + 1 into next_sort_order
    from public.findings where inspection_job_id = target_job_id;

    insert into public.findings (
      organization_id, inspection_job_id, entry_type, area_code, finding_letter,
      code, title, description, location, classification, note_placement,
      source_template_id, sort_order, status, created_by
    )
    values (
      target_organization_id, target_job_id, finding_entry_type, finding_area_code,
      finding_letter_value,
      case when finding_entry_type = 'finding'
        then finding_area_code::text || finding_letter_value
        else 'Note ' || finding_letter_value end,
      case when finding_entry_type = 'finding'
        then finding_area_code::text || finding_letter_value || ' · ' || area_name
        else 'Note ' || finding_letter_value end,
      trim(finding_text_value), area_name, finding_classification,
      finding_note_placement, finding_source_template_id, next_sort_order, 'open',
      (select auth.uid())
    )
    returning id into saved_finding_id;
  else
    update public.findings
    set
      entry_type = finding_entry_type,
      area_code = finding_area_code,
      finding_letter = finding_letter_value,
      code = case when finding_entry_type = 'finding'
        then finding_area_code::text || finding_letter_value
        else 'Note ' || finding_letter_value end,
      title = case when finding_entry_type = 'finding'
        then finding_area_code::text || finding_letter_value || ' · ' || area_name
        else 'Note ' || finding_letter_value end,
      description = trim(finding_text_value),
      location = area_name,
      classification = finding_classification,
      note_placement = finding_note_placement,
      source_template_id = finding_source_template_id,
      archived_at = null,
      status = 'open'
    where id = target_finding_id
      and inspection_job_id = target_job_id
      and organization_id = target_organization_id
    returning id into saved_finding_id;

    if saved_finding_id is null then raise exception 'Finding entry not found'; end if;
    delete from public.recommendations where finding_id = saved_finding_id;
  end if;

  if finding_entry_type = 'finding' then
    for recommendation_item in
      select value from jsonb_array_elements(coalesce(recommendation_items, '[]'::jsonb))
    loop
      if nullif(trim(recommendation_item ->> 'description'), '') is not null then
        insert into public.recommendations (
          organization_id, finding_id, description, section, estimated_cost,
          sort_order, recommendation_type
        )
        values (
          target_organization_id, saved_finding_id,
          trim(recommendation_item ->> 'description'), finding_classification,
          nullif(recommendation_item ->> 'estimatedCost', '')::numeric,
          recommendation_position,
          case when recommendation_position = 0 then 'primary' else 'alternate' end
        );
        recommendation_position := recommendation_position + 1;
      end if;
    end loop;
    if recommendation_position = 0 then raise exception 'At least one recommendation is required'; end if;
  end if;

  return saved_finding_id;
end;
$$;

create or replace function public.set_finding_archived(
  target_organization_id uuid,
  target_finding_id uuid,
  should_archive boolean
)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if not public.is_organization_member(target_organization_id) then
    raise exception 'Active organization membership required';
  end if;
  update public.findings
  set
    archived_at = case when should_archive then now() else null end,
    status = case when should_archive then 'excluded' else 'open' end
  where id = target_finding_id and organization_id = target_organization_id;
end;
$$;

create or replace function public.move_finding_entry(
  target_organization_id uuid,
  target_finding_id uuid,
  movement text
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  current_record public.findings%rowtype;
  adjacent_record public.findings%rowtype;
begin
  if not public.is_organization_member(target_organization_id) then
    raise exception 'Active organization membership required';
  end if;
  select * into current_record from public.findings
  where id = target_finding_id and organization_id = target_organization_id;
  if not found then raise exception 'Finding entry not found'; end if;

  if movement = 'up' then
    select * into adjacent_record from public.findings
    where inspection_job_id = current_record.inspection_job_id
      and sort_order < current_record.sort_order
    order by sort_order desc limit 1;
  elsif movement = 'down' then
    select * into adjacent_record from public.findings
    where inspection_job_id = current_record.inspection_job_id
      and sort_order > current_record.sort_order
    order by sort_order asc limit 1;
  else
    raise exception 'Invalid movement';
  end if;

  if found then
    update public.findings set sort_order = -1 where id = current_record.id;
    update public.findings set sort_order = current_record.sort_order where id = adjacent_record.id;
    update public.findings set sort_order = adjacent_record.sort_order where id = current_record.id;
  end if;
end;
$$;

revoke all on function public.save_job_finding_summary(uuid, uuid, boolean, boolean, boolean, boolean, boolean) from public;
revoke all on function public.save_finding_entry(uuid, uuid, uuid, text, integer, text, text, text, text, uuid, jsonb) from public;
revoke all on function public.set_finding_archived(uuid, uuid, boolean) from public;
revoke all on function public.move_finding_entry(uuid, uuid, text) from public;
grant execute on function public.save_job_finding_summary(uuid, uuid, boolean, boolean, boolean, boolean, boolean) to authenticated;
grant execute on function public.save_finding_entry(uuid, uuid, uuid, text, integer, text, text, text, text, uuid, jsonb) to authenticated;
grant execute on function public.set_finding_archived(uuid, uuid, boolean) to authenticated;
grant execute on function public.move_finding_entry(uuid, uuid, text) to authenticated;

commit;
