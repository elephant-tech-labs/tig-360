import Link from "next/link";
import {
  Bell,
  Building2,
  CalendarDays,
  ChevronDown,
  ClipboardCheck,
  FileCheck2,
  Grid2X2,
  LogOut,
  Plus,
  Search,
  Users,
} from "lucide-react";
import { signOut } from "@/app/auth/actions";

type AppShellProps = {
  children: React.ReactNode;
  organizationName: string;
  userName: string;
  active?: "dashboard" | "jobs" | "schedule" | "contacts" | "properties" | "documents";
};

const navItems = [
  { key: "dashboard", label: "Dashboard", href: "/jobs", icon: Grid2X2 },
  { key: "jobs", label: "Inspection jobs", href: "/jobs", icon: ClipboardCheck },
  { key: "schedule", label: "Schedule", href: "#", icon: CalendarDays },
  { key: "contacts", label: "Contacts", href: "/contacts", icon: Users },
  { key: "properties", label: "Properties", href: "#", icon: Building2 },
  { key: "documents", label: "Documents", href: "#", icon: FileCheck2 },
] as const;

export function AppShell({
  children,
  organizationName,
  userName,
  active = "jobs",
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

        <nav className="primary-nav" aria-label="Primary navigation">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                className={`nav-item ${active === item.key ? "active" : ""}`}
                href={item.href}
                key={item.key}
              >
                <Icon size={18} /> {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <div className="workspace-avatar">{initials}</div>
          <div><strong>{userName}</strong><span>Team member</span></div>
          <details className="account-menu">
            <summary aria-label="Account menu"><ChevronDown size={16} /></summary>
            <form action={signOut}>
              <button type="submit"><LogOut size={15} /> Sign out</button>
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
            <Link className="new-job-button" href="/jobs/new">
              <Plus size={17} /> New job
            </Link>
          </div>
        </header>
        {children}
      </section>
    </main>
  );
}
