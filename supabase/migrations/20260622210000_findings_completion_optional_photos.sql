alter table public.job_finding_summaries
  add column if not exists status text not null default 'draft'
    check (status in ('draft', 'complete')),
  add column if not exists completed_at timestamptz,
  add column if not exists completed_by uuid references public.profiles(id) on delete set null;

create or replace function public.set_job_findings_status(
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
    raise exception 'Active organization membership required';
  end if;
  if status_value not in ('draft', 'complete') then
    raise exception 'Invalid findings workflow status';
  end if;
  if not exists (
    select 1 from public.inspection_jobs
    where id = target_job_id and organization_id = target_organization_id
  ) then
    raise exception 'Inspection job not found';
  end if;

  insert into public.job_finding_summaries (
    inspection_job_id, organization_id, status, completed_at, completed_by
  )
  values (
    target_job_id,
    target_organization_id,
    status_value,
    case when status_value = 'complete' then now() end,
    case when status_value = 'complete' then auth.uid() end
  )
  on conflict (inspection_job_id) do update set
    status = excluded.status,
    completed_at = excluded.completed_at,
    completed_by = excluded.completed_by;
end;
$$;

grant execute on function public.set_job_findings_status(uuid, uuid, text) to authenticated;
