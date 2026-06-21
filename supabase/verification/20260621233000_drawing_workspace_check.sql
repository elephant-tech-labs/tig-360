select
  (select count(*) from information_schema.tables
   where table_schema = 'public'
     and table_name in ('diagram_drafts', 'diagram_markers', 'diagram_version_markers')) as drawing_tables,
  (select count(*) from information_schema.columns
   where table_schema = 'public'
     and table_name = 'diagrams'
     and column_name in ('render_path', 'canvas_width', 'canvas_height', 'status')) as diagram_version_columns,
  (select count(*) from storage.buckets
   where id = 'diagram-renders' and public = false) as private_render_bucket,
  (select count(*) from pg_proc
   where pronamespace = 'public'::regnamespace
     and proname = 'save_diagram_draft') as save_draft_rpc,
  (select count(*) from pg_proc
   where pronamespace = 'public'::regnamespace
     and proname = 'publish_diagram_version') as publish_version_rpc,
  has_function_privilege(
    'authenticated',
    'public.save_diagram_draft(uuid,uuid,jsonb,jsonb,integer,integer,text)',
    'execute'
  ) as authenticated_can_save,
  has_function_privilege(
    'authenticated',
    'public.publish_diagram_version(uuid,uuid,jsonb,jsonb,integer,integer,text,text)',
    'execute'
  ) as authenticated_can_publish;
