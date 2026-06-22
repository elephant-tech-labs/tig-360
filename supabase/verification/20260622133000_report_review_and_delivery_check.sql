select
  (select count(*) from information_schema.columns
   where table_schema = 'public' and table_name = 'document_versions'
     and column_name in ('approval_status', 'approved_by', 'approved_at', 'approval_note')) as approval_columns,
  (select count(*) from storage.buckets where id = 'report-pdfs' and public = false) as private_report_bucket,
  (select count(*) from pg_proc where proname = 'begin_inspection_report_version') as begin_rpc,
  (select count(*) from pg_proc where proname = 'complete_inspection_report_version') as complete_rpc,
  (select count(*) from pg_proc where proname = 'approve_inspection_report_version') as approve_rpc,
  (select count(*) from pg_proc where proname = 'create_report_delivery_draft') as delivery_rpc,
  has_function_privilege('authenticated', 'public.begin_inspection_report_version(uuid,uuid,jsonb)', 'execute') as authenticated_can_generate,
  has_function_privilege('authenticated', 'public.approve_inspection_report_version(uuid,uuid,uuid,text)', 'execute') as authenticated_can_approve;
