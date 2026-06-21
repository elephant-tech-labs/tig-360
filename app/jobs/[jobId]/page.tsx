import Link from "next/link";
import { notFound } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  CalendarDays,
  Check,
  ClipboardCheck,
  FileText,
  MapPin,
  Pencil,
  Plus,
  ShieldCheck,
  Users,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { getCurrentContext } from "@/lib/current-organization";

type JobPageProps = { params: Promise<{ jobId: string }>; searchParams: Promise<{ updated?: string }> };

export default async function JobPage({ params, searchParams }: JobPageProps) {
  const { jobId } = await params;
  const messages = await searchParams;
  const { supabase, organization, userName } = await getCurrentContext();
  const { data: job, error } = await supabase.from("inspection_jobs").select(`
    id, job_number, status, report_type, inspection_at, prior_job_id, summary, escrow_number,
    internal_notes, created_at, created_by, inspected_by_id, include_inspector_signature,
    properties(street_line_1, street_line_2, city, region, postal_code, county, property_type),
    prior_job:inspection_jobs!prior_job_id(id, job_number, report_type, inspection_at, properties(street_line_1, city, region, postal_code)),
    job_parties(id, role, is_primary, contacts(first_name, last_name, email, companies(name))),
    findings(id), assets(id, kind)
  `).eq("id", jobId).single();

  if (error || !job) notFound();
  const property = Array.isArray(job.properties) ? job.properties[0] : job.properties;
  const [{ data: inspector }, { data: enteredBy }] = await Promise.all([
    job.inspected_by_id
      ? supabase
          .from("organization_memberships")
          .select(`
            user_id,
            profiles(full_name, email),
            inspector_profiles(license_number, license_expires_on, signature_path)
          `)
          .eq("organization_id", organization.id)
          .eq("user_id", job.inspected_by_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    job.created_by
      ? supabase
          .from("profiles")
          .select("full_name, email")
          .eq("id", job.created_by)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const inspectorIdentity = inspector
    ? (Array.isArray(inspector.profiles) ? inspector.profiles[0] : inspector.profiles)
    : null;
  const inspectorDetails = inspector
    ? (Array.isArray(inspector.inspector_profiles)
        ? inspector.inspector_profiles[0]
        : inspector.inspector_profiles)
    : null;
  const hasReportRecipient = job.job_parties.some(
    (party) => party.role === "report_recipient",
  );
  const readinessItems = [
    {
      label: "Property address",
      complete: Boolean(property?.street_line_1 && property.city && property.region && property.postal_code),
    },
    { label: "Inspection scheduled", complete: Boolean(job.inspection_at) },
    { label: "Inspector selected", complete: Boolean(inspector) },
    {
      label: "Inspector signature",
      complete: !job.include_inspector_signature || Boolean(inspectorDetails?.signature_path),
    },
    { label: "Report recipient", complete: hasReportRecipient },
  ];
  const readyCount = readinessItems.filter((item) => item.complete).length;

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
          <Link className="secondary-button" href={`/jobs/${jobId}/edit`}><Pencil size={16} /> Edit job</Link>
          <button className="secondary-button"><FileText size={17} /> Preview report</button>
          <button className="primary-button"><Plus size={17} /> Add finding</button>
        </div>
      </div>

      {messages.updated ? <div className="job-page-notice form-alert success">Job details updated.</div> : null}

      <section className="job-overview-grid">
        <div className="overview-tile"><ClipboardCheck size={20} /><span>Status</span><strong>{job.status.replaceAll("_", " ")}</strong></div>
        <div className="overview-tile"><CalendarDays size={20} /><span>Inspection</span><strong>{job.inspection_at ? new Date(job.inspection_at).toLocaleString() : "Not scheduled"}</strong></div>
        <div className="overview-tile"><Users size={20} /><span>Contacts</span><strong>{job.job_parties.length}</strong></div>
        <div className="overview-tile"><FileText size={20} /><span>Findings</span><strong>{job.findings.length}</strong></div>
      </section>

      <section className="job-readiness-band">
        <div>
          <p className="eyebrow">Report readiness</p>
          <h2>{readyCount} of {readinessItems.length} setup items complete</h2>
        </div>
        <div className="readiness-items">
          {readinessItems.map((item) => (
            <span className={item.complete ? "complete" : "incomplete"} key={item.label}>
              {item.complete ? <Check size={14} /> : <AlertTriangle size={14} />}
              {item.label}
            </span>
          ))}
        </div>
      </section>

      <section className="inspection-personnel-band">
        <div>
          <p className="eyebrow">Inspection personnel</p>
          <h2>Attribution and signature</h2>
        </div>
        <dl>
          <div>
            <dt>Inspected by</dt>
            <dd>{inspectorIdentity?.full_name || inspectorIdentity?.email || "Not selected"}</dd>
          </div>
          <div>
            <dt>License</dt>
            <dd>{inspectorDetails?.license_number || "Not recorded"}</dd>
          </div>
          <div>
            <dt>Signature</dt>
            <dd>
              {!job.include_inspector_signature
                ? "Excluded from final report"
                : inspectorDetails?.signature_path
                  ? "Included and available"
                  : "Included, but signature is missing"}
            </dd>
          </div>
          <div>
            <dt>Entered by</dt>
            <dd>{enteredBy?.full_name || enteredBy?.email || "Unknown team member"}</dd>
          </div>
        </dl>
        <ShieldCheck size={25} />
      </section>

      {(job.summary || job.escrow_number || property?.county) ? (
        <section className="job-report-details">
          <div><p className="eyebrow">Report details</p><h2>Property description</h2></div>
          <dl>
            {job.escrow_number ? <div><dt>Escrow number</dt><dd>{job.escrow_number}</dd></div> : null}
            {property?.county ? <div><dt>County</dt><dd>{property.county}</dd></div> : null}
            {job.summary ? <div className="description-row"><dt>General description</dt><dd>{job.summary}</dd></div> : null}
          </dl>
        </section>
      ) : null}

      {job.prior_job_id ? (() => {
        const prior = Array.isArray(job.prior_job) ? job.prior_job[0] : job.prior_job;
        const priorProperty = prior ? (Array.isArray(prior.properties) ? prior.properties[0] : prior.properties) : null;
        return prior ? (
          <section className="related-job-band">
            <div>
              <p className="eyebrow">Related prior inspection</p><h2>Job #{prior.job_number}</h2>
              <span>{prior.report_type.replaceAll("_", " ")} · {prior.inspection_at ? new Date(prior.inspection_at).toLocaleDateString() : "Date not scheduled"}</span>
              <small>{priorProperty?.street_line_1}, {priorProperty?.city}, {priorProperty?.region} {priorProperty?.postal_code}</small>
            </div>
            <Link className="secondary-button" href={`/jobs/${prior.id}`}>Open prior job</Link>
          </section>
        ) : null;
      })() : null}

      <section className="job-party-summary">
        <div className="section-heading"><div><p className="eyebrow">Contacts on report</p><h2>Job parties</h2></div><Link className="secondary-button" href={`/jobs/${jobId}/contacts`}><Users size={17} /> Manage contacts</Link></div>
        {job.job_parties.length ? (
          <div className="job-party-summary-grid">
            {job.job_parties.map((party) => {
              const contact = Array.isArray(party.contacts) ? party.contacts[0] : party.contacts;
              const company = contact ? (Array.isArray(contact.companies) ? contact.companies[0] : contact.companies) : null;
              return <div className="job-party-summary-item" key={party.id}><span>{party.role.replaceAll("_", " ")}</span><strong>{contact?.first_name} {contact?.last_name}</strong><small>{company?.name || contact?.email || "Contact"}</small></div>;
            })}
          </div>
        ) : <div className="compact-empty"><Users size={22} /><div><strong>No job contacts assigned</strong><span>Add the ordered by, owner, report recipient, party of interest, or signer.</span></div></div>}
      </section>
    </AppShell>
  );
}
