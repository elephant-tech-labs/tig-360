"use server";

import { redirect } from "next/navigation";
import { getTeamEmailAccess } from "@/lib/auth/team-email-access";
import { createClient } from "@/lib/supabase/server";

function loginUrl(message: string, type: "error" | "message" = "error") {
  return `/login?${type}=${encodeURIComponent(message)}`;
}

function verifyUrl(email: string, message: string, type: "error" | "message" = "error") {
  const params = new URLSearchParams({ step: "verify", email, [type]: message });
  return `/login?${params.toString()}`;
}

function validEmail(value: string): boolean {
  return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function requestLoginCode(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!validEmail(email)) redirect(loginUrl("Enter a valid work email address."));

  let eligible = false;
  try {
    const access = await getTeamEmailAccess(email);
    eligible = access.kind === "active" || access.kind === "invited";
  } catch {
    redirect(loginUrl("Unable to check access right now. Please try again."));
  }

  if (eligible) {
    const supabase = await createClient();
    // Invited users already have an Auth account created by the administrator.
    // Never allow an unknown email to create an account via this login form.
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false },
    });

    if (error) {
      // Keep the public response indistinguishable from an unknown email.
      console.error("Inspect360 OTP delivery failed:", error.message);
    }
  }

  redirect(verifyUrl(
    email,
    "If this address has active access or a valid invitation, a sign-in code will arrive shortly.",
    "message",
  ));
}

export async function verifyLoginCode(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const token = String(formData.get("token") ?? "").replace(/\s/g, "");

  if (!validEmail(email) || !/^\d{8}$/.test(token)) {
    redirect(verifyUrl(email, "Enter the complete 8-digit code from your email."));
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ email, token, type: "email" });
  if (error) {
    redirect(verifyUrl(email, "The code is invalid or expired. Please request another."));
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.email?.trim().toLowerCase() !== email) {
    await supabase.auth.signOut();
    redirect(loginUrl("Unable to confirm your account."));
  }

  // OTP verifies identity, not authorization. Check active access by the
  // verified Auth user ID, not the email supplied by the form.
  const { data: membership, error: membershipError } = await supabase
    .from("organization_memberships")
    .select("organization_id")
    .eq("user_id", user.id)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();

  if (!membershipError && membership) redirect("/jobs");

  // A verified user with no membership can only proceed if an administrator
  // already invited them and the invitation has not expired or been revoked.
  let pendingInvitation = false;
  try {
    const access = await getTeamEmailAccess(email);
    if (access.kind === "invited" && access.userId === user.id) {
      const { data: invitations, error: invitationError } =
        await supabase.rpc("get_current_invitation");
      pendingInvitation = Boolean(!invitationError && invitations?.some(
        (invitation: { invitation_status: string; expires_at: string }) =>
          invitation.invitation_status === "pending" &&
          Date.parse(invitation.expires_at) > Date.now(),
      ));
    }
  } catch {
    console.error("Inspect360 pending invitation verification failed");
  }

  if (pendingInvitation) redirect("/activate");

  await supabase.auth.signOut();
  redirect(loginUrl("This account is not authorized. Contact your administrator."));
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
