import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { normalizeWdoAddress } from "../lib/wdo/california/address";
import {
  getCaliforniaWdoReadinessForJob,
  groupCaliforniaWdoIssuesForOffice,
} from "../lib/wdo/california/readiness";
import { validateCaliforniaWdoInspectorLicense } from "../lib/wdo/california/validator";

const validInput = {
  jobId: "job-1",
  filingRequirement: "required" as const,
  reportType: "complete",
  inspectionDate: "2026-08-13T17:00:00.000Z",
  companyName: "Trident Inspection Group",
  registrationNumber: "PR8662",
  inspectorId: "inspector-1",
  inspectorName: "Gurinder Dhillon",
  inspectorLicenseNumber: "FR12345",
  address: {
    buildingNumber: "619",
    streetName: "Main Street",
    unitOrSuite: "Suite 2",
    streetLine1: "619 Main Street",
    streetLine2: "Suite 2",
    city: "Anaheim",
    region: "CA",
    zipCode: "92801",
  },
};

test("Phase 0 readiness accepts a complete principal-office job", () => {
  const result = getCaliforniaWdoReadinessForJob(validInput);
  assert.equal(result.required, true);
  assert.equal(result.ready, true);
  assert.equal(result.issues.length, 0);
});

test("an audited Not required job is outside report-readiness blocking", () => {
  const result = getCaliforniaWdoReadinessForJob({
    ...validInput,
    filingRequirement: "not_required",
    inspectionDate: null,
    inspectorId: null,
  });
  assert.equal(result.required, false);
  assert.equal(result.ready, true);
  assert.equal(result.issues.length, 0);
});

for (const [reportType, expectedCode] of [
  ["complete", 1],
  ["limited", 2],
  ["supplemental", 3],
  ["reinspection", 4],
] as const) {
  test(`${reportType} maps to supported inspection activity code ${expectedCode}`, () => {
    const result = getCaliforniaWdoReadinessForJob({ ...validInput, reportType });
    assert.equal(result.issues.some((issue) => issue.field === "activityCode"), false);
  });
}

for (const [name, input, field] of [
  ["missing activity date", { inspectionDate: null }, "activityDate"],
  ["missing inspector", { inspectorId: null }, "inspectorLicenseNumber"],
  ["missing inspector license", { inspectorLicenseNumber: null }, "inspectorLicenseNumber"],
  ["missing company legal name", { companyName: null }, "companyName"],
  ["missing principal registration", { registrationNumber: null }, "registrationNumber"],
  ["non-California property", { address: { ...validInput.address, region: "WA" } }, "region"],
] as const) {
  test(`${name} blocks WDO readiness`, () => {
    const result = getCaliforniaWdoReadinessForJob({ ...validInput, ...input });
    assert.equal(result.ready, false);
    assert.equal(result.issues.some((issue) => issue.field === field), true);
  });
}

for (const license of ["12345", "FR123", "OPR4567", "A1-B2"]) {
  test(`SPCB-issued license ${license} is accepted without prefix guessing`, () => {
    assert.equal(validateCaliforniaWdoInspectorLicense(license), null);
  });
}

for (const [license, message] of [
  ["Gurinder", "at least one number"],
  ["FR 123", "cannot contain spaces"],
  ["FR123456789", "exceeds 10"],
  ["FR12é", "unsupported"],
  ["", "required"],
] as const) {
  test(`invalid inspector license '${license || "empty"}' is rejected`, () => {
    assert.match(validateCaliforniaWdoInspectorLicense(license) ?? "", new RegExp(message));
  });
}

test("structured address fields take precedence over the legacy combined line", () => {
  const result = normalizeWdoAddress({
    ...validInput.address,
    buildingNumber: "45B",
    streetName: "Oak Avenue",
    unitOrSuite: "Unit A",
    streetLine1: "Unparseable legacy value",
  });
  assert.equal(result.buildingNumber, "45B");
  assert.equal(result.street, "Oak Avenue Unit A");
  assert.equal(result.issues.length, 0);
});

for (const [name, address, code] of [
  ["building width", { buildingNumber: "1234567" }, "buildingNumber_too_long"],
  ["street width", { streetName: "X".repeat(51), unitOrSuite: null }, "street_too_long"],
  ["city width", { city: "X".repeat(51) }, "city_too_long"],
  ["ZIP syntax", { zipCode: "928011" }, "invalid_zip_code"],
] as const) {
  test(`${name} is enforced through the shared TXT validator`, () => {
    const result = getCaliforniaWdoReadinessForJob({
      ...validInput,
      address: { ...validInput.address, ...address },
    });
    assert.equal(result.issues.some((issue) => issue.code === code), true);
  });
}

test("5- and 9-digit ZIP codes are both accepted", () => {
  for (const zipCode of ["92801", "928011234"]) {
    const result = getCaliforniaWdoReadinessForJob({
      ...validInput,
      address: { ...validInput.address, zipCode },
    });
    assert.equal(result.issues.some((issue) => issue.field === "zipCode"), false);
  }
});

test("unverified branch serialization remains blocked", () => {
  const result = getCaliforniaWdoReadinessForJob({
    ...validInput,
    branchId: "branch-1",
    branchName: "Branch Office",
  });
  assert.equal(result.issues.some((issue) => issue.code === "branch_serialization_unverified"), true);
});

test("office queue groups multiple address failures into one actionable item", () => {
  const grouped = groupCaliforniaWdoIssuesForOffice([
    { field: "buildingNumber", code: "missing", message: "Missing" },
    { field: "street", code: "long", message: "Long" },
    { field: "activityDate", code: "date", message: "Date" },
  ]);
  assert.equal(grouped.length, 2);
  assert.equal(grouped[0]?.code, "property_address_needs_confirmation");
});

test("production migration is additive, idempotent, audited, and history preserving", async () => {
  const sql = await readFile(new URL(
    "../supabase/migrations/20260813110000_wdo_phase_0_data_integrity.sql",
    import.meta.url,
  ), "utf8");
  assert.match(sql, /wdo_filing_requirement text not null default 'required'/);
  assert.match(sql, /add column if not exists/);
  assert.match(sql, /wdo_exclusion_reason/);
  assert.match(sql, /building_number text/);
  assert.match(sql, /street_name text/);
  assert.match(sql, /unit_or_suite text/);
  assert.match(sql, /regexp_match\(trim\(street_line_1\)/);
  assert.match(sql, /sync_wdo_inspection_activity_for_job/);
  assert.match(sql, /perform public\.sync_wdo_inspection_activity_for_job/g);
  assert.match(sql, /on conflict \(organization_id, source_key\) do update/);
  assert.match(sql, /status = 'active', void_reason = null/);
  assert.match(sql, /set status = 'voided'/);
  assert.match(sql, /prior_export_count > 0/);
  assert.match(sql, /array\['administrator', 'manager'\]/);
  assert.match(sql, /wdo_activity_voided_with_history/);
  assert.match(sql, /create_california_inspection_job/);
  assert.match(sql, /trim\(property_city\), 'CA'/);
  assert.match(sql, /inspectors_wdo_license_format/);
  assert.doesNotMatch(sql, /delete from public\.wdo_(activities|export_batches|export_batch_items)/);
  assert.doesNotMatch(sql, /206-character serializer[\s\S]*create or replace function public\.serialize/i);
});
