import Link from "next/link";
import { ArrowLeft, Check, Mail, Plus, Star, Trash2, UserPlus, Users } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { ContactFormFields } from "@/components/contact-form-fields";
import { getCurrentContext } from "@/lib/current-organization";
import { jobPartyRoleLabel, jobPartyRoles } from "@/lib/job-parties";
import {
  assignContactToJob,
  createContact,
  removeJobParty,
} from "@/app/contacts/actions";

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
  const { supabase, organization, userName } = await getCurrentContext();

  const [{ data: job, error: jobError }, { data: contacts, error: contactsError }] =
    await Promise.all([
      supabase
        .from("inspection_jobs")
        .select(`
          id,
          job_number,
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
    ]);

  if (jobError || !job) throw new Error(jobError?.message ?? "Inspection job not found");
  if (contactsError) throw new Error(contactsError.message);

  const property = Array.isArray(job.properties) ? job.properties[0] : job.properties;

  return (
    <AppShell organizationName={organization.name} userName={userName}>
      <div className="job-contacts-header">
        <div>
          <Link className="back-link" href={`/jobs/${jobId}`}>
            <ArrowLeft size={16} /> Back to job #{job.job_number}
          </Link>
          <p className="eyebrow">Job contacts</p>
          <h1>{property?.street_line_1}</h1>
          <p>Assign report, ownership, ordering, interest, and signer roles.</p>
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

          <section className="assignment-section">
            <div className="section-heading">
              <div><h2>Contacts on this job</h2><span className="section-subtitle">One person may hold several roles</span></div>
            </div>

            {job.job_parties.length ? (
              <div className="assigned-party-list">
                {job.job_parties.map((party) => {
                  const contact = Array.isArray(party.contacts) ? party.contacts[0] : party.contacts;
                  const company = contact
                    ? Array.isArray(contact.companies) ? contact.companies[0] : contact.companies
                    : null;
                  return (
                    <article className="assigned-party-row" key={party.id}>
                      <div className="contact-avatar">
                        {(contact?.first_name?.[0] ?? "") + (contact?.last_name?.[0] ?? "")}
                      </div>
                      <div className="assigned-party-person">
                        <strong>{contact?.first_name} {contact?.last_name}</strong>
                        <span>{company?.name || contact?.email || "Contact"}</span>
                      </div>
                      <div>
                        <span className="role-badge">{jobPartyRoleLabel(party.role)}</span>
                        {party.is_primary ? <span className="primary-marker"><Star size={12} /> Primary</span> : null}
                      </div>
                      <div className="assigned-party-channel">
                        <Mail size={14} /> {contact?.email || "No email"}
                      </div>
                      <form action={removeJobParty}>
                        <input name="organizationId" type="hidden" value={organization.id} />
                        <input name="jobId" type="hidden" value={jobId} />
                        <input name="partyId" type="hidden" value={party.id} />
                        <button className="icon-button small danger-button" title="Remove from job" type="submit">
                          <Trash2 size={16} />
                        </button>
                      </form>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="compact-empty">
                <Users size={22} />
                <div><strong>No contacts assigned</strong><span>Select an existing contact below or create a new one.</span></div>
              </div>
            )}
          </section>

          <section className="assignment-section">
            <div className="section-heading">
              <div><h2>Assign an existing contact</h2><span className="section-subtitle">{contacts?.length ?? 0} reusable contacts available</span></div>
            </div>

            {contacts?.length ? (
              <div className="contact-assignment-list">
                {contacts.map((contact) => {
                  const company = Array.isArray(contact.companies)
                    ? contact.companies[0]
                    : contact.companies;
                  return (
                    <form className="contact-assignment-row" action={assignContactToJob} key={contact.id}>
                      <input name="organizationId" type="hidden" value={organization.id} />
                      <input name="jobId" type="hidden" value={jobId} />
                      <input name="contactId" type="hidden" value={contact.id} />
                      <div className="contact-avatar">
                        {(contact.first_name[0] ?? "") + (contact.last_name[0] ?? "")}
                      </div>
                      <div className="contact-primary">
                        <strong>{contact.first_name} {contact.last_name}</strong>
                        <span>{contact.job_title || company?.name || contact.email || "Contact"}</span>
                      </div>
                      <select aria-label={`Role for ${contact.first_name} ${contact.last_name}`} name="role" defaultValue="report_recipient">
                        {jobPartyRoles.map((role) => (
                          <option value={role.value} key={role.value}>{role.label}</option>
                        ))}
                      </select>
                      <label className="inline-check"><input name="isPrimary" type="checkbox" /> Primary</label>
                      <label className="inline-check"><input name="receiveReport" type="checkbox" /> Send report</label>
                      <button className="secondary-button" type="submit"><Plus size={15} /> Assign</button>
                    </form>
                  );
                })}
              </div>
            ) : (
              <div className="compact-empty">
                <UserPlus size={22} />
                <div><strong>No reusable contacts yet</strong><span>Create the first contact using the panel on this page.</span></div>
              </div>
            )}
          </section>
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
              <label className="inline-check"><input name="isPrimary" type="checkbox" defaultChecked /> Primary for role</label>
              <label className="inline-check"><input name="receiveReport" type="checkbox" /> Send report by default</label>
            </div>
            <button className="primary-button form-submit" type="submit">
              <UserPlus size={16} /> Create and assign
            </button>
          </form>
        </aside>
      </div>
    </AppShell>
  );
}
