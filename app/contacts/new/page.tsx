import Link from "next/link";
import { ArrowLeft, UserPlus } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { ContactFormFields } from "@/components/contact-form-fields";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import { getCurrentContext } from "@/lib/current-organization";
import { createContact } from "../actions";

type NewContactPageProps = {
  searchParams: Promise<{ error?: string }>;
};

export default async function NewContactPage({ searchParams }: NewContactPageProps) {
  const { organization, userName } = await getCurrentContext();
  const { error } = await searchParams;

  return (
    <AppShell organizationName={organization.name} userName={userName} active="contacts">
      <div className="form-page">
        <Link className="back-link" href="/contacts"><ArrowLeft size={16} /> Back to contacts</Link>
        <div className="form-page-heading">
          <div className="onboarding-icon"><UserPlus size={23} /></div>
          <div>
            <p className="eyebrow">CRM directory</p>
            <h1>Create a reusable contact</h1>
            <p>This person can be assigned to several jobs and several roles.</p>
          </div>
        </div>

        {error ? <div className="form-alert error">{error}</div> : null}

        <form className="job-form" action={createContact}>
          <input name="organizationId" type="hidden" value={organization.id} />
          <input name="returnTo" type="hidden" value="/contacts" />
          <ContactFormFields />
          <div className="form-actions">
            <Link className="secondary-button" href="/contacts">Cancel</Link>
            <PendingSubmitButton
              className="primary-button"
              pendingLabel="Creating contact"
            >
              Create contact
            </PendingSubmitButton>
          </div>
        </form>
      </div>
    </AppShell>
  );
}
