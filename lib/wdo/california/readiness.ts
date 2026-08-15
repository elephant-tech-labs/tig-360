import { REPORT_TYPE_TO_WDO_ACTIVITY_CODE } from "./activity-codes";
import { mapCaliforniaWdoActivity } from "./mapper";
import type {
  WdoAddressSource,
  WdoFilingRequirement,
  WdoValidationIssue,
} from "./types";

export type CaliforniaWdoReadinessInput = {
  jobId: string;
  filingRequirement: WdoFilingRequirement;
  reportType: string | null;
  inspectionDate: string | null;
  companyName: string | null;
  registrationNumber: string | null;
  inspectorId: string | null;
  inspectorName: string | null;
  inspectorLicenseNumber: string | null;
  branchId?: string | null;
  branchName?: string | null;
  address: WdoAddressSource;
};

export type CaliforniaWdoReadiness = {
  filingRequirement: WdoFilingRequirement;
  required: boolean;
  ready: boolean;
  issues: WdoValidationIssue[];
  checks: Array<{ label: string; ready: boolean; detail: string }>;
};

function calendarDate(value: string | null) {
  return value ? value.slice(0, 10) : null;
}

function dedupeIssues(issues: WdoValidationIssue[]) {
  return issues.filter((issue, index, all) => all.findIndex(
    (candidate) => candidate.field === issue.field,
  ) === index);
}

export function getCaliforniaWdoReadinessForJob(
  input: CaliforniaWdoReadinessInput,
): CaliforniaWdoReadiness {
  if (input.filingRequirement === "not_required") {
    return {
      filingRequirement: input.filingRequirement,
      required: false,
      ready: true,
      issues: [],
      checks: [{
        label: "WDO filing",
        ready: true,
        detail: "Not required; audited exclusion retained.",
      }],
    };
  }

  const activityCode = input.reportType
    ? REPORT_TYPE_TO_WDO_ACTIVITY_CODE[
        input.reportType as keyof typeof REPORT_TYPE_TO_WDO_ACTIVITY_CODE
      ]
    : undefined;
  const jobHref = `/jobs/${input.jobId}/edit#wdo-filing`;
  const propertyHref = `/jobs/${input.jobId}/edit#property-address`;
  const issues: WdoValidationIssue[] = [];

  if (String(input.address.region ?? "").toUpperCase() !== "CA") {
    issues.push({
      field: "region",
      code: "property_not_california",
      message: "WDO-required property must be in California.",
      href: propertyHref,
    });
  }
  if (!input.inspectorId) {
    issues.push({
      field: "inspectorLicenseNumber",
      code: "missing_inspector",
      message: "Select the responsible inspector.",
      href: jobHref,
    });
  }

  const mapped = mapCaliforniaWdoActivity({
    activityId: input.jobId,
    activityDate: calendarDate(input.inspectionDate),
    activityCode: activityCode ?? null,
    branchId: input.branchId ?? null,
    branchName: input.branchName ?? null,
    companyName: input.companyName,
    registrationNumber: input.registrationNumber,
    inspectorLicenseNumber: input.inspectorLicenseNumber,
    inspectorName: input.inspectorName,
    address: input.address,
    links: {
      activity: jobHref,
      property: propertyHref,
      inspector: "/team/inspectors",
      companySettings: "/management",
    },
  });
  issues.push(...mapped.issues);
  const deduped = dedupeIssues(issues);
  const hasIssue = (...fields: string[]) => deduped.some(
    (issue) => fields.includes(issue.field),
  );
  const addressReady = !hasIssue("buildingNumber", "street", "city", "zipCode", "region");
  const activityReady = !hasIssue("activityDate", "activityCode");
  const inspectorReady = !hasIssue("inspectorLicenseNumber");
  const companyReady = !hasIssue("companyName", "registrationNumber");
  const officeReady = !hasIssue("branch");

  return {
    filingRequirement: input.filingRequirement,
    required: true,
    ready: deduped.length === 0,
    issues: deduped,
    checks: [
      { label: "WDO filing", ready: true, detail: "Required" },
      { label: "Property address", ready: addressReady, detail: addressReady ? "Verified for TXT" : "Needs confirmation" },
      { label: "Inspection date and activity", ready: activityReady, detail: activityReady ? "Configured" : "Needs attention" },
      { label: "Inspector SPCB license", ready: inspectorReady, detail: inspectorReady ? `${input.inspectorName} · ${input.inspectorLicenseNumber}` : "Needs attention" },
      { label: "Company and PR", ready: companyReady, detail: companyReady ? `${input.registrationNumber} · Principal Office` : "Needs attention" },
      { label: "Filing office", ready: officeReady, detail: officeReady ? "Principal Office" : "Needs attention" },
    ],
  };
}

export function groupCaliforniaWdoIssuesForOffice(issues: WdoValidationIssue[]) {
  const addressFields = ["buildingNumber", "street", "city", "zipCode", "region"];
  const addressIssues = issues.filter((issue) => addressFields.includes(issue.field));
  const otherIssues = issues.filter((issue) => !addressFields.includes(issue.field));
  if (!addressIssues.length) return otherIssues;
  return [
    {
      field: "buildingNumber" as const,
      code: "property_address_needs_confirmation",
      message: "Property address needs confirmation for California WDO filing.",
      href: addressIssues.find((issue) => issue.href)?.href,
    },
    ...otherIssues,
  ];
}
