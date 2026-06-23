import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Pencil } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { ContactFormFields } from "@/components/contact-form-fields";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import { canAccessContacts } from "@/lib/access";
import { getCurrentContext } from "@/lib/current-organization";
import { updateContact } from "../../actions";

type EditContactPageProps = {
  params: Promise<{ contactId: string }>;
  searchParams: Promise<{ error?: string }>;
};

export default async function EditContactPage({
  params,
  searchParams,
}: EditContactPageProps) {
  const { contactId } = await params;
  const { error: message } = await searchParams;
  const { supabase, organization, userName, membership } = await getCurrentContext();
  if (!canAccessContacts(membership.role)) redirect("/jobs");
  const { data: contact, error } = await supabase
    .from("contacts")
    .select(`
      id, first_name, last_name, email, secondary_email, mobile_phone, home_phone,
      job_title, category, street_line_1, street_line_2, city, region, postal_code,
      county, notes, companies(name)
    `)
    .eq("id", contactId)
    .eq("organization_id", organization.id)
    .single();

  if (error || !contact) notFound();
  const company = Array.isArray(contact.companies)
    ? contact.companies[0]
    : contact.companies;

  return (
    <AppShell organizationName={organization.name} userName={userName} membershipRole={membership.role} active="contacts">
      <div className="form-page">
        <Link className="back-link" href="/contacts">
          <ArrowLeft size={16} /> Back to contacts
        </Link>
        <div className="form-page-heading">
          <div className="onboarding-icon"><Pencil size={22} /></div>
          <div>
            <p className="eyebrow">CRM directory</p>
            <h1>Edit contact</h1>
            <p>Update reusable contact and address information.</p>
          </div>
        </div>
        {message ? <div className="form-alert error">{message}</div> : null}
        <form className="job-form" action={updateContact}>
          <input name="organizationId" type="hidden" value={organization.id} />
          <input name="contactId" type="hidden" value={contact.id} />
          <ContactFormFields initialValues={{
            firstName: contact.first_name,
            lastName: contact.last_name,
            email: contact.email ?? "",
            secondaryEmail: contact.secondary_email ?? "",
            mobilePhone: contact.mobile_phone ?? "",
            homePhone: contact.home_phone ?? "",
            companyName: company?.name ?? "",
            jobTitle: contact.job_title ?? "",
            category: contact.category,
            streetLine1: contact.street_line_1 ?? "",
            streetLine2: contact.street_line_2 ?? "",
            city: contact.city ?? "",
            region: contact.region ?? "CA",
            postalCode: contact.postal_code ?? "",
            county: contact.county ?? "",
            notes: contact.notes ?? "",
          }} />
          <div className="form-actions">
            <Link className="secondary-button" href="/contacts">Cancel</Link>
            <PendingSubmitButton className="primary-button" pendingLabel="Saving contact">
              Save contact
            </PendingSubmitButton>
          </div>
        </form>
      </div>
    </AppShell>
  );
}
