import { isCaliforniaWdoActivityCode } from "./activity-codes";
import {
  CALIFORNIA_WDO_BRANCH_SERIALIZATION_VERIFIED,
  CALIFORNIA_WDO_FIELD_WIDTHS,
} from "./config";
import type {
  CaliforniaWdoActivityExportRecord,
  WdoValidationField,
  WdoValidationIssue,
} from "./types";

const FIELD_LABELS: Record<Exclude<WdoValidationField, "branch" | "activityCode">, string> = {
  companyName: "Company name",
  registrationNumber: "SPCB principal registration",
  activityDate: "Activity date",
  buildingNumber: "Building number",
  street: "Street",
  city: "City",
  zipCode: "ZIP code",
  inspectorLicenseNumber: "Inspector license number",
};

const STRING_FIELDS = [
  "companyName",
  "registrationNumber",
  "activityDate",
  "buildingNumber",
  "street",
  "city",
  "zipCode",
  "inspectorLicenseNumber",
] as const;

function isPrintableAscii(value: string) {
  return /^[\x20-\x7E]*$/.test(value);
}

function isValidExportDate(value: string) {
  const match = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return false;
  const [, month, day, year] = match;
  const parsed = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  return parsed.getUTCFullYear() === Number(year)
    && parsed.getUTCMonth() + 1 === Number(month)
    && parsed.getUTCDate() === Number(day);
}

export function validateCaliforniaWdoRecord(
  record: CaliforniaWdoActivityExportRecord,
  options: {
    branchId?: string | null;
    inspectorName?: string | null;
    links?: Partial<Record<"activity" | "property" | "inspector" | "companySettings", string>>;
  } = {},
) {
  const issues: WdoValidationIssue[] = [];

  for (const field of STRING_FIELDS) {
    const value = record[field];
    const label = FIELD_LABELS[field];
    const width = CALIFORNIA_WDO_FIELD_WIDTHS[field];
    const href = field === "companyName" || field === "registrationNumber"
      ? options.links?.companySettings
      : field === "inspectorLicenseNumber"
        ? options.links?.inspector
        : field === "buildingNumber" || field === "street" || field === "city" || field === "zipCode"
          ? options.links?.activity || options.links?.property
          : options.links?.activity;

    if (!value) {
      issues.push({
        field,
        code: `missing_${field}`,
        message: field === "inspectorLicenseNumber" && options.inspectorName
          ? `Inspector ${options.inspectorName} is missing an SPCB license number.`
          : `${label} is required.`,
        href,
      });
      continue;
    }

    if (value.length > width) {
      issues.push({
        field,
        code: `${field}_too_long`,
        message: `${label} exceeds the California WDO TXT maximum of ${width} characters.`,
        href,
      });
    }

    if (!isPrintableAscii(value)) {
      issues.push({
        field,
        code: `${field}_unsupported_characters`,
        message: `${label} contains characters that cannot be represented safely in the California WDO TXT file.`,
        href,
      });
    }
  }

  if (record.activityDate && !isValidExportDate(record.activityDate)) {
    issues.push({
      field: "activityDate",
      code: "invalid_activity_date",
      message: "Activity date must be a valid regulatory calendar date.",
      href: options.links?.activity,
    });
  }

  if (record.zipCode && !/^(\d{5}|\d{9})$/.test(record.zipCode)) {
    issues.push({
      field: "zipCode",
      code: "invalid_zip_code",
      message: "ZIP code must contain 5 or 9 digits for the California WDO TXT format.",
      href: options.links?.activity || options.links?.property,
    });
  }

  if (!isCaliforniaWdoActivityCode(record.activityCode)) {
    issues.push({
      field: "activityCode",
      code: "invalid_activity_code",
      message: "Choose a recognized California WDO activity type.",
      href: options.links?.activity,
    });
  }

  if (options.branchId && !CALIFORNIA_WDO_BRANCH_SERIALIZATION_VERIFIED) {
    issues.push({
      field: "branch",
      code: "branch_serialization_unverified",
      message: "Branch-office TXT format requires verification before generation.",
      href: options.links?.activity,
    });
  }

  return issues;
}

export class CaliforniaWdoValidationError extends Error {
  constructor(public readonly issues: WdoValidationIssue[]) {
    super(issues.map((issue) => issue.message).join(" "));
    this.name = "CaliforniaWdoValidationError";
  }
}
