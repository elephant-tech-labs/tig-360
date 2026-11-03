import { createAdminClient } from "@/lib/supabase/admin";

export type TeamEmailAccess = {
  kind: "active" | "invited" | "denied";
  userId: string | null;
};

/**
 * A private server-side preflight. Neither an email address nor possession of
 * an Auth account is permission to use Inspect360.
 *
 * Invited users may request an OTP only to verify their address and complete
 * an unexpired invitation. Inspection access starts after activation.
 */
export async function getTeamEmailAccess(email: string): Promise<TeamEmailAccess> {
  const admin = createAdminClient();
  const normalizedEmail = email.trim().toLowerCase();

  const { data: candidates, error: profileError } = await admin
    .from("profiles")
    .select("id, email")
    .ilike("email", normalizedEmail)
    .limit(50);

  if (profileError) throw new Error("Unable to check team access.");

  // ILIKE treats % and _ as wildcards. Require an exact match after lookup.
  const profile = candidates?.find(
    (item) => String(item.email ?? "").trim().toLowerCase() === normalizedEmail,
  );
  if (!profile) return { kind: "denied", userId: null };

  const { data: memberships, error: membershipError } = await admin
    .from("organization_memberships")
    .select("organization_id, status")
    .eq("user_id", profile.id);

  if (membershipError) throw new Error("Unable to check team access.");
  if (memberships?.some((item) => item.status === "active")) {
    return { kind: "active", userId: profile.id };
  }

  // Suspension cannot be overridden by a pending invitation.
  if (memberships?.some((item) => item.status === "suspended")) {
    return { kind: "denied", userId: profile.id };
  }

  const { data: invitations, error: invitationError } = await admin
    .from("organization_invitations")
    .select("organization_id, auth_user_id")
    .eq("email", normalizedEmail)
    .eq("status", "pending")
    .gt("expires_at", new Date().toISOString())
    .limit(20);

  if (invitationError) throw new Error("Unable to check invitations.");

  const pending = invitations?.some(
    (invitation) =>
      (!invitation.auth_user_id || invitation.auth_user_id === profile.id) &&
      !memberships?.some(
        (membership) =>
          membership.organization_id === invitation.organization_id &&
          membership.status === "suspended",
      ),
  );

  return { kind: pending ? "invited" : "denied", userId: profile.id };
}
