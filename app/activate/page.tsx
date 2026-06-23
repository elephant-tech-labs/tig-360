import { redirect } from "next/navigation";
import { KeyRound, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import { activateAccount } from "./actions";

type ActivatePageProps = {
  searchParams: Promise<{ error?: string }>;
};

const roleLabels: Record<string, string> = {
  administrator: "Administrator",
  manager: "Manager",
  office_coordinator: "Office coordinator",
  inspector: "Inspector",
  treatment_coordinator: "Treatment coordinator",
};

export default async function ActivatePage({ searchParams }: ActivatePageProps) {
  const params = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?error=Open a fresh invitation link to continue.");

  const { data: memberships } = await supabase
    .from("organization_memberships")
    .select("organization_id")
    .eq("status", "active")
    .limit(1);
  if (memberships?.length) redirect("/jobs");

  const { data: invitations, error } = await supabase.rpc("get_current_invitation");
  if (error) throw new Error(error.message);
  const invitation = invitations?.[0];

  return (
    <main className="activation-page">
      <section className="activation-card">
        <div className="activation-icon"><ShieldCheck size={25} /></div>
        <p className="eyebrow">Account activation</p>
        <h1>Join {invitation?.organization_name ?? "Inspect360"}</h1>
        {invitation ? (
          <>
            <p className="activation-intro">
              You were invited as <strong>{roleLabels[invitation.invitation_role] ?? invitation.invitation_role}</strong>.
              Choose your password to finish activating {invitation.invitation_email}.
            </p>
            {params.error ? <div className="form-alert error">{params.error}</div> : null}
            <form className="form-stack" action={activateAccount}>
              <label>Full name<input name="fullName" defaultValue={String(user.user_metadata.full_name ?? "")} autoComplete="name" required /></label>
              <label>Password<input name="password" type="password" minLength={8} autoComplete="new-password" required /></label>
              <label>Confirm password<input name="confirmPassword" type="password" minLength={8} autoComplete="new-password" required /></label>
              <PendingSubmitButton className="primary-button form-submit" pendingLabel="Activating account">
                <KeyRound size={17} /> Activate account
              </PendingSubmitButton>
            </form>
          </>
        ) : (
          <div className="form-alert error">
            No active invitation was found for this email. Ask an administrator to resend the invitation.
          </div>
        )}
      </section>
    </main>
  );
}
