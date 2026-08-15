import { randomUUID } from "node:crypto";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  AlertTriangle,
  Check,
  FileClock,
  FilePlus2,
  History,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import { WdoActivityTable } from "@/components/wdo-activity-table";
import { canAccessWdoCompliance } from "@/lib/access";
import { getCurrentContext } from "@/lib/current-organization";
import { californiaWdoActivityLabel } from "@/lib/wdo/california/activity-codes";
import {
  calendarDateInTimeZone,
  getCaliforniaWdoDeadline,
} from "@/lib/wdo/california/deadlines";
import { mapCaliforniaWdoActivity } from "@/lib/wdo/california/mapper";
import { groupCaliforniaWdoIssuesForOffice } from "@/lib/wdo/california/readiness";
import type { WdoPriorExport, WdoQueueRow } from "@/lib/wdo/queue";
import { reconcileWdoActivities } from "./actions";

type WdoPageProps = {
  searchParams: Promise<{
    from?: string;
    to?: string;
    branch?: string;
    status?: string;
    preset?: string;
    saved?: string;
    error?: string;
  }>;
};

const ACTIVITY_SELECT = `
  id, inspection_job_id, activity_date, activity_code, branch_id, source_type,
  override_building_number, override_street, override_city, override_zip_code,
  inspection_jobs(id, job_number, wdo_filing_requirement),
  properties(building_number, street_name, unit_or_suite, street_line_1, street_line_2, city, region, postal_code),
  inspectors(id, full_name, license_number),
  wdo_branches(id, name, registration_number),
  wdo_export_batch_items(
    export_batch_id,
    wdo_export_batches(
      id, filename, generated_at, status, spcb_submittal_number, created_by
    )
  )
`;

function one<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

function isoDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

function rangeForPreset(todayValue: string, preset: string) {
  const today = new Date(`${todayValue}T12:00:00Z`);
  if (preset === "this_week" || preset === "last_week") {
    const mondayOffset = (today.getUTCDay() + 6) % 7;
    const monday = new Date(today);
    monday.setUTCDate(today.getUTCDate() - mondayOffset - (preset === "last_week" ? 7 : 0));
    const sunday = new Date(monday);
    sunday.setUTCDate(monday.getUTCDate() + 6);
    return { from: isoDate(monday), to: isoDate(sunday) };
  }
  const year = today.getUTCFullYear();
  const month = today.getUTCMonth();
  return {
    from: isoDate(new Date(Date.UTC(year, month, 1))),
    to: isoDate(new Date(Date.UTC(year, month + 1, 0))),
  };
}

function filterHref(
  dateFrom: string,
  dateTo: string,
  branch: string,
  status: string,
) {
  const params = new URLSearchParams({ from: dateFrom, to: dateTo, status });
  if (branch) params.set("branch", branch);
  return `/compliance/wdo?${params.toString()}`;
}

export default async function WdoActivityExportPage({ searchParams }: WdoPageProps) {
  const messages = await searchParams;
  const { supabase, organization, userName, membership } = await getCurrentContext();
  if (!canAccessWdoCompliance(membership.role)) redirect("/jobs");

  const today = calendarDateInTimeZone(new Date(), organization.timezone ?? "America/Los_Angeles");
  const preset = messages.preset || "this_month";
  const presetRange = rangeForPreset(today, preset);
  const dateFrom = /^\d{4}-\d{2}-\d{2}$/.test(messages.from ?? "")
    ? messages.from!
    : presetRange.from;
  const dateTo = /^\d{4}-\d{2}-\d{2}$/.test(messages.to ?? "")
    ? messages.to!
    : presetRange.to;
  const branchFilter = messages.branch ?? "";
  const statusFilter = messages.status ?? "open";

  const [
    { data: datedActivities, error: datedError },
    { data: undatedActivities, error: undatedError },
    { data: profile, error: profileError },
    { data: branches, error: branchError },
    { data: batches, error: batchError },
  ] = await Promise.all([
    supabase
      .from("wdo_activities")
      .select(ACTIVITY_SELECT)
      .eq("organization_id", organization.id)
      .eq("status", "active")
      .gte("activity_date", dateFrom)
      .lte("activity_date", dateTo)
      .order("activity_date", { ascending: true })
      .limit(1000),
    supabase
      .from("wdo_activities")
      .select(ACTIVITY_SELECT)
      .eq("organization_id", organization.id)
      .eq("status", "active")
      .is("activity_date", null)
      .order("created_at", { ascending: false })
      .limit(250),
    supabase
      .from("organization_report_profiles")
      .select("legal_name, registration_number")
      .eq("organization_id", organization.id)
      .maybeSingle(),
    supabase
      .from("wdo_branches")
      .select("id, name, registration_number, is_active")
      .eq("organization_id", organization.id)
      .order("name"),
    supabase
      .from("wdo_export_batches")
      .select("id, filename, generated_at, date_from, date_to, number_of_activities, status, spcb_submittal_number, created_by, branch_id")
      .eq("organization_id", organization.id)
      .order("generated_at", { ascending: false })
      .limit(50),
  ]);
  const firstError = datedError || undatedError || profileError || branchError || batchError;
  if (firstError) throw new Error(firstError.message);

  const activities = [...(datedActivities ?? []), ...(undatedActivities ?? [])].filter((activity) => {
    const job = one(activity.inspection_jobs);
    return activity.source_type !== "inspection_job" || job?.wdo_filing_requirement === "required";
  });
  const userIds = new Set<string>((batches ?? []).map((batch) => batch.created_by));
  for (const activity of activities) {
    for (const item of activity.wdo_export_batch_items ?? []) {
      const priorBatch = one(item.wdo_export_batches);
      if (priorBatch?.created_by) userIds.add(priorBatch.created_by);
    }
  }
  const { data: users, error: usersError } = userIds.size
    ? await supabase.from("profiles").select("id, full_name, email").in("id", [...userIds])
    : { data: [], error: null };
  if (usersError) throw new Error(usersError.message);
  const userNames = new Map((users ?? []).map((user) => [
    user.id,
    user.full_name || user.email || "Team member",
  ]));

  const rows: WdoQueueRow[] = activities.map((activity) => {
    const property = one(activity.properties);
    const inspector = one(activity.inspectors);
    const branch = one(activity.wdo_branches);
    const job = one(activity.inspection_jobs);
    const priorExports = (activity.wdo_export_batch_items ?? []).flatMap((item): WdoPriorExport[] => {
      const priorBatch = one(item.wdo_export_batches);
      if (!priorBatch) return [];
      return [{
        batchId: priorBatch.id,
        filename: priorBatch.filename,
        generatedAt: priorBatch.generated_at,
        status: priorBatch.status as "generated" | "filed",
        createdBy: userNames.get(priorBatch.created_by) ?? "Team member",
        spcbSubmittalNumber: priorBatch.spcb_submittal_number,
      }];
    }).sort((a, b) => b.generatedAt.localeCompare(a.generatedAt));
    const mapped = mapCaliforniaWdoActivity({
      activityId: activity.id,
      activityDate: activity.activity_date,
      activityCode: activity.activity_code,
      branchId: activity.branch_id,
      branchName: branch?.name ?? null,
      companyName: profile?.legal_name ?? null,
      registrationNumber: profile?.registration_number ?? null,
      inspectorLicenseNumber: inspector?.license_number ?? null,
      inspectorName: inspector?.full_name ?? null,
      address: {
        buildingNumber: property?.building_number ?? null,
        streetName: property?.street_name ?? null,
        unitOrSuite: property?.unit_or_suite ?? null,
        streetLine1: property?.street_line_1 ?? null,
        streetLine2: property?.street_line_2 ?? null,
        city: property?.city ?? null,
        region: property?.region ?? null,
        zipCode: property?.postal_code ?? null,
        overrideBuildingNumber: activity.override_building_number,
        overrideStreet: activity.override_street,
        overrideCity: activity.override_city,
        overrideZipCode: activity.override_zip_code,
      },
      links: {
        activity: job?.id ? `/jobs/${job.id}/edit#wdo-filing` : `/compliance/wdo/activities/${activity.id}`,
        property: job?.id ? `/jobs/${job.id}/edit#property-address` : undefined,
        inspector: "/team/inspectors",
        companySettings: "/management",
      },
    });
    const filed = priorExports.some((prior) => prior.status === "filed");
    return {
      id: activity.id,
      jobId: job?.id ?? null,
      jobNumber: job?.job_number ? Number(job.job_number) : null,
      exclusionHref: job?.id
        ? `/jobs/${job.id}/edit#wdo-filing`
        : `/compliance/wdo/activities/${activity.id}#void-activity`,
      activityDate: activity.activity_date,
      property: [
        property?.street_line_1 || "Property address pending",
        property?.street_line_2,
        [property?.city, property?.region, property?.postal_code].filter(Boolean).join(" "),
      ].filter(Boolean).join(", "),
      activityType: californiaWdoActivityLabel(activity.activity_code),
      inspectorName: inspector?.full_name || "Not selected",
      inspectorLicenseNumber: inspector?.license_number ?? null,
      branchName: branch?.name || "Principal Office",
      deadline: getCaliforniaWdoDeadline(activity.activity_date, today),
      exportStatus: filed ? "filed" : priorExports.length ? "generated_previously" : "not_generated",
      issues: groupCaliforniaWdoIssuesForOffice(mapped.issues),
      priorExports,
    };
  });
  const activityBranchIds = new Map(activities.map((activity) => [activity.id, activity.branch_id]));

  const branchRows = branchFilter === "principal"
    ? rows.filter((row) => row.branchName === "Principal Office")
    : branchFilter
      ? rows.filter((row) => activityBranchIds.get(row.id) === branchFilter)
      : rows;
  const summary = {
    total: branchRows.length,
    ready: branchRows.filter((row) => !row.issues.length).length,
    attention: branchRows.filter((row) => row.issues.length).length,
    generated: branchRows.filter((row) => row.exportStatus === "generated_previously").length,
    filed: branchRows.filter((row) => row.exportStatus === "filed").length,
  };
  const filteredRows = branchRows.filter((row) => {
    if (statusFilter === "all") return true;
    if (statusFilter === "attention") return row.issues.length > 0;
    if (statusFilter === "ready") return row.issues.length === 0 && row.exportStatus === "not_generated";
    if (statusFilter === "generated") return row.exportStatus === "generated_previously";
    if (statusFilter === "filed") return row.exportStatus === "filed";
    return row.exportStatus !== "filed";
  });
  const branchNames = new Map((branches ?? []).map((branch) => [branch.id, branch.name]));

  return (
    <AppShell
      organizationName={organization.name}
      userName={userName}
      membershipRole={membership.role}
      active="compliance"
    >
      <div className="page-heading wdo-page-heading">
        <div>
          <p className="eyebrow">California compliance</p>
          <h1>WDO Activity Export</h1>
          <p>Generate and track California WDO activity files for SPCB Connect.</p>
        </div>
        <div className="wdo-heading-actions">
          <form action={reconcileWdoActivities}>
            <PendingSubmitButton className="secondary-button" pendingLabel="Reconciling jobs">
              <RefreshCw size={16} /> Reconcile existing jobs
            </PendingSubmitButton>
          </form>
          <Link className="primary-button" href="/compliance/wdo/activities/new">
            <FilePlus2 size={16} /> Add WDO activity
          </Link>
        </div>
      </div>

      <div className="wdo-page">
        {messages.saved ? <div className="form-alert success"><Check size={17} /> {messages.saved}</div> : null}
        {messages.error ? <div className="form-alert error"><AlertTriangle size={17} /> {messages.error}</div> : null}

        <section className="wdo-filter-panel">
          <form method="get">
            <label>Activity Date From<input name="from" type="date" defaultValue={dateFrom} /></label>
            <label>Activity Date To<input name="to" type="date" defaultValue={dateTo} /></label>
            <label>
              Branch
              <select name="branch" defaultValue={branchFilter}>
                <option value="">All offices</option>
                <option value="principal">Principal Office</option>
                {(branches ?? []).filter((branch) => branch.is_active).map((branch) => (
                  <option value={branch.id} key={branch.id}>{branch.name}</option>
                ))}
              </select>
            </label>
            <label>
              Status
              <select name="status" defaultValue={statusFilter}>
                <option value="open">Open compliance work</option>
                <option value="attention">Needs attention</option>
                <option value="ready">Not generated · ready</option>
                <option value="generated">Generated · not filed</option>
                <option value="filed">Filed</option>
                <option value="all">All statuses</option>
              </select>
            </label>
            <button className="primary-button" type="submit">Apply filters</button>
          </form>
          <div className="wdo-date-presets" aria-label="Date presets">
            <Link href={`/compliance/wdo?preset=this_week&status=${statusFilter}`}>This Week</Link>
            <Link href={`/compliance/wdo?preset=last_week&status=${statusFilter}`}>Last Week</Link>
            <Link href={`/compliance/wdo?preset=this_month&status=${statusFilter}`}>This Month</Link>
          </div>
        </section>

        <nav className="wdo-summary" aria-label="WDO activity summary">
          <Link href={filterHref(dateFrom, dateTo, branchFilter, "all")}><strong>{summary.total}</strong><span>Activities</span></Link>
          <Link href={filterHref(dateFrom, dateTo, branchFilter, "ready")}><strong>{summary.ready}</strong><span>Ready</span></Link>
          <Link href={filterHref(dateFrom, dateTo, branchFilter, "attention")}><strong>{summary.attention}</strong><span>Need attention</span></Link>
          <Link href={filterHref(dateFrom, dateTo, branchFilter, "generated")}><strong>{summary.generated}</strong><span>Generated</span></Link>
          <Link href={filterHref(dateFrom, dateTo, branchFilter, "filed")}><strong>{summary.filed}</strong><span>Filed</span></Link>
        </nav>

        <section className="wdo-queue-panel">
          <div className="section-heading">
            <div><p className="eyebrow">Activity queue</p><h2>California WDO activities</h2></div>
            <span className="section-subtitle">Select All applies only to ready rows currently shown.</span>
          </div>
          {filteredRows.length ? (
            <WdoActivityTable rows={filteredRows} dateFrom={dateFrom} dateTo={dateTo} idempotencyKey={randomUUID()} />
          ) : (
            <div className="empty-state wdo-empty-state">
              <ShieldCheck size={25} />
              <h3>{statusFilter === "open" ? "No WDO activities require action for this date range." : "No activities match these filters."}</h3>
              <p>Change the date or status filters, or reconcile existing inspection jobs.</p>
            </div>
          )}
        </section>

        <section className="wdo-history-panel">
          <div className="section-heading">
            <div><p className="eyebrow">Audit history</p><h2>Export History</h2></div>
            <History size={19} />
          </div>
          {(batches ?? []).length ? (
            <div className="wdo-history-list">
              <div className="wdo-history-head"><span>Batch / Filename</span><span>Generated</span><span>Activity range</span><span>Branch</span><span>Activities</span><span>Created by</span><span>Status</span></div>
              {(batches ?? []).map((batch) => (
                <Link className="wdo-history-row" href={`/compliance/wdo/batches/${batch.id}`} key={batch.id}>
                  <strong>{batch.filename}</strong>
                  <span>{new Date(batch.generated_at).toLocaleString()}</span>
                  <span>{batch.date_from || "—"} to {batch.date_to || "—"}</span>
                  <span>{batch.branch_id ? branchNames.get(batch.branch_id) || "Branch" : "Principal Office"}</span>
                  <span>{batch.number_of_activities}</span>
                  <span>{userNames.get(batch.created_by) || "Team member"}</span>
                  <span className={`wdo-status status-${batch.status}`}>{batch.status === "filed" ? `Filed${batch.spcb_submittal_number ? ` · ${batch.spcb_submittal_number}` : ""}` : "Generated"}</span>
                </Link>
              ))}
            </div>
          ) : (
            <div className="compact-empty"><FileClock size={22} /><div><strong>No WDO export batches yet</strong><span>Generated files and filing details will appear here.</span></div></div>
          )}
        </section>
      </div>
    </AppShell>
  );
}
