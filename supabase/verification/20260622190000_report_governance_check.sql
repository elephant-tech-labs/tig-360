select
  (select count(*) from information_schema.tables
   where table_schema = 'public' and table_name in (
     'organization_report_profiles', 'report_content_blocks'
   )) as management_tables,
  (select count(*) from information_schema.columns
   where table_schema = 'public' and table_name = 'inspection_jobs'
     and column_name in (
       'inspection_tag_posted', 'other_tags_posted', 'garage_description'
     )) as job_report_columns,
  (select count(*) from information_schema.columns
   where table_schema = 'public' and table_name = 'deliveries'
     and column_name in ('package_mode', 'attachment_version_ids')) as delivery_package_columns,
  (select count(*) from storage.buckets
   where id = 'organization-branding' and public = false) as branding_bucket,
  (select count(*) from public.report_content_blocks) as report_content_blocks,
  (select count(*) from pg_proc
   where proname = 'create_report_delivery_draft_v2') as delivery_v2_rpc,
  has_function_privilege(
    'authenticated',
    'public.create_report_delivery_draft_v2(uuid,uuid,uuid,text,text,jsonb,text,uuid[])',
    'execute'
  ) as authenticated_can_create_package;
