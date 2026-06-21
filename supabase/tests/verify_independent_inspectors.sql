select
  (select count(*) from information_schema.tables where table_schema = 'public' and table_name = 'inspectors') as inspectors_table,
  (select count(*) from information_schema.tables where table_schema = 'public' and table_name = 'organization_invitations') as invitations_table,
  (select count(*) from information_schema.tables where table_schema = 'public' and table_name = 'inspector_profiles') as compatibility_profiles_table,
  (select count(*) from pg_constraint where conname = 'inspection_jobs_inspected_by_inspector_fkey') as inspector_job_fk,
  (select count(*) from pg_proc procedure join pg_namespace namespace on namespace.oid = procedure.pronamespace where namespace.nspname = 'public' and procedure.proname = 'create_inspector') as create_inspector_rpc,
  (select count(*) from pg_proc procedure join pg_namespace namespace on namespace.oid = procedure.pronamespace where namespace.nspname = 'public' and procedure.proname = 'create_organization_invitation') as invitation_rpc,
  (select count(*) from pg_proc procedure join pg_namespace namespace on namespace.oid = procedure.pronamespace where namespace.nspname = 'public' and procedure.proname = 'accept_current_invitation') as accept_invitation_rpc;
