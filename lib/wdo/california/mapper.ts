import { normalizeWdoAddress, normalizeWdoWhitespace } from "./address";
import { isCaliforniaWdoActivityCode } from "./activity-codes";
import type {
  CaliforniaWdoActivityCode,
  WdoActivityMappingInput,
  WdoMappedActivity,
} from "./types";
import { validateCaliforniaWdoRecord } from "./validator";

export function formatCaliforniaWdoActivityDate(value: string | null | undefined) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return "";
  const [year, month, day] = value.split("-");
  const parsed = new Date(`${year}-${month}-${day}T12:00:00Z`);
  if (
    Number.isNaN(parsed.valueOf())
    || parsed.getUTCFullYear() !== Number(year)
    || parsed.getUTCMonth() + 1 !== Number(month)
    || parsed.getUTCDate() !== Number(day)
  ) return "";
  return `${month}/${day}/${year}`;
}

export function mapCaliforniaWdoActivity(
  input: WdoActivityMappingInput,
): WdoMappedActivity {
  const activityHref = input.links?.activity;
  const normalizedAddress = normalizeWdoAddress(input.address, activityHref);
  const activityCode = isCaliforniaWdoActivityCode(input.activityCode)
    ? input.activityCode
    : (input.activityCode ?? 0) as CaliforniaWdoActivityCode;
  const record = {
    companyName: normalizeWdoWhitespace(input.companyName),
    registrationNumber: normalizeWdoWhitespace(input.registrationNumber),
    activityDate: formatCaliforniaWdoActivityDate(input.activityDate),
    buildingNumber: normalizedAddress.buildingNumber,
    street: normalizedAddress.street,
    city: normalizedAddress.city,
    zipCode: normalizedAddress.zipCode,
    inspectorLicenseNumber: normalizeWdoWhitespace(input.inspectorLicenseNumber),
    activityCode,
  };
  const validationIssues = validateCaliforniaWdoRecord(record, {
    branchId: input.branchId,
    inspectorName: input.inspectorName,
    links: input.links,
  });
  const regionIssues = input.address.region !== undefined
    && normalizeWdoWhitespace(input.address.region).toUpperCase() !== "CA"
    ? [{
        field: "region" as const,
        code: "property_not_california",
        message: "WDO-required property must be in California.",
        href: input.links?.property || activityHref,
      }]
    : [];
  const issues = [...normalizedAddress.issues, ...regionIssues, ...validationIssues].filter(
    (issue, index, all) => all.findIndex(
      (candidate) => candidate.field === issue.field && candidate.code === issue.code,
    ) === index,
  );

  return { record, issues };
}
