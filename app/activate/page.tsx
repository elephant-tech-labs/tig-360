import { redirect } from "next/navigation";
import { CheckCircle2, ShieldCheck } from "lucide-react";
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
    .eq("user_id", user.id)
    .eq("status", "active")
    .limit(1);
  if (memberships?.length) redirect("/jobs");

  const { data: invitations, error } = await supabase.rpc("get_current_invitation");
  if (error) throw new Error(error.message);
  const invitation = invitations?.find(
    (candidate: { invitation_status: string; expires_at: string }) =>
      candidate.invitation_status === "pending" &&
      Date.parse(candidate.expires_at) > Date.now(),
  );

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
              Confirm your name to activate {invitation.invitation_email}. After activation,
              you can sign in using a code emailed to you. No password is needed.
            </p>
            {params.error ? <div className="form-alert error" role="alert">{params.error}</div> : null}
            <form className="form-stack" action={activateAccount}>
              <label>
                Full name
                <input
                  name="fullName"
                  defaultValue={String(user.user_metadata.full_name ?? "")}
                  autoComplete="name"
                  required
                />
              </label>
              <PendingSubmitButton className="primary-button form-submit" pendingLabel="Activating account">
                <CheckCircle2 size={17} /> Activate account
              </PendingSubmitButton>
            </form>
          </>
        ) : (
          <div className="form-alert error">
            {params.error || "No valid invitation was found for this email. Ask an administrator to send a fresh invitation."}
          </div>
        )}
      </section>
    </main>
  );
}
