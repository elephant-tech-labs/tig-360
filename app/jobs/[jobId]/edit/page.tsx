import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Pencil } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import {
  InspectionJobForm,
  type PriorInspectionOption,
} from "@/components/inspection-job-form";
import { getCurrentContext } from "@/lib/current-organization";
import { updateInspectionJob } from "@/app/jobs/actions";

type EditJobPageProps = {
  params: Promise<{ jobId: string }>;
  searchParams: Promise<{ error?: string }>;
};

function dateTimeLocalValue(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 16);
}

export default async function EditJobPage({ params, searchParams }: EditJobPageProps) {
  const { jobId } = await params;
  const { error: message } = await searchParams;
  const { supabase, organization, userName } = await getCurrentContext();

  const [{ data: job, error }, { data: previousJobs, error: previousJobsError }] =
    await Promise.all([
      supabase
        .from("inspection_jobs")
        .select(`
          id,
          job_number,
          report_type,
          inspection_at,
          prior_job_id,
          internal_notes,
          properties(street_line_1, street_line_2, city, region, postal_code, property_type)
        `)
        .eq("id", jobId)
        .single(),
      supabase
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
        .neq("id", jobId)
        .order("job_number", { ascending: false }),
    ]);

  if (error || !job) notFound();
  if (previousJobsError) throw new Error(previousJobsError.message);
  const property = Array.isArray(job.properties) ? job.properties[0] : job.properties;
  if (!property) notFound();

  const priorInspections: PriorInspectionOption[] = (previousJobs ?? []).flatMap((prior) => {
    const priorProperty = Array.isArray(prior.properties)
      ? prior.properties[0]
      : prior.properties;
    if (!priorProperty) return [];
    return [{
      id: prior.id,
      jobNumber: prior.job_number,
      reportType: prior.report_type,
      status: prior.status,
      inspectionAt: prior.inspection_at,
      streetLine1: priorProperty.street_line_1,
      streetLine2: priorProperty.street_line_2,
      city: priorProperty.city,
      region: priorProperty.region,
      postalCode: priorProperty.postal_code,
      propertyType: priorProperty.property_type,
    }];
  });

  return (
    <AppShell organizationName={organization.name} userName={userName}>
      <div className="form-page">
        <Link className="back-link" href={`/jobs/${jobId}`}>
          <ArrowLeft size={16} /> Back to job #{job.job_number}
        </Link>
        <div className="form-page-heading">
          <div className="onboarding-icon"><Pencil size={22} /></div>
          <div>
            <p className="eyebrow">Job setup</p>
            <h1>Edit inspection job</h1>
            <p>Update the property, scheduling, report type, and prior-inspection link.</p>
          </div>
        </div>

        {message ? <div className="form-alert error">{message}</div> : null}

        <InspectionJobForm
          action={updateInspectionJob}
          organizationId={organization.id}
          jobId={jobId}
          cancelHref={`/jobs/${jobId}`}
          submitLabel="Save changes"
          pendingLabel="Saving changes"
          priorInspections={priorInspections}
          initialValues={{
            streetLine1: property.street_line_1,
            streetLine2: property.street_line_2 ?? "",
            city: property.city,
            region: property.region,
            postalCode: property.postal_code,
            propertyType: property.property_type ?? "single_family",
            reportType: job.report_type,
            inspectionAt: dateTimeLocalValue(job.inspection_at),
            priorJobId: job.prior_job_id ?? "",
            internalNotes: job.internal_notes ?? "",
          }}
        />
      </div>
    </AppShell>
  );
}
