"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

function activationUrl(message: string) {
  return `/activate?error=${encodeURIComponent(message)}`;
}

export async function activateAccount(formData: FormData) {
  const fullName = String(formData.get("fullName") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  if (!fullName) redirect(activationUrl("Enter your full name."));
  if (password.length < 8) redirect(activationUrl("Password must be at least 8 characters."));
  if (password !== confirmPassword) redirect(activationUrl("Passwords do not match."));

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?error=Open a fresh invitation link to continue.");

  const { error: userError } = await supabase.auth.updateUser({
    password,
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
