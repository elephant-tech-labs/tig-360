import { redirect } from "next/navigation";
import { Building2, Check } from "lucide-react";
import { createOrganization } from "./actions";
import { createClient } from "@/lib/supabase/server";

type OnboardingPageProps = {
  searchParams: Promise<{ error?: string }>;
};

export default async function OnboardingPage({ searchParams }: OnboardingPageProps) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: membership } = await supabase
    .from("organization_memberships")
    .select("organization_id")
    .eq("status", "active")
    .limit(1)
    .maybeSingle();

  if (membership) redirect("/jobs");

  const params = await searchParams;

  return (
    <main className="onboarding-page">
      <section className="onboarding-card">
        <div className="onboarding-icon"><Building2 size={24} /></div>
        <p className="eyebrow">Workspace setup</p>
        <h1>Create your organization</h1>
        <p>This becomes the secure home for your inspections, team, and documents.</p>

        {params.error ? <div className="form-alert error">{params.error}</div> : null}

        <form className="form-stack" action={createOrganization}>
          <label>
            Organization name
            <input name="name" defaultValue="Trident Inspection Group" required />
          </label>
          <label>
            Workspace slug
            <input name="slug" defaultValue="trident-inspection-group" required />
          </label>
          <button className="primary-button form-submit" type="submit">
            <Check size={17} /> Create workspace
          </button>
        </form>
      </section>
    </main>
  );
}
