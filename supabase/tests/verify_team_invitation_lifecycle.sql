select
  (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'organization_invitations' and column_name in ('expires_at', 'last_sent_at', 'send_count', 'recipient_name')) as invitation_lifecycle_columns,
  (select count(*) from pg_proc procedure join pg_namespace namespace on namespace.oid = procedure.pronamespace where namespace.nspname = 'public' and procedure.proname = 'mark_organization_invitation_sent') as mark_sent_rpc,
  (select count(*) from pg_proc procedure join pg_namespace namespace on namespace.oid = procedure.pronamespace where namespace.nspname = 'public' and procedure.proname = 'revoke_organization_invitation') as revoke_rpc,
  (select count(*) from pg_proc procedure join pg_namespace namespace on namespace.oid = procedure.pronamespace where namespace.nspname = 'public' and procedure.proname = 'get_current_invitation') as current_invitation_rpc,
  (select count(*) from pg_proc procedure join pg_namespace namespace on namespace.oid = procedure.pronamespace where namespace.nspname = 'public' and procedure.proname = 'activate_current_invitation') as activate_rpc,
  (select count(*) from pg_proc procedure join pg_namespace namespace on namespace.oid = procedure.pronamespace where namespace.nspname = 'public' and procedure.proname = 'update_organization_member_access') as update_member_access_rpc;
