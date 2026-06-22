select
  (select count(*) from information_schema.columns
   where table_schema = 'public'
     and table_name = 'job_finding_summaries'
     and column_name in ('status', 'completed_at', 'completed_by')) as finding_state_columns,
  (select count(*) from pg_proc
   where proname = 'set_job_findings_status') as findings_status_rpc,
  has_function_privilege(
    'authenticated',
    'public.set_job_findings_status(uuid,uuid,text)',
    'execute'
  ) as authenticated_can_set_findings_status;
