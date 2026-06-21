import Image from "next/image";
import { Check, ShieldCheck, Upload } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import { getCurrentContext } from "@/lib/current-organization";
import { removeInspectorSignature, saveInspectorProfile } from "./actions";

type InspectorsPageProps = {
  searchParams: Promise<{ saved?: string; error?: string }>;
};

export default async function InspectorsPage({ searchParams }: InspectorsPageProps) {
  const messages = await searchParams;
  const { supabase, organization, userName, membership } = await getCurrentContext();
  const { data: members, error } = await supabase
    .from("organization_memberships")
    .select(`
      user_id,
      role,
      status,
      profiles(full_name, email, phone),
      inspector_profiles(
        license_number,
        license_expires_on,
        signature_path,
        signature_filename,
        is_active
      )
    `)
    .eq("organization_id", organization.id)
    .eq("status", "active")
    .order("created_at");

  if (error) throw new Error(error.message);
  const canManage = membership.role === "administrator" || membership.role === "manager";
  const signatureUrls = new Map<string, string>();

  for (const member of members ?? []) {
    const inspector = Array.isArray(member.inspector_profiles)
      ? member.inspector_profiles[0]
      : member.inspector_profiles;
    if (!inspector?.signature_path) continue;
    const { data } = await supabase.storage
      .from("inspector-signatures")
      .createSignedUrl(inspector.signature_path, 60 * 10);
    if (data?.signedUrl) signatureUrls.set(member.user_id, data.signedUrl);
  }

  return (
    <AppShell organizationName={organization.name} userName={userName} active="team">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Organization team</p>
          <h1>Inspector profiles</h1>
          <p>Manage report credentials and reusable signatures for active team members.</p>
        </div>
      </div>

      <div className="team-page">
        {messages.saved ? <div className="form-alert success"><Check size={17} /> {messages.saved}</div> : null}
        {messages.error ? <div className="form-alert error">{messages.error}</div> : null}

        <div className="inspector-profile-list">
          {(members ?? []).map((member) => {
            const profile = Array.isArray(member.profiles) ? member.profiles[0] : member.profiles;
            const inspector = Array.isArray(member.inspector_profiles)
              ? member.inspector_profiles[0]
              : member.inspector_profiles;
            const signatureUrl = signatureUrls.get(member.user_id);
            return (
              <article className="inspector-profile-row" key={member.user_id}>
                <div className="inspector-identity">
                  <div className="onboarding-icon"><ShieldCheck size={21} /></div>
                  <div>
                    <strong>{profile?.full_name || profile?.email || "Team member"}</strong>
                    <span>{profile?.email || "No email"} · {member.role.replaceAll("_", " ")}</span>
                  </div>
                </div>

                <form className="inspector-profile-form" action={saveInspectorProfile}>
                  <input name="organizationId" type="hidden" value={organization.id} />
                  <input name="userId" type="hidden" value={member.user_id} />
                  <label>
                    License number
                    <input name="licenseNumber" defaultValue={inspector?.license_number ?? ""} disabled={!canManage} />
                  </label>
                  <label>
                    License expiration
                    <input name="licenseExpiresOn" type="date" defaultValue={inspector?.license_expires_on ?? ""} disabled={!canManage} />
                  </label>
                  <label className="signature-upload">
                    Signature image
                    <input name="signature" type="file" accept="image/png,image/jpeg,image/webp" disabled={!canManage} />
                  </label>
                  <label className="inline-check">
                    <input name="isActive" type="checkbox" defaultChecked={inspector?.is_active ?? true} disabled={!canManage} />
                    Available for inspections
                  </label>
                  {canManage ? (
                    <PendingSubmitButton className="primary-button" pendingLabel="Saving inspector">
                      <Upload size={16} /> Save profile
                    </PendingSubmitButton>
                  ) : null}
                </form>

                <div className="signature-preview">
                  {signatureUrl ? (
                    <>
                      <Image src={signatureUrl} alt={`Signature for ${profile?.full_name || "inspector"}`} width={220} height={90} unoptimized />
                      <span>{inspector?.signature_filename}</span>
                      {canManage ? (
                        <form action={removeInspectorSignature}>
                          <input name="organizationId" type="hidden" value={organization.id} />
                          <input name="userId" type="hidden" value={member.user_id} />
                          <button className="danger-text-button" type="submit">Remove signature</button>
                        </form>
                      ) : null}
                    </>
                  ) : (
                    <div className="signature-empty">No signature stored</div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </AppShell>
  );
}
