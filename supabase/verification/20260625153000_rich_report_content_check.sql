select
  (select count(*) from information_schema.columns
    where table_schema = 'public'
      and table_name = 'report_content_blocks'
      and column_name in ('body_json', 'body_format')) as rich_content_columns,
  (select count(*) from pg_constraint
    where conname = 'report_content_blocks_body_json_shape') as json_shape_constraint;
