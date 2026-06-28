import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeft, MapPin, Pencil } from "lucide-react";

type JobWorkspaceHeaderProps = {
  jobId: string;
  jobNumber: number;
  address: string;
  locality: string;
  reportType: string;
  showEdit?: boolean;
  actions?: ReactNode;
};

export function JobWorkspaceHeader({
  jobId,
  jobNumber,
  address,
  locality,
  reportType,
  showEdit = false,
  actions,
}: JobWorkspaceHeaderProps) {
  return (
    <header className="job-workspace-header">
      <div>
        <Link className="back-link" href="/jobs"><ArrowLeft size={16} /> All jobs</Link>
        <p className="eyebrow">Inspection job / #{jobNumber}</p>
        <div className="job-workspace-title">
          <h1>{address || "Untitled property"}</h1>
          <span>{reportType.replaceAll("_", " ")}</span>
        </div>
        <p><MapPin size={15} /> {locality || "Address incomplete"}</p>
      </div>
      {(showEdit || actions) ? (
        <div className="job-workspace-actions">
          {actions}
          {showEdit ? <Link className="secondary-button" href={`/jobs/${jobId}/edit`}><Pencil size={16} /> Edit job</Link> : null}
        </div>
      ) : null}
    </header>
  );
}
