import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { MembershipRole } from "@/lib/access";

// cache(): the workspace layout and the page share one lookup per request.
export const getCurrentContext = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // RLS lets members read every membership in their organization, so the
  // lookup must be filtered to the signed-in user to get *their* role.
  const { data: membership, error } = await supabase
    .from("organization_memberships")
    .select("organization_id, user_id, role, organizations(id, name, slug, timezone)")
    .eq("user_id", user.id)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();

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
