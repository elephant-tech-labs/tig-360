import Link from "next/link";
import { ArrowLeft, ClipboardPlus } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import {
  InspectionJobForm,
  type PriorInspectionOption,
} from "@/components/inspection-job-form";
import { getCurrentContext } from "@/lib/current-organization";
import { createInspectionJob } from "../actions";

type NewJobPageProps = {
  searchParams: Promise<{ error?: string }>;
};

export default async function NewJobPage({ searchParams }: NewJobPageProps) {
  const { supabase, organization, userName } = await getCurrentContext();
  const params = await searchParams;
  const { data: previousJobs, error } = await supabase
    .from("inspection_jobs")
    .select(`
      id,
      job_number,
      report_type,
      status,
      inspection_at,
      properties(street_line_1, street_line_2, city, region, postal_code, property_type)
    `)
    .eq("organization_id", organization.id)
    .order("job_number", { ascending: false });

  if (error) throw new Error(error.message);
  const priorInspections: PriorInspectionOption[] = (previousJobs ?? []).flatMap((job) => {
    const property = Array.isArray(job.properties) ? job.properties[0] : job.properties;
    if (!property) return [];
    return [{
      id: job.id,
      jobNumber: job.job_number,
      reportType: job.report_type,
      status: job.status,
      inspectionAt: job.inspection_at,
      streetLine1: property.street_line_1,
      streetLine2: property.street_line_2,
      city: property.city,
      region: property.region,
      postalCode: property.postal_code,
      propertyType: property.property_type,
    }];
  });

  return (
    <AppShell organizationName={organization.name} userName={userName}>
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
        />
      </div>
    </AppShell>
  );
}
