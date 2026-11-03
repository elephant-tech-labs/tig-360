"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

function activationUrl(message: string) {
  return `/activate?error=${encodeURIComponent(message)}`;
}

export async function activateAccount(formData: FormData) {
  const fullName = String(formData.get("fullName") ?? "").trim();
  if (!fullName) redirect(activationUrl("Enter your full name."));

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?error=Open a fresh invitation link to continue.");

  // Invitation links establish a verified Supabase session. Account activation
  // only needs to capture the team member's name: future logins use email OTP.
  const { error: userError } = await supabase.auth.updateUser({
    data: { ...user.user_metadata, full_name: fullName },
  });
  if (userError) redirect(activationUrl(userError.message));

  const { error: profileError } = await supabase
    .from("profiles")
    .update({ full_name: fullName })
    .eq("id", user.id);
  if (profileError) redirect(activationUrl(profileError.message));

  const { error: invitationError } = await supabase.rpc("activate_current_invitation");
  if (invitationError) redirect(activationUrl(invitationError.message));

  redirect("/jobs?welcome=1");
}
