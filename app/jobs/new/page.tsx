import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, ClipboardPlus } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import {
  InspectionJobForm,
  type InspectorOption,
  type PriorInspectionOption,
} from "@/components/inspection-job-form";
import { canCreateJobs } from "@/lib/access";
import { getCurrentContext } from "@/lib/current-organization";
import { createInspectionJob } from "../actions";

type NewJobPageProps = {
  searchParams: Promise<{ error?: string }>;
};

export default async function NewJobPage({ searchParams }: NewJobPageProps) {
  const { supabase, organization, userName, membership } = await getCurrentContext();
  if (!canCreateJobs(membership.role)) redirect("/jobs");
  const params = await searchParams;
  const [
    { data: previousJobs, error },
    { data: inspectorRows, error: inspectorError },
  ] = await Promise.all([
    supabase
      .from("inspection_jobs")
      .select(`
        id,
        job_number,
        report_type,
        status,
        inspection_at,
        properties(building_number, street_name, unit_or_suite, street_line_1, street_line_2, city, region, postal_code, county, property_type)
      `)
      .eq("organization_id", organization.id)
      .order("job_number", { ascending: false }),
    supabase
      .from("inspectors")
      .select("id, full_name, email, license_number, signature_path")
      .eq("organization_id", organization.id)
      .eq("is_active", true)
      .order("full_name"),
  ]);

  if (error) throw new Error(error.message);
  if (inspectorError) throw new Error(inspectorError.message);
  const priorInspections: PriorInspectionOption[] = (previousJobs ?? []).flatMap((job) => {
    const property = Array.isArray(job.properties) ? job.properties[0] : job.properties;
    if (!property) return [];
    return [{
      id: job.id,
      jobNumber: job.job_number,
      reportType: job.report_type,
      status: job.status,
      inspectionAt: job.inspection_at,
      buildingNumber: property.building_number,
      streetName: property.street_name,
      unitOrSuite: property.unit_or_suite,
      streetLine1: property.street_line_1,
      streetLine2: property.street_line_2,
      city: property.city,
      region: property.region,
      postalCode: property.postal_code,
      county: property.county,
      propertyType: property.property_type,
    }];
  });
  const inspectors: InspectorOption[] = (inspectorRows ?? []).map((row) => ({
    userId: row.id,
    name: row.full_name,
    email: row.email,
    licenseNumber: row.license_number,
    hasSignature: Boolean(row.signature_path),
  }));

  return (
    <AppShell organizationName={organization.name} userName={userName} membershipRole={membership.role}>
      <div className="form-page">
        <Link className="back-link" href="/jobs"><ArrowLeft size={16} /> Back to jobs</Link>
        <div className="form-page-heading">
          <div className="onboarding-icon"><ClipboardPlus size={23} /></div>
          <div>
            <p className="eyebrow">New inspection</p>
            <h1>Create an inspection job</h1>
            <p>Add the property and initial scheduling details. Contacts can be assigned next.</p>
          </div>
        </div>

        {params.error ? <div className="form-alert error">{params.error}</div> : null}

        <InspectionJobForm
          action={createInspectionJob}
          organizationId={organization.id}
          cancelHref="/jobs"
          submitLabel="Create job"
          pendingLabel="Creating job"
          priorInspections={priorInspections}
          inspectors={inspectors}
        />
      </div>
    </AppShell>
  );
}
