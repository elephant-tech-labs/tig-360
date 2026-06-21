select
  (
    select count(*)
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'contacts'
      and column_name in (
        'category', 'street_line_1', 'street_line_2', 'city',
        'region', 'postal_code', 'county'
      )
  ) as contact_address_columns,
  (
    select count(*)
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'properties'
      and column_name = 'county'
  ) as property_county_column,
  (
    select count(*)
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'inspection_jobs'
      and column_name in ('inspected_by_id', 'include_inspector_signature')
  ) as job_inspector_columns,
  (
    select count(*)
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'inspector_profiles'
  ) as inspector_profiles_table,
  (
    select count(*)
    from storage.buckets
    where id = 'inspector-signatures'
      and public = false
  ) as private_signature_bucket,
  (
    select count(*)
    from pg_proc procedure
    join pg_namespace namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname = 'create_inspection_job'
      and procedure.pronargs = 15
  ) as create_job_rpc,
  (
    select count(*)
    from pg_proc procedure
    join pg_namespace namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname = 'update_inspection_job'
      and procedure.pronargs = 17
  ) as update_job_rpc;
