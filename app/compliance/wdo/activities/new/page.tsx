import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, ClipboardPlus } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import { canAccessWdoCompliance } from "@/lib/access";
import { getCurrentContext } from "@/lib/current-organization";
import { CALIFORNIA_WDO_ACTIVITY_CODES } from "@/lib/wdo/california/activity-codes";
import { createWdoActivity } from "../../actions";

type NewWdoActivityPageProps = {
  searchParams: Promise<{ error?: string }>;
};

function one<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

export default async function NewWdoActivityPage({ searchParams }: NewWdoActivityPageProps) {
  const messages = await searchParams;
  const { supabase, organization, userName, membership } = await getCurrentContext();
  if (!canAccessWdoCompliance(membership.role)) redirect("/jobs");
  const [
    { data: jobs, error: jobsError },
    { data: inspectors, error: inspectorsError },
    { data: branches, error: branchesError },
  ] = await Promise.all([
    supabase
      .from("inspection_jobs")
      .select("id, job_number, inspection_at, report_type, inspected_by_id, properties(street_line_1, city, region, postal_code)")
      .eq("organization_id", organization.id)
      .neq("status", "cancelled")
      .order("created_at", { ascending: false })
      .limit(500),
    supabase
      .from("inspectors")
      .select("id, full_name, license_number")
      .eq("organization_id", organization.id)
      .eq("is_active", true)
      .order("full_name"),
    supabase
      .from("wdo_branches")
      .select("id, name, registration_number")
      .eq("organization_id", organization.id)
      .eq("is_active", true)
      .order("name"),
  ]);
  const firstError = jobsError || inspectorsError || branchesError;
  if (firstError) throw new Error(firstError.message);

  return (
    <AppShell organizationName={organization.name} userName={userName} membershipRole={membership.role} active="compliance">
      <div className="page-heading">
        <div><p className="eyebrow">California compliance</p><h1>Add WDO activity</h1><p>Create a completion, correction, separated report, or other regulatory activity linked to an existing job.</p></div>
      </div>
      <div className="wdo-form-page">
        {messages.error ? <div className="form-alert error"><AlertTriangle size={17} /> {messages.error}</div> : null}
        <section className="wdo-form-panel">
          <div className="management-panel-intro">
            <div className="onboarding-icon"><ClipboardPlus size={22} /></div>
            <div><p className="eyebrow">Regulatory event</p><h2>Activity details</h2><p>Use the actual event date. Creating this record does not generate a PDF and does not mark anything filed.</p></div>
          </div>
          <form action={createWdoActivity} className="wdo-activity-form">
            <label className="field-span-2">
              Inspection job / property
              <select name="jobId" required defaultValue="">
                <option value="" disabled>Select a job</option>
                {(jobs ?? []).map((job) => {
                  const property = one(job.properties);
                  return (
                    <option value={job.id} key={job.id}>
                      #{job.job_number} · {property?.street_line_1 || "Property pending"}, {property?.city || ""} {property?.postal_code || ""}
                    </option>
                  );
                })}
              </select>
            </label>
            <label>
              Activity date
              <input name="activityDate" type="date" required />
            </label>
            <label>
              Activity type
              <select name="activityCode" required defaultValue="5">
                {(Object.entries(CALIFORNIA_WDO_ACTIVITY_CODES)).map(([code, config]) => (
                  <option value={code} key={code}>{code} · {config.label}</option>
                ))}
              </select>
            </label>
            <label>
              Responsible inspector / licensee
              <select name="inspectorId" required defaultValue="">
                <option value="" disabled>Select an inspector</option>
                {(inspectors ?? []).map((inspector) => (
                  <option value={inspector.id} key={inspector.id}>
                    {inspector.full_name}{inspector.license_number ? ` · ${inspector.license_number}` : " · license missing"}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Office
              <select name="branchId" defaultValue="">
                <option value="">Principal Office</option>
                {(branches ?? []).map((branch) => (
                  <option value={branch.id} key={branch.id}>{branch.name}{branch.registration_number ? ` · ${branch.registration_number}` : ""}</option>
                ))}
              </select>
              <small>Branch-assigned records cannot be serialized until the SPCB branch TXT layout is verified.</small>
            </label>
            <div className="form-actions field-span-2">
              <Link className="secondary-button" href="/compliance/wdo">Cancel</Link>
              <PendingSubmitButton className="primary-button" pendingLabel="Creating WDO activity">Create WDO activity</PendingSubmitButton>
            </div>
          </form>
        </section>
      </div>
    </AppShell>
  );
}
