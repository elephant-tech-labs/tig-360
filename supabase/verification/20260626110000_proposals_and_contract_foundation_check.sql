select
  (select count(*) from information_schema.tables where table_schema = 'public' and table_name = 'job_proposals') as proposal_table,
  (select count(*) from information_schema.tables where table_schema = 'public' and table_name = 'proposal_line_items') as line_items_table,
  (
    select count(*)
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'job_proposals'
      and column_name in ('status', 'subtotal_amount', 'tax_amount', 'total_amount')
  ) as proposal_totals_columns,
  (
    select count(*)
    from information_schema.routines
    where routine_schema = 'public'
      and routine_name in (
        'ensure_job_proposal',
        'import_proposal_lines_from_findings',
        'save_proposal_line_item',
        'delete_proposal_line_item',
        'update_job_proposal_settings',
        'set_job_proposal_status',
        'begin_proposal_document_version',
        'complete_proposal_document_version',
        'fail_proposal_document_version'
      )
  ) as proposal_rpcs,
  has_function_privilege(
    'authenticated',
    'public.ensure_job_proposal(uuid, uuid)',
    'execute'
  ) as authenticated_can_ensure,
  has_function_privilege(
    'authenticated',
    'public.save_proposal_line_item(uuid, uuid, uuid, uuid, text, text, text, numeric, numeric, boolean)',
    'execute'
  ) as authenticated_can_save_line,
  has_function_privilege(
    'authenticated',
    'public.begin_proposal_document_version(uuid, uuid, uuid, jsonb)',
    'execute'
  ) as authenticated_can_generate_document;
