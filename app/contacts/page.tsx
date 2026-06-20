import Link from "next/link";
import { Building2, Mail, Phone, Plus, Search, UserRound } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { getCurrentContext } from "@/lib/current-organization";

type ContactsPageProps = {
  searchParams: Promise<{ q?: string }>;
};

export default async function ContactsPage({ searchParams }: ContactsPageProps) {
  const { supabase, organization, userName } = await getCurrentContext();
  const { q = "" } = await searchParams;
  let query = supabase
    .from("contacts")
    .select(`
      id,
      first_name,
      last_name,
      email,
      mobile_phone,
      job_title,
      created_at,
      companies(name),
      job_parties(id)
    `)
    .eq("organization_id", organization.id)
    .order("last_name")
    .order("first_name");

  if (q.trim()) {
    const term = q.trim().replaceAll(",", " ");
    query = query.or(
      `first_name.ilike.%${term}%,last_name.ilike.%${term}%,email.ilike.%${term}%`,
    );
  }

  const { data: contacts, error } = await query;
  if (error) throw new Error(error.message);

  return (
    <AppShell organizationName={organization.name} userName={userName} active="contacts">
      <div className="page-heading">
        <div>
          <p className="eyebrow">CRM directory</p>
          <h1>Contacts</h1>
          <p>Reusable people for reports, deliveries, contracts, and signatures.</p>
        </div>
        <Link className="primary-button" href="/contacts/new"><Plus size={17} /> New contact</Link>
      </div>

      <section className="directory-panel">
        <form className="directory-search" action="/contacts">
          <Search size={17} />
          <input name="q" defaultValue={q} placeholder="Search name or email" />
          <button className="secondary-button" type="submit">Search</button>
        </form>

        {contacts?.length ? (
          <div className="contact-directory">
            {contacts.map((contact) => {
              const company = Array.isArray(contact.companies)
                ? contact.companies[0]
                : contact.companies;
              const initials = `${contact.first_name[0] ?? ""}${contact.last_name[0] ?? ""}`.toUpperCase();
              return (
                <article className="contact-directory-row" key={contact.id}>
                  <div className="contact-avatar">{initials || "C"}</div>
                  <div className="contact-primary">
                    <strong>{contact.first_name} {contact.last_name}</strong>
                    <span>{contact.job_title || "Contact"}{company?.name ? ` at ${company.name}` : ""}</span>
                  </div>
                  <div className="contact-channel">
                    <Mail size={15} />
                    <span>{contact.email || "No email"}</span>
                  </div>
                  <div className="contact-channel">
                    <Phone size={15} />
                    <span>{contact.mobile_phone || "No mobile"}</span>
                  </div>
                  <div className="contact-usage">
                    <Building2 size={15} />
                    <span>{contact.job_parties.length} job role{contact.job_parties.length === 1 ? "" : "s"}</span>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="empty-state">
            <div><UserRound size={24} /></div>
            <h3>{q ? "No contacts match this search" : "No contacts yet"}</h3>
            <p>Create people once, then assign them to any inspection job and role.</p>
            <Link className="primary-button" href="/contacts/new"><Plus size={17} /> Create contact</Link>
          </div>
        )}
      </section>
    </AppShell>
  );
}
