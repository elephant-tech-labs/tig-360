import Link from "next/link";
import { ArrowLeft, MapPin, Pencil } from "lucide-react";

type JobWorkspaceHeaderProps = {
  jobId: string;
  jobNumber: number;
  address: string;
  locality: string;
  reportType: string;
  showEdit?: boolean;
};

export function JobWorkspaceHeader({
  jobId,
  jobNumber,
  address,
  locality,
  reportType,
  showEdit = false,
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
      {showEdit ? <Link className="secondary-button" href={`/jobs/${jobId}/edit`}><Pencil size={16} /> Edit job</Link> : null}
    </header>
  );
}
