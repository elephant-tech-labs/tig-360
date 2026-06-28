-- Proposal contract versions must not be created as approved before the PDF asset is attached.
-- The immutable document version trigger blocks any update to rows that are already approved.

create or replace function public.begin_proposal_document_version(
  target_organization_id uuid,
  target_job_id uuid,
  target_proposal_id uuid,
  proposal_snapshot jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  proposal_document_id uuid;
  proposal_version_id uuid;
  next_version integer;
  report_job_number bigint;
begin
  if not public.has_organization_role(
    target_organization_id,
    array['administrator', 'manager', 'office_coordinator']::public.membership_role[]
  ) then
    raise exception 'You do not have permission to generate proposal documents.';
  end if;

  select job.job_number into report_job_number
  from public.inspection_jobs job
  join public.job_proposals proposal on proposal.inspection_job_id = job.id
  where job.id = target_job_id
    and job.organization_id = target_organization_id
    and proposal.id = target_proposal_id
    and proposal.status = 'approved';

  if report_job_number is null then
    raise exception 'Approve the proposal before generating the contract document.';
  end if;

  perform pg_advisory_xact_lock(hashtext(target_job_id::text || ':proposal-document'));

  insert into public.documents (
    organization_id,
    inspection_job_id,
    kind,
    title
  )
  values (
    target_organization_id,
    target_job_id,
    'proposal',
    'Proposal and Work Authorization #' || report_job_number
  )
  on conflict (inspection_job_id, kind) do update set
    title = excluded.title
  returning id into proposal_document_id;

  select coalesce(max(version), 0) + 1 into next_version
  from public.document_versions
  where document_id = proposal_document_id;

  insert into public.document_versions (
    organization_id,
    document_id,
    version,
    status,
    approval_status,
    snapshot,
    generated_by
  )
  values (
    target_organization_id,
    proposal_document_id,
    next_version,
    'generating',
    'pending',
    coalesce(proposal_snapshot, '{}'::jsonb),
    auth.uid()
  )
  returning id into proposal_version_id;

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
    'proposal_document_generation_started',
    'document_version',
    proposal_version_id,
    'Proposal document version ' || next_version || ' generation started.',
    jsonb_build_object('jobId', target_job_id, 'proposalId', target_proposal_id, 'version', next_version)
  );

  return jsonb_build_object(
    'documentId', proposal_document_id,
    'versionId', proposal_version_id,
    'version', next_version
  );
end;
$$;
