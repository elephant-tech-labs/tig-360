select
  (select count(*) from information_schema.tables
    where table_schema = 'public'
      and table_name in ('wdo_branches', 'wdo_activities', 'wdo_export_batches', 'wdo_export_batch_items')) as wdo_tables,
  (select count(*) from pg_tables
    where schemaname = 'public'
      and tablename in ('wdo_branches', 'wdo_activities', 'wdo_export_batches', 'wdo_export_batch_items')
      and rowsecurity) as wdo_tables_with_rls,
  (select count(*) from pg_policies
    where schemaname = 'public'
      and tablename in ('wdo_branches', 'wdo_activities', 'wdo_export_batches', 'wdo_export_batch_items')) as wdo_policies,
  (select count(*) from pg_proc
    where pronamespace = 'public'::regnamespace
      and proname in (
        'reconcile_wdo_inspection_activities',
        'create_wdo_activity',
        'update_wdo_activity',
        'create_wdo_export_batch',
        'mark_wdo_export_batch_filed'
      )) as wdo_public_rpcs,
  (select count(*) from pg_trigger
    where not tgisinternal
      and tgname in (
        'inspection_jobs_sync_wdo_activity',
        'wdo_export_batches_protect_history',
        'wdo_export_batch_items_protect_history'
      )) as wdo_integrity_triggers,
  has_table_privilege('authenticated', 'public.wdo_activities', 'select') as authenticated_can_read_activities,
  not has_table_privilege('authenticated', 'public.wdo_activities', 'insert') as authenticated_cannot_insert_activities_directly,
  not has_table_privilege('authenticated', 'public.wdo_export_batches', 'update') as authenticated_cannot_mutate_batches_directly,
  has_function_privilege(
    'authenticated',
    'public.create_wdo_export_batch(uuid,date,date,uuid,text,text,text,text,jsonb,text)',
    'execute'
  ) as authenticated_can_generate_batch;
