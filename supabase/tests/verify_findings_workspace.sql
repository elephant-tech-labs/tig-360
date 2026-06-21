select
  (select count(*) from information_schema.tables where table_schema='public' and table_name='job_finding_summaries') as summary_table,
  (select count(*) from information_schema.tables where table_schema='public' and table_name='finding_templates') as templates_table,
  (select count(*) from information_schema.columns where table_schema='public' and table_name='findings' and column_name in ('entry_type','area_code','finding_letter','note_placement','source_template_id','source_finding_id','archived_at')) as finding_columns,
  (select count(*) from information_schema.columns where table_schema='public' and table_name='recommendations' and column_name in ('recommendation_type','archived_at')) as recommendation_columns,
  (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='save_finding_entry') as save_rpc,
  (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='move_finding_entry') as move_rpc;
