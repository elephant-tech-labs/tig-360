import { createHash } from "node:crypto";
import {
  CALIFORNIA_WDO_FIELD_WIDTHS,
  CALIFORNIA_WDO_LINE_ENDING,
  CALIFORNIA_WDO_RECORD_LENGTH,
} from "./config";
import type { CaliforniaWdoActivityExportRecord } from "./types";
import {
  CaliforniaWdoValidationError,
  validateCaliforniaWdoRecord,
} from "./validator";

function fixed(value: string, width: number) {
  if (value.length > width) {
    throw new Error(`Value exceeds fixed width of ${width} characters.`);
  }
  return value.padEnd(width, " ");
}

export function serializeCaliforniaWdoRecord(
  record: CaliforniaWdoActivityExportRecord,
) {
  const issues = validateCaliforniaWdoRecord(record);
  if (issues.length) throw new CaliforniaWdoValidationError(issues);

  const line = [
    fixed(record.companyName, CALIFORNIA_WDO_FIELD_WIDTHS.companyName),
    fixed(record.registrationNumber, CALIFORNIA_WDO_FIELD_WIDTHS.registrationNumber),
    fixed(record.activityDate, CALIFORNIA_WDO_FIELD_WIDTHS.activityDate),
    fixed(record.buildingNumber, CALIFORNIA_WDO_FIELD_WIDTHS.buildingNumber),
    fixed(record.street, CALIFORNIA_WDO_FIELD_WIDTHS.street),
    fixed(record.city, CALIFORNIA_WDO_FIELD_WIDTHS.city),
    fixed(record.zipCode, CALIFORNIA_WDO_FIELD_WIDTHS.zipCode),
    fixed(record.inspectorLicenseNumber, CALIFORNIA_WDO_FIELD_WIDTHS.inspectorLicenseNumber),
    String(record.activityCode),
  ].join("");

  if (line.length !== CALIFORNIA_WDO_RECORD_LENGTH) {
    throw new Error(`California WDO record must be ${CALIFORNIA_WDO_RECORD_LENGTH} characters.`);
  }
  return line;
}

export function serializeCaliforniaWdoActivities(
  records: CaliforniaWdoActivityExportRecord[],
) {
  if (!records.length) throw new Error("Select at least one WDO activity.");
  return `${records.map(serializeCaliforniaWdoRecord).join(CALIFORNIA_WDO_LINE_ENDING)}${CALIFORNIA_WDO_LINE_ENDING}`;
}

export function californiaWdoTxtBytes(records: CaliforniaWdoActivityExportRecord[]) {
  return Buffer.from(serializeCaliforniaWdoActivities(records), "ascii");
}

export function californiaWdoTxtChecksum(records: CaliforniaWdoActivityExportRecord[]) {
  return createHash("sha256").update(californiaWdoTxtBytes(records)).digest("hex");
}

export function californiaWdoFilename(registrationNumber: string, generatedAt = new Date()) {
  const registration = registrationNumber.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  const stamp = generatedAt.toISOString().replace(/[-:]/g, "").slice(0, 13).replace("T", "_");
  return `WDO_${registration}_${stamp}.TXT`;
}
