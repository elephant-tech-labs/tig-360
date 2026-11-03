import { AppShell } from "@/components/app-shell";
import { getCurrentContext } from "@/lib/current-organization";

// Shared by every signed-in workspace route so the shell stays mounted
// across navigations and only the page content suspends.
export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const { organization, userName, membership } = await getCurrentContext();
  return (
    <AppShell organizationName={organization.name} userName={userName} membershipRole={membership.role}>
      {children}
    </AppShell>
  );
}
