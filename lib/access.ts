export type MembershipRole =
  | "administrator"
  | "manager"
  | "office_coordinator"
  | "inspector"
  | "treatment_coordinator";

export const roleLabels: Record<MembershipRole, string> = {
  administrator: "Administrator",
  manager: "Manager",
  office_coordinator: "Office coordinator",
  inspector: "Inspector",
  treatment_coordinator: "Treatment coordinator",
};

export function canCreateJobs(role: MembershipRole) {
  return role === "administrator" || role === "manager" || role === "office_coordinator";
}

export function canAccessContacts(role: MembershipRole) {
  return role !== "inspector";
}

export function canAccessManagement(role: MembershipRole) {
  return role === "administrator" || role === "manager";
}

export function canAccessWdoCompliance(role: MembershipRole) {
  return role === "administrator" || role === "manager" || role === "office_coordinator";
}

// Fails closed: an unparseable timestamp counts as expired.
export function isInvitationExpired(expiresAt: string) {
  return !(Date.parse(expiresAt) > Date.now());
}
