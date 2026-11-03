"use server";

import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
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

/**
 * Allow only existing team members with an active organization membership.
 * The service-role lookup is server-only; no public self-registration or
 * unauthenticated membership RPC is exposed.
 */
async function isAuthorizedTeamEmail(email: string): Promise<boolean> {
  const admin = createAdminClient();
  const { data: candidates, error: profileError } = await admin
    .from("profiles")
    .select("id, email")
    .ilike("email", email)
    .limit(50);

  if (profileError) throw new Error("Unable to check team access.");

  // ILIKE treats '_' and '%' as pattern characters. Check exact normalized
  // equality before allowing a code, including addresses containing '_'.
  const profile = candidates?.find(
    (candidate) => String(candidate.email ?? "").trim().toLowerCase() === email,
  );
  if (!profile) return false;

  const { data: membership, error: membershipError } = await admin
    .from("organization_memberships")
    .select("organization_id")
    .eq("user_id", profile.id)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();

  if (membershipError) throw new Error("Unable to check team access.");
  return Boolean(membership);
}

export async function requestLoginCode(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!validEmail(email)) redirect(loginUrl("Enter a valid work email address."));

  let authorized = false;
  try {
    authorized = await isAuthorizedTeamEmail(email);
  } catch {
    redirect(loginUrl("Unable to check access right now. Please try again."));
  }

  if (authorized) {
    const supabase = await createClient();
    // Never create new users through the public login screen.
    // Supabase handles OTP expiration and resend rate limits.
    await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false },
    });
  }

  // Deliberately identical response for unknown, suspended, and active emails
  // to avoid revealing which email addresses have TIG-360 access.
  redirect(verifyUrl(email, "If this email has active TIG-360 access, a sign-in code will arrive shortly.", "message"));
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

  // Repeat authorization AFTER successful OTP verification: a membership can
  // be suspended or removed between requesting and entering the code.
  const { data: membership, error: membershipError } = await supabase
    .from("organization_memberships")
    .select("organization_id")
    .eq("user_id", user.id)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();

  if (membershipError || !membership) {
    await supabase.auth.signOut();
    redirect(loginUrl("This account is not authorized. Contact your administrator."));
  }

  redirect("/jobs");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
