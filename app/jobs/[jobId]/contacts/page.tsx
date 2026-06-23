import Link from "next/link";
import { redirect } from "next/navigation";
import { Check, UserPlus, Users } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { ContactFormFields } from "@/components/contact-form-fields";
import { JobAuthoringNav } from "@/components/job-authoring-nav";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import { JobWorkspaceHeader } from "@/components/job-workspace-header";
import {
  JobContactManager,
  type AssignedParty,
  type ContactOption,
} from "@/components/job-contact-manager";
import { canAccessContacts } from "@/lib/access";
import { getCurrentContext } from "@/lib/current-organization";
import { getJobWorkflowStates } from "@/lib/job-workflow";
import { jobPartyRoles } from "@/lib/job-parties";
import { createContact } from "@/app/contacts/actions";

type JobContactsPageProps = {
  params: Promise<{ jobId: string }>;
  searchParams: Promise<{ error?: string; saved?: string; removed?: string }>;
};

export default async function JobContactsPage({
  params,
  searchParams,
}: JobContactsPageProps) {
  const { jobId } = await params;
  const messages = await searchParams;
  const { supabase, organization, userName, membership } = await getCurrentContext();
  if (!canAccessContacts(membership.role)) redirect(`/jobs/${jobId}`);

  const [{ data: job, error: jobError }, { data: contacts, error: contactsError }, workflowStates] =
    await Promise.all([
      supabase
        .from("inspection_jobs")
        .select(`
          id,
          job_number,
          report_type,
          properties(street_line_1, city, region, postal_code),
          job_parties(
            id,
            role,
            is_primary,
            receive_report_by_default,
            contacts(
              id,
              first_name,
              last_name,
              email,
              mobile_phone,
              companies(name)
            )
          )
        `)
        .eq("id", jobId)
        .single(),
      supabase
        .from("contacts")
        .select("id, first_name, last_name, email, mobile_phone, job_title, companies(name)")
        .eq("organization_id", organization.id)
        .order("last_name")
        .order("first_name"),
      getJobWorkflowStates(supabase, organization.id, jobId),
    ]);

  if (jobError || !job) throw new Error(jobError?.message ?? "Inspection job not found");
  if (contactsError) throw new Error(contactsError.message);

  const property = Array.isArray(job.properties) ? job.properties[0] : job.properties;
  const contactOptions: ContactOption[] = (contacts ?? []).map((contact) => {
    const company = Array.isArray(contact.companies)
      ? contact.companies[0]
      : contact.companies;
    return {
      id: contact.id,
      firstName: contact.first_name,
      lastName: contact.last_name,
      email: contact.email,
      mobilePhone: contact.mobile_phone,
      jobTitle: contact.job_title,
      companyName: company?.name ?? null,
    };
  });
  const assignedParties: AssignedParty[] = job.job_parties.flatMap((party) => {
    const contact = Array.isArray(party.contacts) ? party.contacts[0] : party.contacts;
    if (!contact) return [];
    const company = Array.isArray(contact.companies)
      ? contact.companies[0]
      : contact.companies;
    return [{
      id: party.id,
      role: party.role,
      isPrimary: party.is_primary,
      receiveReport: party.receive_report_by_default,
      contact: {
        id: contact.id,
        firstName: contact.first_name,
        lastName: contact.last_name,
        email: contact.email,
        mobilePhone: contact.mobile_phone,
        jobTitle: null,
        companyName: company?.name ?? null,
      },
    }];
  });
  const locality = [
    property?.city,
    [property?.region, property?.postal_code].filter(Boolean).join(" "),
  ].filter(Boolean).join(", ");

  return (
    <AppShell organizationName={organization.name} userName={userName} membershipRole={membership.role}>
      <JobWorkspaceHeader
        address={property?.street_line_1 ?? ""}
        jobId={jobId}
        jobNumber={job.job_number}
        locality={locality}
        reportType={job.report_type}
      />
      <JobAuthoringNav jobId={jobId} current="setup" states={workflowStates} />

      <div className="job-contacts-header">
        <div>
          <p className="eyebrow">Job setup</p>
          <h1>Contacts and roles</h1>
          <p>One person can hold several roles. Sending choices remain editable in Send Center.</p>
        </div>
        <Link className="secondary-button" href="/contacts">
          <Users size={17} /> Contact directory
        </Link>
      </div>

      <div className="job-contacts-layout">
        <div className="job-contacts-main">
          {messages.error ? <div className="form-alert error">{messages.error}</div> : null}
          {messages.saved ? <div className="form-alert success"><Check size={17} /> Contact assignment saved.</div> : null}
          {messages.removed ? <div className="form-alert success"><Check size={17} /> Contact removed from this job.</div> : null}

          <JobContactManager
            organizationId={organization.id}
            jobId={jobId}
            initialParties={assignedParties}
            contacts={contactOptions}
          />
        </div>

        <aside className="quick-contact-panel">
          <div className="section-heading compact">
            <div><h2>Create and assign</h2><span className="section-subtitle">Adds this person to the directory too</span></div>
          </div>
          <form className="quick-contact-form" action={createContact}>
            <input name="organizationId" type="hidden" value={organization.id} />
            <input name="jobId" type="hidden" value={jobId} />
            <input name="returnTo" type="hidden" value={`/jobs/${jobId}/contacts`} />
            <ContactFormFields compact />
            <label>
              Job role
              <select name="role" defaultValue="report_recipient">
                {jobPartyRoles.map((role) => (
                  <option value={role.value} key={role.value}>{role.label}</option>
                ))}
              </select>
            </label>
            <div className="quick-contact-options">
              <label className="inline-check" title="Use this person as the main contact when several people share this role."><input name="isPrimary" type="checkbox" defaultChecked /> Primary for this role</label>
              <label className="inline-check" title="Preselect this person when Send Center opens. This does not send the report now."><input name="receiveReport" type="checkbox" /> Preselect in Send Center</label>
            </div>
            <PendingSubmitButton
              className="primary-button form-submit"
              pendingLabel="Creating and assigning"
            >
              <UserPlus size={16} /> Create and assign
            </PendingSubmitButton>
          </form>
        </aside>
      </div>
    </AppShell>
  );
}
