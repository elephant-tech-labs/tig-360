select
  (select count(*) from information_schema.tables
   where table_schema = 'public' and table_name = 'job_photo_states') as photo_state_table,
  (select count(*) from information_schema.columns
   where table_schema = 'public'
     and table_name = 'assets'
     and column_name in (
       'caption', 'photo_category', 'include_in_report', 'is_cover', 'sort_order',
       'annotation_json', 'annotated_render_path', 'location_label', 'uploaded_by_inspector_id'
     )) as asset_photo_columns,
  (select count(*) from storage.buckets
   where id = 'inspection-photos' and public = false) as private_photo_bucket,
  (select count(*) from pg_proc
   where pronamespace = 'public'::regnamespace
     and proname in (
       'register_job_photo', 'update_job_photo', 'save_photo_annotation',
       'set_job_photo_status', 'move_job_photo'
     )) as photo_rpcs,
  has_function_privilege(
    'authenticated',
    'public.register_job_photo(uuid,uuid,text,text,text,bigint,timestamp with time zone,text)',
    'execute'
  ) as authenticated_can_register,
  has_function_privilege(
    'authenticated',
    'public.update_job_photo(uuid,uuid,text,text,boolean,boolean,text,jsonb)',
    'execute'
  ) as authenticated_can_update,
  has_function_privilege(
    'authenticated',
    'public.save_photo_annotation(uuid,uuid,jsonb,text)',
    'execute'
  ) as authenticated_can_annotate;
