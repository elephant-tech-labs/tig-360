select
  (
    select count(*)
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'job_proposals'
      and column_name in (
        'customer_summary',
        'customer_summary_generated_at',
        'customer_summary_source'
      )
  ) as proposal_summary_columns,
  (
    select count(*)
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'proposal_review_links'
  ) as review_links_table,
  (
    select count(*)
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'proposal_review_links'
      and column_name in (
        'organization_id',
        'inspection_job_id',
        'proposal_id',
        'report_document_version_id',
        'proposal_document_version_id',
        'contact_id',
        'delivery_id',
        'signer_name',
        'signer_email',
        'token_hash',
        'status',
        'expires_at',
        'last_viewed_at',
        'created_by'
      )
  ) as review_link_columns,
  has_table_privilege('authenticated', 'public.proposal_review_links', 'select') as authenticated_can_select_links,
  has_table_privilege('authenticated', 'public.proposal_review_links', 'insert') as authenticated_can_insert_links;
