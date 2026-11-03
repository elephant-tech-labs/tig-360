import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { MembershipRole } from "@/lib/access";

// cache(): the workspace layout and the page share one lookup per request.
export const getCurrentContext = cache(async () => {
  const supabase = await createClient();
  // The membership query is scoped by RLS on the session, not by `user`,
  // so both requests run together instead of back to back.
  const [
    {
      data: { user },
    },
    { data: membership, error },
  ] = await Promise.all([
    supabase.auth.getUser(),
    supabase
      .from("organization_memberships")
      .select("organization_id, user_id, role, organizations(id, name, slug, timezone)")
      .eq("status", "active")
      .limit(1)
      .maybeSingle(),
  ]);

  if (!user) redirect("/login");
  if (error) throw new Error(error.message);
  if (!membership) redirect("/onboarding");

  const organization = Array.isArray(membership.organizations)
    ? membership.organizations[0]
    : membership.organizations;

  if (!organization) redirect("/onboarding");

  return {
    supabase,
    user,
    membership: {
      ...membership,
      role: membership.role as MembershipRole,
    },
    organization,
    userName:
      String(user.user_metadata.full_name ?? user.user_metadata.name ?? user.email ?? "Team member"),
  };
});
