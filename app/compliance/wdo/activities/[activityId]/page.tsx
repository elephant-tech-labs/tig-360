import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AlertTriangle, Check, ExternalLink, MapPinned, ShieldAlert } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import { canAccessWdoCompliance } from "@/lib/access";
import { getCurrentContext } from "@/lib/current-organization";
import { CALIFORNIA_WDO_ACTIVITY_CODES } from "@/lib/wdo/california/activity-codes";
import { mapCaliforniaWdoActivity } from "@/lib/wdo/california/mapper";
import { updateWdoActivity } from "../../actions";

type WdoActivityPageProps = {
  params: Promise<{ activityId: string }>;
  searchParams: Promise<{ saved?: string; error?: string }>;
};

function one<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

export default async function WdoActivityPage({ params, searchParams }: WdoActivityPageProps) {
  const { activityId } = await params;
  const messages = await searchParams;
  const { supabase, organization, userName, membership } = await getCurrentContext();
  if (!canAccessWdoCompliance(membership.role)) redirect("/jobs");
  const [
    { data: activity, error: activityError },
    { data: profile, error: profileError },
    { data: inspectors, error: inspectorsError },
    { data: branches, error: branchesError },
  ] = await Promise.all([
    supabase
      .from("wdo_activities")
      .select(`
        id, inspection_job_id, activity_date, activity_code, activity_date_source,
        activity_code_source, inspector_source, branch_id, source_type,
        override_building_number, override_street, override_city, override_zip_code,
        inspection_jobs(id, job_number, report_type, inspection_at),
        properties(id, street_line_1, street_line_2, city, region, postal_code),
        inspectors(id, full_name, license_number),
        wdo_branches(id, name, registration_number),
        wdo_export_batch_items(
          export_batch_id,
          wdo_export_batches(id, filename, generated_at, status, spcb_submittal_number)
        )
      `)
      .eq("organization_id", organization.id)
      .eq("id", activityId)
      .eq("status", "active")
      .maybeSingle(),
    supabase
      .from("organization_report_profiles")
      .select("legal_name, registration_number")
      .eq("organization_id", organization.id)
      .maybeSingle(),
    supabase
      .from("inspectors")
      .select("id, full_name, license_number, is_active")
      .eq("organization_id", organization.id)
      .order("full_name"),
    supabase
      .from("wdo_branches")
      .select("id, name, registration_number, is_active")
      .eq("organization_id", organization.id)
      .order("name"),
  ]);
  const firstError = activityError || profileError || inspectorsError || branchesError;
  if (firstError) throw new Error(firstError.message);
  if (!activity) notFound();

  const property = one(activity.properties);
  const currentInspector = one(activity.inspectors);
  const currentBranch = one(activity.wdo_branches);
  const job = one(activity.inspection_jobs);
  const mapped = mapCaliforniaWdoActivity({
    activityId,
    activityDate: activity.activity_date,
    activityCode: activity.activity_code,
    branchId: activity.branch_id,
    branchName: currentBranch?.name ?? null,
    companyName: profile?.legal_name ?? null,
    registrationNumber: profile?.registration_number ?? null,
    inspectorLicenseNumber: currentInspector?.license_number ?? null,
    inspectorName: currentInspector?.full_name ?? null,
    address: {
      streetLine1: property?.street_line_1 ?? null,
      streetLine2: property?.street_line_2 ?? null,
      city: property?.city ?? null,
      zipCode: property?.postal_code ?? null,
      overrideBuildingNumber: activity.override_building_number,
      overrideStreet: activity.override_street,
      overrideCity: activity.override_city,
      overrideZipCode: activity.override_zip_code,
    },
    links: {
      activity: `/compliance/wdo/activities/${activityId}`,
      inspector: "/team/inspectors",
      companySettings: "/management",
    },
  });
  const priorBatches = (activity.wdo_export_batch_items ?? []).flatMap((item) => {
    const batch = one(item.wdo_export_batches);
    return batch ? [batch] : [];
  }).sort((a, b) => b.generated_at.localeCompare(a.generated_at));
  const hasAddressOverride = Boolean(
    activity.override_building_number
    || activity.override_street
    || activity.override_city
    || activity.override_zip_code,
  );

  return (
    <AppShell organizationName={organization.name} userName={userName} membershipRole={membership.role} active="compliance">
      <div className="page-heading">
        <div>
          <p className="eyebrow">California compliance</p>
          <h1>Review WDO activity</h1>
          <p>{job ? `Job #${job.job_number}` : "Regulatory activity"} · {property?.street_line_1 || "Property address pending"}</p>
        </div>
        {job ? <Link className="secondary-button" href={`/jobs/${job.id}`}><ExternalLink size={15} /> Open inspection job</Link> : null}
      </div>
      <div className="wdo-form-page">
        {messages.saved ? <div className="form-alert success"><Check size={17} /> {messages.saved}</div> : null}
        {messages.error ? <div className="form-alert error"><AlertTriangle size={17} /> {messages.error}</div> : null}

        {mapped.issues.length ? (
          <section className="wdo-issue-panel">
            <ShieldAlert size={21} />
            <div><strong>Needs Attention</strong><p>Resolve every item before this activity can be generated.</p>
              <ul>{mapped.issues.map((issue) => <li key={`${issue.field}-${issue.code}`}>{issue.href && issue.href !== `/compliance/wdo/activities/${activityId}` ? <Link href={issue.href}>{issue.message}</Link> : issue.message}</li>)}</ul>
            </div>
          </section>
        ) : <div className="form-alert success"><Check size={17} /> This activity is ready for the verified principal-office TXT serializer.</div>}

        <section className="wdo-form-panel">
          <div className="management-panel-intro">
            <div className="onboarding-icon"><MapPinned size={22} /></div>
            <div><p className="eyebrow">Normalized regulatory record</p><h2>Export representation</h2><p>These values are used for future exports. Previously generated batch snapshots remain unchanged.</p></div>
          </div>
          <form action={updateWdoActivity} className="wdo-activity-form">
            <input name="activityId" type="hidden" value={activityId} />
            <label>
              Activity date
              <input name="activityDate" type="date" defaultValue={activity.activity_date ?? ""} required />
              <small>{activity.activity_date_source === "derived" ? "Derived from the job inspection date; saving confirms it." : "Confirmed for this regulatory activity."}</small>
            </label>
            <label>
              Activity type
              <select name="activityCode" defaultValue={String(activity.activity_code ?? "")} required>
                <option value="" disabled>Select activity type</option>
                {Object.entries(CALIFORNIA_WDO_ACTIVITY_CODES).map(([code, config]) => (
                  <option value={code} key={code}>{code} · {config.label}</option>
                ))}
              </select>
            </label>
            <label>
              Responsible inspector / licensee
              <select name="inspectorId" defaultValue={currentInspector?.id ?? ""} required>
                <option value="" disabled>Select an inspector</option>
                {(inspectors ?? []).filter((inspector) => inspector.is_active || inspector.id === currentInspector?.id).map((inspector) => (
                  <option value={inspector.id} key={inspector.id}>{inspector.full_name}{inspector.license_number ? ` · ${inspector.license_number}` : " · license missing"}</option>
                ))}
              </select>
            </label>
            <label>
              Office
              <select name="branchId" defaultValue={currentBranch?.id ?? ""}>
                <option value="">Principal Office</option>
                {(branches ?? []).filter((branch) => branch.is_active || branch.id === currentBranch?.id).map((branch) => (
                  <option value={branch.id} key={branch.id}>{branch.name}{branch.registration_number ? ` · ${branch.registration_number}` : ""}</option>
                ))}
              </select>
              <small>Branch-office records are blocked until the external BR layout is verified.</small>
            </label>
            <fieldset className="field-span-2 wdo-address-fieldset">
              <legend>California TXT address</legend>
              <p>Canonical TIG property: {[property?.street_line_1, property?.street_line_2, property?.city, property?.region, property?.postal_code].filter(Boolean).join(", ")}</p>
              <div className="wdo-address-grid">
                <label>Building number<input name="buildingNumber" maxLength={6} defaultValue={mapped.record.buildingNumber} required /></label>
                <label className="wdo-street-field">Street and unit<input name="street" maxLength={50} defaultValue={mapped.record.street} required /></label>
                <label>City<input name="city" maxLength={50} defaultValue={mapped.record.city} required /></label>
                <label>ZIP code<input name="zipCode" maxLength={9} inputMode="numeric" defaultValue={mapped.record.zipCode} required /></label>
              </div>
              <label className="inline-check wdo-canonical-check"><input name="useCanonicalAddress" type="checkbox" /> Clear the regulatory override and derive from the canonical property again</label>
              {hasAddressOverride ? <small>A regulatory-specific address override is currently stored. It does not change the canonical TIG property.</small> : null}
            </fieldset>
            <div className="form-actions field-span-2">
              <Link className="secondary-button" href="/compliance/wdo">Back to WDO queue</Link>
              <PendingSubmitButton className="primary-button" pendingLabel="Saving WDO activity">Save WDO activity</PendingSubmitButton>
            </div>
          </form>
        </section>

        <section className="wdo-source-panel">
          <div><p className="eyebrow">Source and history</p><h2>Activity audit context</h2></div>
          <dl>
            <div><dt>Source</dt><dd>{activity.source_type.replaceAll("_", " ")}</dd></div>
            <div><dt>Job report type</dt><dd>{job?.report_type?.replaceAll("_", " ") || "—"}</dd></div>
            <div><dt>Company / PR</dt><dd>{profile?.legal_name || "Missing"} · {profile?.registration_number || "Missing"}</dd></div>
            <div><dt>Generated batches</dt><dd>{priorBatches.length}</dd></div>
          </dl>
          {priorBatches.length ? <div className="wdo-prior-batches">{priorBatches.map((batch) => <Link href={`/compliance/wdo/batches/${batch.id}`} key={batch.id}><strong>{batch.filename}</strong><span>{new Date(batch.generated_at).toLocaleString()} · {batch.status}{batch.spcb_submittal_number ? ` · ${batch.spcb_submittal_number}` : ""}</span></Link>)}</div> : null}
        </section>
      </div>
    </AppShell>
  );
}
