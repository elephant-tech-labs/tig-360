select
  (
    select count(*)
    from pg_proc procedure
    join pg_namespace namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname = 'create_inspection_job'
      and procedure.pronargs = 10
  ) as create_rpc_v2,
  (
    select count(*)
    from pg_proc procedure
    join pg_namespace namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname = 'update_inspection_job'
      and procedure.pronargs = 12
  ) as update_rpc,
  (
    select count(*)
    from pg_indexes
    where schemaname = 'public'
      and indexname = 'inspection_jobs_prior_job_id_idx'
  ) as prior_job_index,
  (
    select bool_and(
      has_function_privilege('authenticated', procedure.oid, 'EXECUTE')
    )
    from pg_proc procedure
    join pg_namespace namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname in ('create_inspection_job', 'update_inspection_job')
  ) as authenticated_can_execute;
