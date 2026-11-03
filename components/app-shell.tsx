import Link from "next/link";
import { Bell, ChevronDown, LogOut, Plus, Search } from "lucide-react";
import { signOut } from "@/app/auth/actions";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import { WorkspaceNav } from "@/components/workspace-nav";
import { canCreateJobs, roleLabels, type MembershipRole } from "@/lib/access";

type AppShellProps = {
  children: React.ReactNode;
  organizationName: string;
  userName: string;
  membershipRole: MembershipRole;
};

export function AppShell({
  children,
  organizationName,
  userName,
  membershipRole,
}: AppShellProps) {
  const initials = userName
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() || "TI";

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <Link className="brand" href="/jobs">
          <div className="brand-mark">TI</div>
          <div><strong>Trident</strong><span>Inspect360</span></div>
        </Link>

        <div className="organization-label">{organizationName}</div>

        <WorkspaceNav membershipRole={membershipRole} />

        <div className="sidebar-footer">
          <div className="workspace-avatar">{initials}</div>
          <div><strong>{userName}</strong><span>{roleLabels[membershipRole]}</span></div>
          <details className="account-menu">
            <summary aria-label="Account menu"><ChevronDown size={16} /></summary>
            <form action={signOut}>
              <PendingSubmitButton className="" pendingLabel="Signing out"><LogOut size={15} /> Sign out</PendingSubmitButton>
            </form>
          </details>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <label className="search-box">
            <Search size={17} />
            <input aria-label="Search" placeholder="Search jobs, addresses, contacts" />
          </label>
          <div className="topbar-actions">
            <button className="icon-button" title="Notifications" aria-label="Notifications">
              <Bell size={18} />
            </button>
            {canCreateJobs(membershipRole) ? (
              <Link className="new-job-button" href="/jobs/new">
                <Plus size={17} /> New job
              </Link>
            ) : null}
          </div>
        </header>
        {children}
      </section>
    </main>
  );
}
