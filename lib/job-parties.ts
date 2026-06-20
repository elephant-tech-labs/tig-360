export const jobPartyRoles = [
  { value: "ordered_by", label: "Ordered By" },
  { value: "property_owner", label: "Property Owner" },
  { value: "report_recipient", label: "Report Recipient" },
  { value: "party_of_interest", label: "Party of Interest" },
  { value: "signer", label: "Signer" },
] as const;

export function jobPartyRoleLabel(role: string) {
  return jobPartyRoles.find((option) => option.value === role)?.label ?? role;
}
