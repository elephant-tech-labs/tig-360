import type { WdoAddressSource, WdoValidationIssue } from "./types";

export function normalizeWdoWhitespace(value: string | null | undefined) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

export type NormalizedWdoAddress = {
  buildingNumber: string;
  street: string;
  city: string;
  zipCode: string;
  issues: WdoValidationIssue[];
};

export function normalizeWdoAddress(
  source: WdoAddressSource,
  activityHref?: string,
): NormalizedWdoAddress {
  const streetLine1 = normalizeWdoWhitespace(source.streetLine1);
  const streetLine2 = normalizeWdoWhitespace(source.streetLine2);
  const overrideBuildingNumber = normalizeWdoWhitespace(source.overrideBuildingNumber);
  const overrideStreet = normalizeWdoWhitespace(source.overrideStreet);
  const overrideCity = normalizeWdoWhitespace(source.overrideCity);
  const overrideZipCode = normalizeWdoWhitespace(source.overrideZipCode);
  const canonicalMatch = streetLine1.match(/^([0-9][A-Za-z0-9-]*)\s+(.+)$/);
  const canonicalBuildingNumber = canonicalMatch?.[1] ?? "";
  const canonicalStreet = canonicalMatch?.[2] ?? streetLine1;
  const buildingNumber = overrideBuildingNumber || canonicalBuildingNumber;
  const street = overrideStreet
    || [canonicalStreet, streetLine2].filter(Boolean).join(" ");
  const city = overrideCity || normalizeWdoWhitespace(source.city);
  const zipCode = overrideZipCode || normalizeWdoWhitespace(source.zipCode);
  const issues: WdoValidationIssue[] = [];

  if (!canonicalMatch && !overrideBuildingNumber) {
    issues.push({
      field: "buildingNumber",
      code: "ambiguous_property_address",
      message: "Confirm the property building number and WDO street representation.",
      href: activityHref,
    });
  }

  return { buildingNumber, street, city, zipCode, issues };
}
