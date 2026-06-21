export const findingAreas = [
  { code: 1, label: "Substructure Area" },
  { code: 2, label: "Stall Shower" },
  { code: 3, label: "Foundations" },
  { code: 4, label: "Porches" },
  { code: 5, label: "Ventilation" },
  { code: 6, label: "Abutments" },
  { code: 7, label: "Attic" },
  { code: 8, label: "Garages" },
  { code: 9, label: "Decks / Patios" },
  { code: 10, label: "Other / Interior" },
  { code: 11, label: "Other / Exterior" },
] as const;

export const findingLetters = ["A", "B", "C", "D", "E", "F", "G", "H"] as const;

export const findingSections = [
  { value: "section_i", label: "Section I", detail: "Active infestation, infection, or resulting damage" },
  { value: "section_ii", label: "Section II", detail: "Conditions likely to lead to infestation or infection" },
  { value: "further_inspection", label: "Further inspection", detail: "Area or condition requires additional inspection" },
  { value: "other", label: "Other", detail: "Reportable item outside Sections I and II" },
] as const;

export function sectionLabel(value: string) {
  return findingSections.find((section) => section.value === value)?.label ?? "Note";
}
