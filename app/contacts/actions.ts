"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const validRoles = new Set([
  "ordered_by",
  "property_owner",
  "report_recipient",
  "party_of_interest",
  "signer",
]);

export type JobPartyMutationResult =
  | { ok: true; partyId?: string }
  | { ok: false; message: string };

export type AssignContactInput = {
  organizationId: string;
  jobId: string;
  contactId: string;
  role: string;
  isPrimary: boolean;
  receiveReport: boolean;
};

export type RemoveJobPartyInput = {
  organizationId: string;
  jobId: string;
  partyId: string;
};

function clean(formData: FormData, name: string) {
  return String(formData.get(name) ?? "").trim();
}

function errorUrl(path: string, message: string) {
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}error=${encodeURIComponent(message)}`;
}

export async function createContact(formData: FormData) {
  const organizationId = clean(formData, "organizationId");
  const jobId = clean(formData, "jobId");
  const role = clean(formData, "role");
  const returnTo = clean(formData, "returnTo") || "/contacts";
  const firstName = clean(formData, "firstName");
  const lastName = clean(formData, "lastName");

  if (!organizationId || !firstName || !lastName) {
    redirect(errorUrl(returnTo, "First and last name are required."));
  }

  const supabase = await createClient();
  const { data: contactId, error } = await supabase.rpc("create_contact", {
    target_organization_id: organizationId,
    contact_first_name: firstName,
    contact_last_name: lastName,
    contact_email: clean(formData, "email"),
    contact_secondary_email: clean(formData, "secondaryEmail"),
    contact_mobile_phone: clean(formData, "mobilePhone"),
    contact_home_phone: clean(formData, "homePhone"),
    contact_job_title: clean(formData, "jobTitle"),
    contact_company_name: clean(formData, "companyName"),
    contact_notes: clean(formData, "notes"),
  });

  if (error || !contactId) {
    redirect(errorUrl(returnTo, error?.message ?? "Unable to create contact."));
  }

  if (jobId && validRoles.has(role)) {
    const { error: assignmentError } = await supabase.rpc("assign_contact_to_job", {
      target_organization_id: organizationId,
      target_job_id: jobId,
      target_contact_id: contactId,
      party_role: role,
      make_primary: formData.get("isPrimary") === "on",
      receive_report: formData.get("receiveReport") === "on",
    });

    if (assignmentError) {
      redirect(errorUrl(returnTo, assignmentError.message));
    }
  }

  revalidatePath("/contacts");
  if (jobId) {
    revalidatePath(`/jobs/${jobId}`);
    revalidatePath(`/jobs/${jobId}/contacts`);
  }
  redirect(`${returnTo}${returnTo.includes("?") ? "&" : "?"}saved=1`);
}

export async function assignContactToJob(
  input: AssignContactInput,
): Promise<JobPartyMutationResult> {
  if (
    !input.organizationId ||
    !input.jobId ||
    !input.contactId ||
    !validRoles.has(input.role)
  ) {
    return { ok: false, message: "Choose a contact and valid role." };
  }

  const supabase = await createClient();
  const { data: partyId, error } = await supabase.rpc("assign_contact_to_job", {
    target_organization_id: input.organizationId,
    target_job_id: input.jobId,
    target_contact_id: input.contactId,
    party_role: input.role,
    make_primary: input.isPrimary,
    receive_report: input.receiveReport,
  });

  if (error) {
    return { ok: false, message: error.message };
  }

  revalidatePath(`/jobs/${input.jobId}`);
  return { ok: true, partyId: partyId ?? undefined };
}

export async function removeJobParty(
  input: RemoveJobPartyInput,
): Promise<JobPartyMutationResult> {
  if (!input.organizationId || !input.jobId || !input.partyId) {
    return { ok: false, message: "Unable to identify this contact assignment." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("remove_job_party", {
    target_organization_id: input.organizationId,
    target_party_id: input.partyId,
  });

  if (error) {
    return { ok: false, message: error.message };
  }

  revalidatePath(`/jobs/${input.jobId}`);
  return { ok: true };
}
