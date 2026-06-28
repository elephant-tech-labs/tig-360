select
  (
    select count(*)
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'signature_requests'
  ) as signature_requests_table,
  (
    select count(*)
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'signature_request_events'
  ) as signature_request_events_table,
  (
    select count(*)
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'signature_requests'
      and column_name in (
        'document_version_id',
        'signer_email',
        'status',
        'provider_request_id',
        'sent_at',
        'completed_at'
      )
  ) as signature_request_columns,
  exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'signature_requests'
      and policyname = 'signature_requests_org_access'
  ) as signature_requests_policy,
  has_table_privilege('authenticated', 'public.signature_requests', 'insert') as authenticated_can_insert,
  has_table_privilege('authenticated', 'public.signature_requests', 'update') as authenticated_can_update;
