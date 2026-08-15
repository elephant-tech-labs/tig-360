import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "../supabase/migrations/20260811123000_california_wdo_activity_export.sql",
  import.meta.url,
);

test("WDO migration creates organization-scoped RLS tables and immutable history", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  for (const table of ["wdo_branches", "wdo_activities", "wdo_export_batches", "wdo_export_batch_items"]) {
    assert.match(sql, new RegExp(`create table public\\.${table}`));
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`));
  }
  assert.match(sql, /unique \(organization_id, source_key\)/);
  assert.match(sql, /normalized_record jsonb not null/);
  assert.match(sql, /wdo_export_batches_protect_history/);
  assert.match(sql, /wdo_export_batch_items_protect_history/);
  assert.match(sql, /file_checksum_sha256/);
  assert.match(sql, /serializer_version/);
});

test("reconciliation and automatic inspection activity creation are idempotent", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  assert.match(sql, /inspection_jobs_sync_wdo_activity/);
  assert.match(sql, /'inspection_job:' \|\| new\.id::text/);
  assert.match(sql, /on conflict \(organization_id, source_key\) do update/);
  assert.match(sql, /create or replace function public\.reconcile_wdo_inspection_activities/);
  assert.match(sql, /'jobsExamined'/);
  assert.match(sql, /'activitiesCreated'/);
  assert.match(sql, /'alreadyExisting'/);
  assert.match(sql, /'needsAttention'/);
});

test("batch RPC is atomic, idempotent, and preserves re-export history", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  assert.match(sql, /create or replace function public\.create_wdo_export_batch/);
  assert.match(sql, /pg_advisory_xact_lock/);
  assert.match(sql, /unique \(organization_id, idempotency_key\)/);
  assert.match(sql, /A re-export reason is required/);
  assert.match(sql, /insert into public\.wdo_export_batches/);
  assert.match(sql, /insert into public\.wdo_export_batch_items/);
  const activityTable = sql.slice(
    sql.indexOf("create table public.wdo_activities"),
    sql.indexOf("create index wdo_activities_org_date_idx"),
  );
  assert.doesNotMatch(activityTable, /export_batch_id/);
});

test("branch serialization is blocked in both application validation and database RPC", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  assert.match(sql, /Branch-office TXT format requires verification before generation\./);
  assert.match(sql, /activity\.branch_id is not null/);
});

test("server-side permissions include office filing roles and exclude inspectors", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  assert.match(sql, /array\['administrator', 'manager', 'office_coordinator'\]::public\.membership_role\[\]/);
  assert.doesNotMatch(sql, /array\[[^\]]*'inspector'[^\]]*\]::public\.membership_role\[\]/);
  assert.match(sql, /revoke all on function public\.create_wdo_export_batch/);
  assert.match(sql, /grant execute on function public\.create_wdo_export_batch[\s\S]*to authenticated/);
});

test("queue filters regulatory activity_date inclusively", async () => {
  const page = await readFile(new URL("../app/compliance/wdo/page.tsx", import.meta.url), "utf8");
  const table = await readFile(new URL("../components/wdo-activity-table.tsx", import.meta.url), "utf8");
  assert.match(page, /\.gte\("activity_date", dateFrom\)/);
  assert.match(page, /\.lte\("activity_date", dateTo\)/);
  assert.match(page, /Select All applies only to ready rows currently shown/);
  assert.match(table, /disabled=\{!ready\}/);
});
