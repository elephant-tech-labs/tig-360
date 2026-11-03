import assert from "node:assert/strict";
import test from "node:test";
import { isInvitationExpired } from "../lib/access";
import { formatUsd } from "../lib/format";
import { clean } from "../lib/form";
import { buildProposalSummaryInputHash } from "../lib/proposals/customer-summary";
import { normalizeMoney, normalizeText } from "../lib/proposals/snapshot-hash";

const legacyMoney = (value: number | string | null | undefined) =>
  new Intl.NumberFormat("en-US", { currency: "USD", style: "currency" }).format(Number(value ?? 0));

test("formatUsd matches the previous money() helpers", () => {
  for (const value of [0, 0.5, 1, 12.345, 1234.5, 9999999999.99, -5, "450.10", "", null, undefined]) {
    assert.equal(formatUsd(value), legacyMoney(value), String(value));
  }
  assert.equal(formatUsd(1234.5), "$1,234.50");
  assert.equal(formatUsd(null), "$0.00");
});

test("formatUsd matches the previous findings-workspace currency strings", () => {
  for (const value of [0, 75, 1234.5, 98765.43]) {
    assert.equal(formatUsd(value), value.toLocaleString("en-US", { style: "currency", currency: "USD" }));
  }
});

test("inspection report HTML costs are unchanged for every valid estimated_cost", () => {
  // estimated_cost is numeric(12,2) with a >= 0 check, so only non-negative, 2-decimal values reach the report.
  const legacy = (value: number) => `$${value.toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
  for (const value of [0, 0.01, 0.5, 1, 12.34, 999.99, 1000, 1234.5, 1234567.89, 9999999999.99]) {
    assert.equal(formatUsd(value), legacy(value), String(value));
  }
});

test("clean() trims form values and treats missing fields as empty", () => {
  const form = new FormData();
  form.set("name", "  Jane Doe \n");
  form.set("blank", "   ");
  assert.equal(clean(form, "name"), "Jane Doe");
  assert.equal(clean(form, "blank"), "");
  assert.equal(clean(form, "missing"), "");
});

test("shared proposal normalizers", () => {
  assert.equal(normalizeText("  a \n\t b  "), "a b");
  assert.equal(normalizeText(null), "");
  assert.equal(normalizeMoney(10.999), 11);
  assert.equal(normalizeMoney(12.344), 12.34);
  assert.equal(normalizeMoney(null), 0);
});

test("proposal summary input hash is unchanged (golden value from the pre-refactor code)", () => {
  const hash = buildProposalSummaryInputHash({
    companyName: "  Trident   Inspection ",
    propertyAddress: "1 Main St\nSan Jose",
    reportType: "original",
    total: 1234.567,
    lines: [
      { id: "b", code: " 1A ", section: "section_i", title: "Subterranean  termites", description: null, amount: 450.005 },
      { id: "a", code: "2B", section: "section_ii", title: "Moisture", description: "Fix  leak", amount: 0 },
    ],
  });
  assert.equal(hash, "cfa678f4d07727761b820d78a2151e645d6dbd636129831ca042b0136942a24d");
});

test("isInvitationExpired keeps the previous activation semantics and fails closed", () => {
  const future = new Date(Date.now() + 60_000).toISOString();
  const past = new Date(Date.now() - 60_000).toISOString();
  assert.equal(isInvitationExpired(future), false);
  assert.equal(isInvitationExpired(past), true);
  assert.equal(isInvitationExpired("not a date"), true);
});
