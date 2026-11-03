"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Building2,
  CalendarDays,
  ClipboardCheck,
  FileCheck2,
  Grid2X2,
  Settings,
  ShieldCheck,
  Users,
} from "lucide-react";
import { LinkPendingIndicator } from "@/components/link-pending-indicator";
import {
  canAccessContacts,
  canAccessManagement,
  canAccessWdoCompliance,
  type MembershipRole,
} from "@/lib/access";

const navItems = [
  { key: "dashboard", label: "Dashboard", href: "/jobs", icon: Grid2X2 },
  { key: "jobs", label: "Inspection jobs", href: "/jobs", icon: ClipboardCheck },
  { key: "schedule", label: "Schedule", href: "#", icon: CalendarDays },
  { key: "contacts", label: "Contacts", href: "/contacts", icon: Users },
  { key: "compliance", label: "Compliance", href: "/compliance/wdo", icon: ShieldCheck },
  { key: "management", label: "Management", href: "/management", icon: Settings },
  { key: "properties", label: "Properties", href: "#", icon: Building2 },
  { key: "documents", label: "Documents", href: "#", icon: FileCheck2 },
] as const;

export function activeSection(pathname: string) {
  if (pathname.startsWith("/contacts")) return "contacts";
  if (pathname.startsWith("/compliance")) return "compliance";
  if (pathname.startsWith("/management") || pathname.startsWith("/team")) return "management";
  return "jobs";
}

export function WorkspaceNav({ membershipRole }: { membershipRole: MembershipRole }) {
  const active = activeSection(usePathname() ?? "");

  return (
    <nav className="primary-nav" aria-label="Primary navigation">
      {navItems.filter((item) => {
        if (item.key === "management") return canAccessManagement(membershipRole);
        if (item.key === "compliance") return canAccessWdoCompliance(membershipRole);
        if (item.key === "contacts") return canAccessContacts(membershipRole);
        if (item.key === "schedule" || item.key === "properties" || item.key === "documents") {
          return membershipRole !== "inspector";
        }
        return true;
      }).map((item) => {
        const Icon = item.icon;
        const isActive = active === item.key;
        return (
          <Link
            aria-current={isActive ? "page" : undefined}
            className={`nav-item ${isActive ? "active" : ""}`}
            href={item.href}
            key={item.key}
          >
            <Icon size={18} /> {item.label}
            <LinkPendingIndicator />
          </Link>
        );
      })}
    </nav>
  );
}
