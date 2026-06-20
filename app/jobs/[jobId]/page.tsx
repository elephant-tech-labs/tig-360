import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  CalendarDays,
  ClipboardCheck,
  FileText,
  MapPin,
  Pencil,
  Plus,
  Users,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { getCurrentContext } from "@/lib/current-organization";

type JobPageProps = {
  params: Promise<{ jobId: string }>;
  searchParams: Promise<{ updated?: string }>;
};

export default async function JobPage({ params, searchParams }: JobPageProps) {
  const { jobId } = await params;
  const messages = await searchParams;
  const { supabase, organization, userName } = await getCurrentContext();
  const { data: job, error } = await supabase
    .from("inspection_jobs")
    .select(`
      id,
      job_number,
      status,
      report_type,
      inspection_at,
      prior_job_id,
      internal_notes,
      created_at,
      properties(street_line_1, street_line_2, city, region, postal_code, property_type),
      prior_job:inspection_jobs!prior_job_id(
        id,
        job_number,
        report_type,
        inspection_at,
        properties(street_line_1, city, region, postal_code)
      ),
      job_parties(
        id,
        role,
        is_primary,
        contacts(first_name, last_name, email, companies(name))
      ),
      findings(id),
      assets(id, kind)
    `)
    .eq("id", jobId)
    .single();

  if (error || !job) notFound();
  const property = Array.isArray(job.properties) ? job.properties[0] : job.properties;

  return (
    <AppShell organizationName={organization.name} userName={userName}>
      <div className="job-detail-header">
        <div>
          <Link className="back-link" href="/jobs"><ArrowLeft size={16} /> All jobs</Link>
          <p className="eyebrow">Inspection job / #{job.job_number}</p>
          <h1>{property?.street_line_1}</h1>
          <p><MapPin size={15} /> {property?.city}, {property?.region} {property?.postal_code}</p>
        </div>
        <div className="job-actions">
          <Link className="secondary-button" href={`/jobs/${jobId}/edit`}>
            <Pencil size={16} /> Edit job
          </Link>
          <button className="secondary-button"><FileText size={17} /> Preview report</button>
          <button className="primary-button"><Plus size={17} /> Add finding</button>
        </div>
      </div>

      {messages.updated ? (
        <div className="job-page-notice form-alert success">Job details updated.</div>
      ) : null}

      <section className="job-overview-grid">
        <div className="overview-tile">
          <ClipboardCheck size={20} />
          <span>Status</span>
          <strong>{job.status.replaceAll("_", " ")}</strong>
        </div>
        <div className="overview-tile">
          <CalendarDays size={20} />
          <span>Inspection</span>
          <strong>{job.inspection_at ? new Date(job.inspection_at).toLocaleString() : "Not scheduled"}</strong>
        </div>
        <div className="overview-tile">
          <Users size={20} />
          <span>Contacts</span>
          <strong>{job.job_parties.length}</strong>
        </div>
        <div className="overview-tile">
          <FileText size={20} />
          <span>Findings</span>
          <strong>{job.findings.length}</strong>
        </div>
      </section>

      {job.prior_job_id ? (() => {
        const prior = Array.isArray(job.prior_job) ? job.prior_job[0] : job.prior_job;
        const priorProperty = prior
          ? Array.isArray(prior.properties) ? prior.properties[0] : prior.properties
          : null;
        return prior ? (
          <section className="related-job-band">
            <div>
              <p className="eyebrow">Related prior inspection</p>
              <h2>Job #{prior.job_number}</h2>
              <span>
                {prior.report_type.replaceAll("_", " ")} ·{" "}
                {prior.inspection_at
                  ? new Date(prior.inspection_at).toLocaleDateString()
                  : "Date not scheduled"}
              </span>
              <small>
                {priorProperty?.street_line_1}, {priorProperty?.city}, {priorProperty?.region}{" "}
                {priorProperty?.postal_code}
              </small>
            </div>
            <Link className="secondary-button" href={`/jobs/${prior.id}`}>Open prior job</Link>
          </section>
        ) : null;
      })() : null}

      <section className="job-party-summary">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Contacts on report</p>
            <h2>Job parties</h2>
          </div>
          <Link className="secondary-button" href={`/jobs/${jobId}/contacts`}>
            <Users size={17} /> Manage contacts
          </Link>
        </div>

        {job.job_parties.length ? (
          <div className="job-party-summary-grid">
            {job.job_parties.map((party) => {
              const contact = Array.isArray(party.contacts) ? party.contacts[0] : party.contacts;
              const company = contact
                ? Array.isArray(contact.companies) ? contact.companies[0] : contact.companies
                : null;
              return (
                <div className="job-party-summary-item" key={party.id}>
                  <span>{party.role.replaceAll("_", " ")}</span>
                  <strong>{contact?.first_name} {contact?.last_name}</strong>
                  <small>{company?.name || contact?.email || "Contact"}</small>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="compact-empty">
            <Users size={22} />
            <div>
              <strong>No job contacts assigned</strong>
              <span>Add the ordered by, owner, report recipient, party of interest, or signer.</span>
            </div>
          </div>
        )}
      </section>
    </AppShell>
  );
}
