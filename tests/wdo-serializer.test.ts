import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { normalizeWdoAddress } from "../lib/wdo/california/address";
import {
  CALIFORNIA_WDO_ACTIVITY_CODES,
  isCaliforniaWdoActivityCode,
} from "../lib/wdo/california/activity-codes";
import {
  addBusinessDays,
  businessDaysBetween,
  getCaliforniaWdoDeadline,
} from "../lib/wdo/california/deadlines";
import { mapCaliforniaWdoActivity } from "../lib/wdo/california/mapper";
import {
  californiaWdoTxtBytes,
  californiaWdoTxtChecksum,
  serializeCaliforniaWdoActivities,
  serializeCaliforniaWdoRecord,
} from "../lib/wdo/california/txt-serializer";
import type { CaliforniaWdoActivityExportRecord } from "../lib/wdo/california/types";
import { CaliforniaWdoValidationError, validateCaliforniaWdoRecord } from "../lib/wdo/california/validator";

const originalRecord: CaliforniaWdoActivityExportRecord = {
  companyName: "Example Pest Control",
  registrationNumber: "PR1234",
  activityDate: "08/01/2026",
  buildingNumber: "123",
  street: "Main Street",
  city: "Sacramento",
  zipCode: "95814",
  inspectorLicenseNumber: "FR12345",
  activityCode: 1,
};

const completionRecord: CaliforniaWdoActivityExportRecord = {
  companyName: "Example Pest Control",
  registrationNumber: "PR1234",
  activityDate: "08/02/2026",
  buildingNumber: "45B",
  street: "Oak Avenue Unit A",
  city: "Anaheim",
  zipCode: "92801",
  inspectorLicenseNumber: "OPR4567",
  activityCode: 5,
};

test("golden TermiteKiosk-compatible fixture is byte-for-byte deterministic", async () => {
  const fixture = await readFile(new URL("./fixtures/california-wdo-golden.TXT", import.meta.url));
  const generated = californiaWdoTxtBytes([originalRecord, completionRecord]);
  assert.deepEqual(generated, fixture);
  assert.equal(californiaWdoTxtChecksum([originalRecord, completionRecord]), createHash("sha256").update(fixture).digest("hex"));
  assert.equal(californiaWdoTxtChecksum([originalRecord, completionRecord]), californiaWdoTxtChecksum([originalRecord, completionRecord]));
});

test("serializer writes the exact 206-character field layout", () => {
  const line = serializeCaliforniaWdoRecord(originalRecord);
  assert.equal(line.length, 206);
  assert.equal(line.slice(0, 50).trimEnd(), "Example Pest Control");
  assert.equal(line.slice(50, 70).trimEnd(), "PR1234");
  assert.equal(line.slice(70, 80), "08/01/2026");
  assert.equal(line.slice(80, 86).trimEnd(), "123");
  assert.equal(line.slice(86, 136).trimEnd(), "Main Street");
  assert.equal(line.slice(136, 186).trimEnd(), "Sacramento");
  assert.equal(line.slice(186, 195).trimEnd(), "95814");
  assert.equal(line.slice(195, 205).trimEnd(), "FR12345");
  assert.equal(line.slice(205, 206), "1");
  assert.equal(line.includes("\t"), false);
  assert.equal(line.includes(","), false);
});

test("multiple records use CRLF with no header, trailer, or blank record", () => {
  const output = serializeCaliforniaWdoActivities([originalRecord, completionRecord]);
  assert.equal(output, `${serializeCaliforniaWdoRecord(originalRecord)}\r\n${serializeCaliforniaWdoRecord(completionRecord)}\r\n`);
  assert.equal(output.split("\r\n").length, 3);
  assert.equal(output.split("\r\n").at(-1), "");
});

test("over-width, missing, unsupported, and invalid values block serialization", () => {
  assert.throws(
    () => serializeCaliforniaWdoRecord({ ...originalRecord, street: "X".repeat(51) }),
    (error) => error instanceof CaliforniaWdoValidationError
      && error.issues.some((issue) => issue.code === "street_too_long"),
  );
  assert.throws(
    () => serializeCaliforniaWdoRecord({ ...originalRecord, companyName: "" }),
    CaliforniaWdoValidationError,
  );
  assert.throws(
    () => serializeCaliforniaWdoRecord({ ...originalRecord, city: "San José" }),
    (error) => error instanceof CaliforniaWdoValidationError
      && error.issues.some((issue) => issue.code === "city_unsupported_characters"),
  );
  assert.throws(
    () => serializeCaliforniaWdoRecord({ ...originalRecord, zipCode: "92801-1234" }),
    CaliforniaWdoValidationError,
  );
  assert.throws(
    () => serializeCaliforniaWdoRecord({ ...originalRecord, activityDate: "02/30/2026" }),
    (error) => error instanceof CaliforniaWdoValidationError
      && error.issues.some((issue) => issue.code === "invalid_activity_date"),
  );
  assert.equal(validateCaliforniaWdoRecord({ ...originalRecord, activityCode: 0 as 1 }).some((issue) => issue.code === "invalid_activity_code"), true);
});

test("address normalization safely splits explicit building numbers and composes unit text", () => {
  assert.deepEqual(normalizeWdoAddress({
    streetLine1: " 102   Calle Patricia ",
    streetLine2: "Unit A",
    city: "Anaheim",
    zipCode: "92801",
  }), {
    buildingNumber: "102",
    street: "Calle Patricia Unit A",
    city: "Anaheim",
    zipCode: "92801",
    issues: [],
  });
  const ambiguous = normalizeWdoAddress({
    streetLine1: "Calle Patricia",
    streetLine2: null,
    city: "Anaheim",
    zipCode: "92801",
  });
  assert.equal(ambiguous.issues.some((issue) => issue.code === "ambiguous_property_address"), true);
  const resolved = normalizeWdoAddress({
    streetLine1: "Calle Patricia",
    streetLine2: null,
    city: "Anaheim",
    zipCode: "92801",
    overrideBuildingNumber: "102",
  });
  assert.equal(resolved.issues.length, 0);
  assert.equal(resolved.street, "Calle Patricia");
});

test("mapper never fabricates missing regulatory values and blocks unverified branches", () => {
  const mapped = mapCaliforniaWdoActivity({
    activityId: "activity-1",
    activityDate: null,
    activityCode: null,
    branchId: "branch-1",
    branchName: "Example Branch",
    companyName: null,
    registrationNumber: null,
    inspectorLicenseNumber: null,
    inspectorName: "Jane Inspector",
    address: { streetLine1: "Main Street", streetLine2: null, city: "", zipCode: "" },
  });
  assert.equal(mapped.record.companyName, "");
  assert.equal(mapped.record.registrationNumber, "");
  assert.equal(mapped.record.inspectorLicenseNumber, "");
  assert.equal(mapped.issues.some((issue) => issue.code === "branch_serialization_unverified"), true);
  assert.equal(mapped.issues.some((issue) => issue.message.includes("Jane Inspector")), true);
});

test("official activity code configuration is centralized and complete", () => {
  assert.equal(Object.keys(CALIFORNIA_WDO_ACTIVITY_CODES).length, 7);
  assert.equal(CALIFORNIA_WDO_ACTIVITY_CODES[5].label, "Notice / Work Completion");
  assert.equal(CALIFORNIA_WDO_ACTIVITY_CODES[7].label, "Separated Report");
  assert.equal(isCaliforniaWdoActivityCode(1), true);
  assert.equal(isCaliforniaWdoActivityCode(8), false);
});

test("filing deadline excludes weekends and remains informational when overdue", () => {
  assert.equal(addBusinessDays("2026-08-07", 1), "2026-08-10");
  assert.equal(addBusinessDays("2026-08-07", 10), "2026-08-21");
  assert.equal(businessDaysBetween("2026-08-21", "2026-08-24"), 1);
  assert.deepEqual(getCaliforniaWdoDeadline("2026-08-07", "2026-08-21"), {
    dueDate: "2026-08-21",
    businessDaysRemaining: 0,
    tone: "urgent",
    label: "Due today",
  });
  assert.equal(getCaliforniaWdoDeadline("2026-08-07", "2026-08-25")?.label, "Overdue by 2 business days");
});
