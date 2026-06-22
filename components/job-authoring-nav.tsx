import Link from "next/link";
import {
  Camera,
  CheckCircle2,
  ClipboardList,
  FileCheck2,
  Map,
} from "lucide-react";

type JobAuthoringNavProps = {
  jobId: string;
  current: "setup" | "drawing" | "findings" | "photos" | "review";
};

const steps = [
  { id: "setup", label: "Job setup", icon: ClipboardList, href: (jobId: string) => `/jobs/${jobId}` },
  { id: "drawing", label: "Drawing", icon: Map, href: (jobId: string) => `/jobs/${jobId}/drawing` },
  { id: "findings", label: "Findings", icon: CheckCircle2, href: (jobId: string) => `/jobs/${jobId}/findings` },
  { id: "photos", label: "Photos", icon: Camera, href: (jobId: string) => `/jobs/${jobId}/photos` },
  { id: "review", label: "Review", icon: FileCheck2, href: () => "" },
] as const;

export function JobAuthoringNav({ jobId, current }: JobAuthoringNavProps) {
  return (
    <nav className="job-authoring-nav" aria-label="Inspection authoring workflow">
      {steps.map((step, index) => {
        const Icon = step.icon;
        const unavailable = step.id === "review";
        const content = <><span>{index + 1}</span><Icon size={15} />{step.label}</>;
        return unavailable
          ? <span className="job-authoring-step unavailable" key={step.id}>{content}</span>
          : <Link className={`job-authoring-step ${current === step.id ? "active" : ""}`} href={step.href(jobId)} key={step.id}>{content}</Link>;
      })}
    </nav>
  );
}
