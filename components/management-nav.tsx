import Link from "next/link";
import { Building2, FileText, ShieldCheck } from "lucide-react";
import { LinkPendingIndicator } from "@/components/link-pending-indicator";

export function ManagementNav({
  current,
}: {
  current: "company" | "inspectors" | "report-content";
}) {
  const items = [
    { id: "company", label: "Company profile", href: "/management", icon: Building2 },
    { id: "inspectors", label: "Inspectors and access", href: "/team/inspectors", icon: ShieldCheck },
    { id: "report-content", label: "Report content", href: "/management/report-content", icon: FileText },
  ] as const;

  return (
    <nav className="management-nav" aria-label="Management sections">
      {items.map((item) => {
        const Icon = item.icon;
        return <Link aria-current={current === item.id ? "page" : undefined} className={current === item.id ? "active" : ""} href={item.href} key={item.id}><Icon size={16} /> {item.label}<LinkPendingIndicator /></Link>;
      })}
    </nav>
  );
}
