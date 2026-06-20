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

export async function assignContactToJob(formData: FormData) {
  const organizationId = clean(formData, "organizationId");
  const jobId = clean(formData, "jobId");
  const contactId = clean(formData, "contactId");
  const role = clean(formData, "role");
  const returnTo = `/jobs/${jobId}/contacts`;

  if (!organizationId || !jobId || !contactId || !validRoles.has(role)) {
    redirect(errorUrl(returnTo, "Choose a contact and valid role."));
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("assign_contact_to_job", {
    target_organization_id: organizationId,
    target_job_id: jobId,
    target_contact_id: contactId,
    party_role: role,
    make_primary: formData.get("isPrimary") === "on",
    receive_report: formData.get("receiveReport") === "on",
  });

  if (error) {
    redirect(errorUrl(returnTo, error.message));
  }

  revalidatePath(`/jobs/${jobId}`);
  revalidatePath(returnTo);
  redirect(`${returnTo}?saved=1`);
}

export async function removeJobParty(formData: FormData) {
  const organizationId = clean(formData, "organizationId");
  const jobId = clean(formData, "jobId");
  const partyId = clean(formData, "partyId");
  const returnTo = `/jobs/${jobId}/contacts`;

  const supabase = await createClient();
  const { error } = await supabase.rpc("remove_job_party", {
    target_organization_id: organizationId,
    target_party_id: partyId,
  });

  if (error) {
    redirect(errorUrl(returnTo, error.message));
  }

  revalidatePath(`/jobs/${jobId}`);
  revalidatePath(returnTo);
  redirect(`${returnTo}?removed=1`);
}
