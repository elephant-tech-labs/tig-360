import { redirect } from "next/navigation";
import { Building2, Check } from "lucide-react";
import { createOrganization } from "./actions";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { signOut } from "@/app/auth/actions";
import { PendingSubmitButton } from "@/components/pending-submit-button";

type OnboardingPageProps = {
  searchParams: Promise<{ error?: string }>;
};

export default async function OnboardingPage({ searchParams }: OnboardingPageProps) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: membership } = await supabase
    .from("organization_memberships")
    .select("organization_id")
    .eq("status", "active")
    .limit(1)
    .maybeSingle();

  if (membership) redirect("/jobs");

  // An invited user who has verified their email should finish activation,
  // not accidentally create a separate organization.
  const { data: invitations } = await supabase.rpc("get_current_invitation");
  const pendingInvitation = invitations?.some(
    (invitation: { invitation_status: string; expires_at: string }) =>
      invitation.invitation_status === "pending" &&
      Date.parse(invitation.expires_at) > Date.now(),
  );
  if (pendingInvitation) redirect("/activate");

  // Creating an organization is only a first-run bootstrap operation.
  // Existing TIG-360 installations admit new staff through invitations.
  const admin = createAdminClient();
  const { count: existingOrganizations, error: countError } = await admin
    .from("organizations")
    .select("id", { count: "exact", head: true });
  if (countError) throw new Error("Unable to check workspace setup.");

  if (existingOrganizations && existingOrganizations > 0) {
    return (
      <main className="onboarding-page">
        <section className="onboarding-card">
          <div className="onboarding-icon"><Building2 size={24} /></div>
          <p className="eyebrow">Team access</p>
          <h1>Access not yet activated</h1>
          <p>
            This email doesn't currently have an active Inspect360 team membership.
            Ask an administrator to send or resend an invitation.
          </p>
          <form action={signOut}>
            <PendingSubmitButton className="secondary-button form-submit" pendingLabel="Signing out">
              Sign out
            </PendingSubmitButton>
          </form>
        </section>
      </main>
    );
  }

  const params = await searchParams;

  return (
    <main className="onboarding-page">
      <section className="onboarding-card">
        <div className="onboarding-icon"><Building2 size={24} /></div>
        <p className="eyebrow">Workspace setup</p>
        <h1>Create your organization</h1>
        <p>This becomes the secure home for your inspections, team, and documents.</p>

        {params.error ? <div className="form-alert error">{params.error}</div> : null}

        <form className="form-stack" action={createOrganization}>
          <label>
            Organization name
            <input name="name" defaultValue="Trident Inspection Group" required />
          </label>
          <label>
            Workspace slug
            <input name="slug" defaultValue="trident-inspection-group" required />
          </label>
          <PendingSubmitButton
            className="primary-button form-submit"
            pendingLabel="Creating workspace"
          >
            <Check size={17} /> Create workspace
          </PendingSubmitButton>
        </form>
      </section>
    </main>
  );
}
