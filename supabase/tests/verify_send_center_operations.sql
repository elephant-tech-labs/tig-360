select
  (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'deliveries' and column_name in (
    'reply_to', 'retry_of_delivery_id', 'attempt_count', 'last_attempt_at',
    'idempotency_key', 'crm_sync_status', 'crm_activity_id', 'crm_failure_message'
  )) as delivery_columns,
  to_regclass('public.delivery_attempts') is not null as attempts_table,
  (select count(*) from pg_proc procedure join pg_namespace namespace on namespace.oid = procedure.pronamespace where namespace.nspname = 'public' and procedure.proname = 'save_report_delivery_v3') as save_rpc,
  (select count(*) from pg_proc procedure join pg_namespace namespace on namespace.oid = procedure.pronamespace where namespace.nspname = 'public' and procedure.proname = 'begin_report_delivery_attempt') as begin_attempt_rpc,
  (select count(*) from pg_proc procedure join pg_namespace namespace on namespace.oid = procedure.pronamespace where namespace.nspname = 'public' and procedure.proname = 'complete_report_delivery_attempt') as complete_attempt_rpc;
