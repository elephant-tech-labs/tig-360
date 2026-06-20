import Link from "next/link";
import { ArrowLeft, ClipboardPlus } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import { getCurrentContext } from "@/lib/current-organization";
import { createInspectionJob } from "../actions";

type NewJobPageProps = {
  searchParams: Promise<{ error?: string }>;
};

export default async function NewJobPage({ searchParams }: NewJobPageProps) {
  const { organization, userName } = await getCurrentContext();
  const params = await searchParams;

  return (
    <AppShell organizationName={organization.name} userName={userName}>
      <div className="form-page">
        <Link className="back-link" href="/jobs"><ArrowLeft size={16} /> Back to jobs</Link>
        <div className="form-page-heading">
          <div className="onboarding-icon"><ClipboardPlus size={23} /></div>
          <div>
            <p className="eyebrow">New inspection</p>
            <h1>Create an inspection job</h1>
            <p>Add the property and initial scheduling details. Contacts can be assigned next.</p>
          </div>
        </div>

        {params.error ? <div className="form-alert error">{params.error}</div> : null}

        <form className="job-form" action={createInspectionJob}>
          <input name="organizationId" type="hidden" value={organization.id} />

          <fieldset>
            <legend>Property</legend>
            <div className="field-grid">
              <label className="field-span-2">
                Street address
                <input name="streetLine1" autoComplete="address-line1" required />
              </label>
              <label className="field-span-2">
                Unit or secondary address
                <input name="streetLine2" autoComplete="address-line2" />
              </label>
              <label>
                City
                <input name="city" autoComplete="address-level2" required />
              </label>
              <label>
                State
                <input name="region" autoComplete="address-level1" maxLength={2} defaultValue="WA" required />
              </label>
              <label>
                ZIP code
                <input name="postalCode" autoComplete="postal-code" required />
              </label>
              <label>
                Property type
                <select name="propertyType" defaultValue="single_family">
                  <option value="single_family">Single-family residence</option>
                  <option value="multi_family">Multi-family residence</option>
                  <option value="commercial">Commercial</option>
                  <option value="other">Other</option>
                </select>
              </label>
            </div>
          </fieldset>

          <fieldset>
            <legend>Inspection</legend>
            <div className="field-grid">
              <label>
                Report type
                <select name="reportType" defaultValue="complete">
                  <option value="complete">Complete</option>
                  <option value="limited">Limited</option>
                  <option value="supplemental">Supplemental</option>
                  <option value="reinspection">Reinspection</option>
                </select>
              </label>
              <label>
                Inspection date and time
                <input name="inspectionAt" type="datetime-local" />
              </label>
            </div>
          </fieldset>

          <div className="form-actions">
            <Link className="secondary-button" href="/jobs">Cancel</Link>
            <PendingSubmitButton
              className="primary-button"
              pendingLabel="Creating job"
            >
              Create job
            </PendingSubmitButton>
          </div>
        </form>
      </div>
    </AppShell>
  );
}
