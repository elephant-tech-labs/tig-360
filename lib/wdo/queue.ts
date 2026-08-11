import type { WdoValidationIssue } from "./california/types";
import type { WdoDeadline } from "./california/deadlines";

export type WdoPriorExport = {
  batchId: string;
  filename: string;
  generatedAt: string;
  status: "generated" | "filed";
  createdBy: string;
  spcbSubmittalNumber: string | null;
};

export type WdoQueueExportStatus = "not_generated" | "generated_previously" | "filed";

export type WdoQueueRow = {
  id: string;
  jobId: string | null;
  jobNumber: number | null;
  activityDate: string | null;
  property: string;
  activityType: string;
  inspectorName: string;
  inspectorLicenseNumber: string | null;
  branchName: string;
  deadline: WdoDeadline | null;
  exportStatus: WdoQueueExportStatus;
  issues: WdoValidationIssue[];
  priorExports: WdoPriorExport[];
};

export function wdoExportStatusLabel(status: WdoQueueExportStatus) {
  if (status === "filed") return "Filed";
  if (status === "generated_previously") return "Generated previously";
  return "Not generated";
}
