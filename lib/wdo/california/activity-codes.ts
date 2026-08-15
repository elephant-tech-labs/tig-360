import type { CaliforniaWdoActivityCode } from "./types";

export const CALIFORNIA_WDO_ACTIVITY_CODES = {
  1: { label: "Original Inspection", sourceTypes: ["complete"] },
  2: { label: "Limited Inspection", sourceTypes: ["limited"] },
  3: { label: "Supplemental Inspection", sourceTypes: ["supplemental"] },
  4: { label: "Reinspection", sourceTypes: ["reinspection"] },
  5: { label: "Notice / Work Completion", sourceTypes: [] },
  6: { label: "Corrected Report / Notice", sourceTypes: [] },
  7: { label: "Separated Report", sourceTypes: [] },
} as const satisfies Record<
  CaliforniaWdoActivityCode,
  { label: string; sourceTypes: readonly string[] }
>;

export const REPORT_TYPE_TO_WDO_ACTIVITY_CODE: Record<
  "complete" | "limited" | "supplemental" | "reinspection",
  CaliforniaWdoActivityCode
> = {
  complete: 1,
  limited: 2,
  supplemental: 3,
  reinspection: 4,
};

export function isCaliforniaWdoActivityCode(
  value: number | null | undefined,
): value is CaliforniaWdoActivityCode {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 7;
}

export function californiaWdoActivityLabel(value: number | null | undefined) {
  return isCaliforniaWdoActivityCode(value)
    ? CALIFORNIA_WDO_ACTIVITY_CODES[value].label
    : "Unknown activity";
}
