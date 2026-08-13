import Link from "next/link";
import { notFound } from "next/navigation";
import {
  AlertTriangle,
  CalendarDays,
  Check,
  ClipboardCheck,
  FilePenLine,
  ShieldCheck,
  Users,
  Tags,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { getCurrentContext } from "@/lib/current-organization";
import { JobAuthoringNav } from "@/components/job-authoring-nav";
import { JobWorkspaceHeader } from "@/components/job-workspace-header";
import { getJobWorkflowStates } from "@/lib/job-workflow";
import { getCaliforniaWdoReadinessForJob } from "@/lib/wdo/california/readiness";

type JobPageProps = { params: Promise<{ jobId: string }>; searchParams: Promise<{ updated?: string }> };

export default async function JobPage({ params, searchParams }: JobPageProps) {
  const { jobId } = await params;
  const messages = await searchParams;
  const { supabase, organization, userName, membership } = await getCurrentContext();
  const { data: job, error } = await supabase.from("inspection_jobs").select(`
    id, job_number, status, report_type, inspection_at, prior_job_id, summary, escrow_number,
    inspection_tag_posted, other_tags_posted, garage_description,
    internal_notes, created_at, created_by, inspected_by_id, include_inspector_signature,
    wdo_filing_requirement, wdo_exclusion_reason, wdo_exclusion_notes,
    properties(building_number, street_name, unit_or_suite, street_line_1, street_line_2, city, region, postal_code, county, property_type),
    prior_job:inspection_jobs!prior_job_id(id, job_number, report_type, inspection_at, properties(street_line_1, city, region, postal_code)),
    job_parties(id, role, is_primary, receive_report_by_default, contacts(id, first_name, last_name, email, companies(name))),
    findings(id, archived_at), assets(id, kind)
  `).eq("id", jobId).single();

  if (error || !job) notFound();
  const property = Array.isArray(job.properties) ? job.properties[0] : job.properties;
  const [{ data: inspector }, { data: enteredBy }, { data: reportProfile }] = await Promise.all([
    job.inspected_by_id
      ? supabase
          .from("inspectors")
          .select("id, full_name, email, license_number, license_expires_on, signature_path")
          .eq("organization_id", organization.id)
          .eq("id", job.inspected_by_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    job.created_by
      ? supabase
          .from("profiles")
          .select("full_name, email")
          .eq("id", job.created_by)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from("organization_report_profiles")
      .select("legal_name, registration_number")
      .eq("organization_id", organization.id)
      .maybeSingle(),
  ]);
  const workflowStates = await getJobWorkflowStates(supabase, organization.id, jobId);
  const requiresPriorJob = job.report_type === "supplemental" || job.report_type === "reinspection";
  const wdoReadiness = getCaliforniaWdoReadinessForJob({
    jobId,
    filingRequirement: job.wdo_filing_requirement,
    reportType: job.report_type,
    inspectionDate: job.inspection_at,
    companyName: reportProfile?.legal_name ?? null,
    registrationNumber: reportProfile?.registration_number ?? null,
    inspectorId: job.inspected_by_id,
    inspectorName: inspector?.full_name ?? inspector?.email ?? null,
    inspectorLicenseNumber: inspector?.license_number ?? null,
    address: {
      buildingNumber: property?.building_number ?? null,
      streetName: property?.street_name ?? null,
      unitOrSuite: property?.unit_or_suite ?? null,
      streetLine1: property?.street_line_1 ?? null,
      streetLine2: property?.street_line_2 ?? null,
      city: property?.city ?? null,
      region: property?.region ?? null,
      zipCode: property?.postal_code ?? null,
    },
  });
  const readinessItems = [
    {
      label: "Property address",
      complete: Boolean(property?.street_line_1 && property.city && property.region && property.postal_code),
    },
    { label: "Inspection scheduled", complete: Boolean(job.inspection_at) },
    { label: "Report type selected", complete: Boolean(job.report_type) },
    { label: "Inspector selected", complete: Boolean(inspector) },
    {
      label: "Inspector signature",
      complete: !job.include_inspector_signature || Boolean(inspector?.signature_path),
    },
    ...(requiresPriorJob
      ? [{ label: "Prior inspection linked", complete: Boolean(job.prior_job_id) }]
      : []),
    { label: wdoReadiness.required ? "WDO filing ready" : "WDO filing excluded", complete: wdoReadiness.ready },
  ];
  const readyCount = readinessItems.filter((item) => item.complete).length;
  const uniqueContacts = new Set(job.job_parties.flatMap((party) => {
    const contact = Array.isArray(party.contacts) ? party.contacts[0] : party.contacts;
    return contact?.id ? [contact.id] : [];
  })).size;
  const groupedParties = Array.from(job.job_parties.reduce((groups, party) => {
    const contact = Array.isArray(party.contacts) ? party.contacts[0] : party.contacts;
    if (!contact) return groups;
    const company = Array.isArray(contact.companies) ? contact.companies[0] : contact.companies;
    const existing = groups.get(contact.id);
    if (existing) {
      existing.roles.push(party.role);
      existing.defaultRecipient ||= party.receive_report_by_default;
    } else {
      groups.set(contact.id, {
        id: contact.id,
        name: `${contact.first_name} ${contact.last_name}`.trim(),
        detail: company?.name || contact.email || "Contact",
        roles: [party.role],
        defaultRecipient: party.receive_report_by_default,
      });
    }
    return groups;
  }, new Map<string, { id: string; name: string; detail: string; roles: string[]; defaultRecipient: boolean }>()).values());

  return (
    <AppShell organizationName={organization.name} userName={userName} membershipRole={membership.role}>
      <JobWorkspaceHeader
        jobId={jobId}
        jobNumber={job.job_number}
        address={property?.street_line_1 ?? ""}
        actions={<Link className="secondary-button" href={`/jobs/${jobId}/proposal`}><FilePenLine size={16} /> Proposal</Link>}
        locality={[
          property?.city,
          [property?.region, property?.postal_code].filter(Boolean).join(" "),
        ].filter(Boolean).join(", ")}
        reportType={job.report_type}
        showEdit
      />

      <JobAuthoringNav jobId={jobId} current="setup" states={workflowStates} />
      {messages.updated ? <div className="job-page-notice form-alert success">Job details updated.</div> : null}

      <section className="job-overview-grid">
        <div className="overview-tile"><ClipboardCheck size={20} /><span>Status</span><strong>{job.status.replaceAll("_", " ")}</strong></div>
        <div className="overview-tile"><Tags size={20} /><span>Report type</span><strong>{job.report_type.replaceAll("_", " ")}</strong></div>
        <div className="overview-tile"><CalendarDays size={20} /><span>Inspection</span><strong>{job.inspection_at ? new Date(job.inspection_at).toLocaleString() : "Not scheduled"}</strong></div>
        <div className="overview-tile"><Users size={20} /><span>Contacts</span><strong>{uniqueContacts} {uniqueContacts === 1 ? "person" : "people"} · {job.job_parties.length} {job.job_parties.length === 1 ? "role" : "roles"}</strong></div>
      </section>

      {wdoReadiness.required && !wdoReadiness.ready ? (
        <section className="job-readiness-band">
          <div><p className="eyebrow">California compliance</p><h2>WDO source data needs attention</h2></div>
          <div className="readiness-items">
            {wdoReadiness.issues.map((issue) => (
              <Link className="incomplete" href={issue.href ?? `/jobs/${jobId}/edit#wdo-filing`} key={`${issue.field}:${issue.code}`}>
                <AlertTriangle size={14} /> {issue.message}
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <section className="job-readiness-band">
        <div>
          <p className="eyebrow">Job setup</p>
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
            <dd>{inspector?.full_name || inspector?.email || "Not selected"}</dd>
          </div>
          <div>
            <dt>License</dt>
            <dd>{inspector?.license_number || "Not recorded"}</dd>
          </div>
          <div>
            <dt>Signature</dt>
            <dd>
              {!job.include_inspector_signature
                ? "Excluded from final report"
                : inspector?.signature_path
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

      {(job.summary || job.escrow_number || property?.county || job.inspection_tag_posted || job.other_tags_posted || job.garage_description) ? (
        <section className="job-report-details">
          <div><p className="eyebrow">Report details</p><h2>Property description</h2></div>
          <dl>
            {job.escrow_number ? <div><dt>Escrow number</dt><dd>{job.escrow_number}</dd></div> : null}
            {property?.county ? <div><dt>County</dt><dd>{property.county}</dd></div> : null}
            {job.inspection_tag_posted ? <div><dt>Inspection tag posted</dt><dd>{job.inspection_tag_posted}</dd></div> : null}
            {job.other_tags_posted ? <div><dt>Other tags posted</dt><dd>{job.other_tags_posted}</dd></div> : null}
            {job.garage_description ? <div><dt>Garage</dt><dd>{job.garage_description}</dd></div> : null}
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
        <div className="section-heading"><div><p className="eyebrow">Job relationships</p><h2>Contacts and roles</h2></div><Link className="secondary-button" href={`/jobs/${jobId}/contacts`}><Users size={17} /> Manage contacts</Link></div>
        {groupedParties.length ? (
          <div className="job-party-summary-grid">
            {groupedParties.map((party) => <div className="job-party-summary-item" key={party.id}>
              <strong>{party.name}</strong>
              <small>{party.detail}</small>
              <div className="job-party-role-list">{party.roles.map((role) => <span key={role}>{role.replaceAll("_", " ")}</span>)}</div>
              {party.defaultRecipient ? <em>Preselected in Send Center</em> : null}
            </div>)}
          </div>
        ) : <div className="compact-empty"><Users size={22} /><div><strong>No job contacts assigned</strong><span>Add the ordered by, owner, report recipient, party of interest, or signer.</span></div></div>}
      </section>
    </AppShell>
  );
}
