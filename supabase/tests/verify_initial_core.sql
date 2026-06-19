select
  (select count(*) from pg_tables where schemaname = 'public') as public_table_count,
  (
    select count(*)
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
      and c.relrowsecurity
  ) as rls_table_count,
  (select count(*) from pg_policies where schemaname = 'public') as policy_count,
  (
    select count(*)
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'create_organization',
        'is_organization_member',
        'has_organization_role',
        'handle_new_user',
        'set_updated_at'
      )
  ) as core_function_count,
  coalesce(
    (
      select string_agg(tablename, ', ' order by tablename)
      from pg_tables
      where schemaname = 'public'
        and not rowsecurity
    ),
    'none'
  ) as tables_without_rls;

-- Expected immediately after the initial migration:
-- public_table_count: 19
-- rls_table_count: 19
-- policy_count: 26
-- core_function_count: 5
-- tables_without_rls: none
