import Image from "next/image";
import { redirect } from "next/navigation";
import { Building2, Check, MapPinned, Plus, Upload } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { ManagementNav } from "@/components/management-nav";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import { canAccessManagement } from "@/lib/access";
import { getCurrentContext } from "@/lib/current-organization";
import { removeCompanyLogo, saveCompanyProfile, saveWdoBranch } from "@/app/management/actions";

type ManagementPageProps = {
  searchParams: Promise<{ saved?: string; error?: string }>;
};

export default async function ManagementPage({ searchParams }: ManagementPageProps) {
  const messages = await searchParams;
  const { supabase, organization, userName, membership } = await getCurrentContext();
  if (!canAccessManagement(membership.role)) redirect("/jobs");
  const { data: profile, error } = await supabase
    .from("organization_report_profiles")
    .select("*")
    .eq("organization_id", organization.id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const { data: wdoBranches, error: branchError } = await supabase
    .from("wdo_branches")
    .select("id, name, registration_number, is_active")
    .eq("organization_id", organization.id)
    .order("name");
  if (branchError) throw new Error(branchError.message);

  const canManage = membership.role === "administrator" || membership.role === "manager";
  let logoUrl: string | null = null;
  if (profile?.logo_path) {
    const { data } = await supabase.storage
      .from("organization-branding")
      .createSignedUrl(profile.logo_path, 60 * 15);
    logoUrl = data?.signedUrl ?? null;
  }

  return (
    <AppShell organizationName={organization.name} userName={userName} membershipRole={membership.role} active="management">
      <div className="page-heading">
        <div><p className="eyebrow">Organization management</p><h1>Company and report settings</h1><p>Manage the legal identity, report content, inspectors, and access used across every inspection.</p></div>
      </div>
      <ManagementNav current="company" />
      <div className="management-page">
        {messages.saved ? <div className="form-alert success"><Check size={17} /> {messages.saved}</div> : null}
        {messages.error ? <div className="form-alert error">{messages.error}</div> : null}
        <section className="management-panel company-profile-panel">
          <div className="management-panel-intro">
            <div className="onboarding-icon"><Building2 size={23} /></div>
            <div><p className="eyebrow">Report identity</p><h2>Company profile</h2><p>This information appears on the formal WDO summary page and future company documents.</p></div>
          </div>
          <form className="company-profile-form" action={saveCompanyProfile}>
            <input name="organizationId" type="hidden" value={organization.id} />
            <fieldset>
              <legend>Company identity</legend>
              <div className="field-grid">
                <label className="field-span-2">Legal company name<input name="legalName" defaultValue={profile?.legal_name ?? organization.name} disabled={!canManage} required /></label>
                <label>SPCB Principal Registration (PR)<input name="registrationNumber" defaultValue={profile?.registration_number ?? ""} disabled={!canManage} placeholder="PR8662" /></label>
                <label>Operator license<input name="operatorLicense" defaultValue={profile?.operator_license ?? ""} disabled={!canManage} /></label>
                <label>Contractor license<input name="contractorLicense" defaultValue={profile?.contractor_license ?? ""} disabled={!canManage} /></label>
                <label>Regulatory contact<input name="regulatoryContact" defaultValue={profile?.regulatory_contact ?? ""} disabled={!canManage} placeholder="Branch, board, or license details" /></label>
              </div>
            </fieldset>
            <fieldset>
              <legend>Contact and address</legend>
              <div className="field-grid">
                <label className="field-span-2">Street address<input name="streetLine1" defaultValue={profile?.street_line_1 ?? ""} disabled={!canManage} /></label>
                <label className="field-span-2">Suite or secondary address<input name="streetLine2" defaultValue={profile?.street_line_2 ?? ""} disabled={!canManage} /></label>
                <label>City<input name="city" defaultValue={profile?.city ?? ""} disabled={!canManage} /></label>
                <label>State<input name="region" defaultValue={profile?.region ?? "CA"} maxLength={2} disabled={!canManage} /></label>
                <label>ZIP code<input name="postalCode" defaultValue={profile?.postal_code ?? ""} disabled={!canManage} /></label>
                <label>Phone<input name="phone" defaultValue={profile?.phone ?? ""} disabled={!canManage} /></label>
                <label>Email<input name="email" type="email" defaultValue={profile?.email ?? ""} disabled={!canManage} /></label>
                <label>Website<input name="website" defaultValue={profile?.website ?? ""} disabled={!canManage} /></label>
              </div>
            </fieldset>
            <fieldset>
              <legend>Company logo</legend>
              <div className="company-logo-control">
                {logoUrl ? <Image src={logoUrl} alt={`${profile?.legal_name ?? organization.name} logo`} width={240} height={120} unoptimized /> : <div className="company-logo-empty">No logo uploaded</div>}
                {canManage ? (
                  <label>
                    Replace logo
                    <input name="logo" type="file" accept="image/png,image/jpeg,image/webp" />
                    <small>Use the white-background PNG for report headers and formal pages.</small>
                  </label>
                ) : null}
              </div>
            </fieldset>
            {canManage ? <PendingSubmitButton className="primary-button" pendingLabel="Saving company profile"><Upload size={16} /> Save company profile</PendingSubmitButton> : null}
          </form>
          {canManage && profile?.logo_path ? <form action={removeCompanyLogo}><input name="organizationId" type="hidden" value={organization.id} /><button className="danger-text-button" type="submit">Remove company logo</button></form> : null}
        </section>
        <section className="management-panel wdo-branch-management">
          <div className="management-panel-intro">
            <div className="onboarding-icon"><MapPinned size={23} /></div>
            <div><p className="eyebrow">WDO regulatory offices</p><h2>Branch registrations</h2><p>Principal-office exports use the PR above. Branch records are retained for assignment and validation, but branch TXT generation remains blocked until the external BR layout is verified.</p></div>
          </div>
          <div className="wdo-branch-list">
            {(wdoBranches ?? []).map((branch) => (
              <form action={saveWdoBranch} className="wdo-branch-form" key={branch.id}>
                <input name="organizationId" type="hidden" value={organization.id} />
                <input name="branchId" type="hidden" value={branch.id} />
                <label>Branch name<input name="branchName" defaultValue={branch.name} required /></label>
                <label>Branch Registration (BR)<input name="branchRegistrationNumber" defaultValue={branch.registration_number ?? ""} placeholder="BR number" /></label>
                <label className="inline-check"><input name="isActive" type="checkbox" defaultChecked={branch.is_active} /> Active</label>
                <PendingSubmitButton className="secondary-button" pendingLabel="Saving branch">Save branch</PendingSubmitButton>
              </form>
            ))}
            <form action={saveWdoBranch} className="wdo-branch-form new">
              <input name="organizationId" type="hidden" value={organization.id} />
              <label>Branch name<input name="branchName" required placeholder="Branch name" /></label>
              <label>Branch Registration (BR)<input name="branchRegistrationNumber" placeholder="BR number" /></label>
              <label className="inline-check"><input name="isActive" type="checkbox" defaultChecked /> Active</label>
              <PendingSubmitButton className="primary-button" pendingLabel="Adding branch"><Plus size={15} /> Add branch</PendingSubmitButton>
            </form>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
