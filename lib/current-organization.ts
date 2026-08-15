import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { MembershipRole } from "@/lib/access";

export async function getCurrentContext() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: membership, error } = await supabase
    .from("organization_memberships")
    .select("organization_id, user_id, role, organizations(id, name, slug, timezone)")
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
}
