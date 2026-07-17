import Link from "next/link";
import {
  Camera,
  CheckCircle2,
  ClipboardList,
  FileCheck2,
  FilePenLine,
  Send,
  AlertTriangle,
  Check,
  CircleDot,
  Minus,
  Map,
} from "lucide-react";
import type { JobWorkflowStates, WorkflowStepState } from "@/lib/job-workflow";

type JobAuthoringNavProps = {
  jobId: string;
  current: "setup" | "drawing" | "findings" | "photos" | "review" | "proposal" | "send";
  states: JobWorkflowStates;
};

const steps = [
  { id: "setup", label: "Job setup", icon: ClipboardList, href: (jobId: string) => `/jobs/${jobId}` },
  { id: "drawing", label: "Drawing", icon: Map, href: (jobId: string) => `/jobs/${jobId}/drawing` },
  { id: "findings", label: "Findings", icon: CheckCircle2, href: (jobId: string) => `/jobs/${jobId}/findings` },
  { id: "photos", label: "Photos", icon: Camera, href: (jobId: string) => `/jobs/${jobId}/photos` },
  { id: "review", label: "Review", icon: FileCheck2, href: (jobId: string) => `/jobs/${jobId}/review` },
  { id: "proposal", label: "Proposal", icon: FilePenLine, href: (jobId: string) => `/jobs/${jobId}/proposal` },
  { id: "send", label: "Send", icon: Send, href: (jobId: string) => `/jobs/${jobId}/send` },
] as const;

function StepIndicator({ index, state }: { index: number; state: WorkflowStepState }) {
  if (state === "complete") return <span className="complete"><Check size={12} /></span>;
  if (state === "in_progress") return <span className="in-progress"><CircleDot size={11} /></span>;
  if (state === "not_required") return <span className="not-required"><Minus size={12} /></span>;
  if (state === "attention") return <span className="attention"><AlertTriangle size={11} /></span>;
  return <span>{index}</span>;
}

export function JobAuthoringNav({ jobId, current, states }: JobAuthoringNavProps) {
  return (
    <nav className="job-authoring-nav" aria-label="Inspection authoring workflow">
      {steps.map((step, index) => {
        const Icon = step.icon;
        const state = states[step.id];
        const content = <><StepIndicator index={index + 1} state={state} /><Icon size={15} />{step.label}</>;
        return <Link className={`job-authoring-step ${current === step.id ? "active" : ""} state-${state}`} href={step.href(jobId)} key={step.id}>{content}</Link>;
      })}
    </nav>
  );
}
