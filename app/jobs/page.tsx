import Link from "next/link";
import {
  ArrowRight,
  CalendarDays,
  ClipboardCheck,
  MapPin,
  Plus,
  UserRound,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { getCurrentContext } from "@/lib/current-organization";

function statusLabel(status: string) {
  return status.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default async function JobsPage() {
  const { supabase, organization, userName, membership } = await getCurrentContext();
  const { data: jobs, error } = await supabase
    .from("inspection_jobs")
    .select(`
      id,
      job_number,
      status,
      report_type,
      inspection_at,
      created_at,
      properties(street_line_1, street_line_2, city, region, postal_code)
    `)
    .eq("organization_id", organization.id)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);

  return (
    <AppShell organizationName={organization.name} userName={userName} membershipRole={membership.role}>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Inspection operations</p>
          <h1>Inspection jobs</h1>
          <p>Track every report from scheduling through delivery.</p>
        </div>
        <Link className="primary-button" href="/jobs/new"><Plus size={17} /> Create job</Link>
      </div>

      <section className="job-metrics">
        <div><ClipboardCheck size={20} /><strong>{jobs?.length ?? 0}</strong><span>Total jobs</span></div>
        <div><CalendarDays size={20} /><strong>{jobs?.filter((job) => job.status === "scheduled").length ?? 0}</strong><span>Scheduled</span></div>
        <div><UserRound size={20} /><strong>{jobs?.filter((job) => job.status === "in_review").length ?? 0}</strong><span>In review</span></div>
      </section>

      <section className="jobs-panel">
        <div className="section-heading">
          <div><h2>Recent jobs</h2><span className="section-subtitle">Newest activity first</span></div>
        </div>

        {jobs?.length ? (
          <div className="jobs-list">
            {jobs.map((job) => {
              const property = Array.isArray(job.properties) ? job.properties[0] : job.properties;
              return (
                <Link className="job-list-row" href={`/jobs/${job.id}`} key={job.id}>
                  <span className="job-number">#{job.job_number}</span>
                  <div className="job-address">
                    <strong>{property?.street_line_1 ?? "Property address pending"}</strong>
                    <span><MapPin size={14} /> {property?.city}, {property?.region} {property?.postal_code}</span>
                  </div>
                  <span className="report-type">{statusLabel(job.report_type)}</span>
                  <span className={`job-status status-${job.status}`}>{statusLabel(job.status)}</span>
                  <span className="job-date">
                    {job.inspection_at
                      ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(job.inspection_at))
                      : "Not scheduled"}
                  </span>
                  <ArrowRight size={18} />
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="empty-state">
            <div><ClipboardCheck size={24} /></div>
            <h3>No inspection jobs yet</h3>
            <p>Create the first job to add its property, contacts, findings, and report.</p>
            <Link className="primary-button" href="/jobs/new"><Plus size={17} /> Create first job</Link>
          </div>
        )}
      </section>
    </AppShell>
  );
}
