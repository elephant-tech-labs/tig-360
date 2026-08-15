"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getCurrentContext } from "@/lib/current-organization";
import { validateCaliforniaWdoInspectorLicense } from "@/lib/wdo/california/validator";

function clean(formData: FormData, name: string) {
  return String(formData.get(name) ?? "").trim();
}

function inspectorUrl(message: string, kind: "saved" | "error" = "saved") {
  return `/team/inspectors?${kind}=${encodeURIComponent(message)}`;
}

async function uploadSignature(
  organizationId: string,
  inspectorId: string,
  signature: FormDataEntryValue | null,
) {
  if (!(signature instanceof File) || signature.size === 0) return null;
  if (!["image/png", "image/jpeg", "image/webp"].includes(signature.type)) {
    throw new Error("Signature must be a PNG, JPEG, or WebP image.");
  }
  if (signature.size > 5 * 1024 * 1024) {
    throw new Error("Signature image must be 5 MB or smaller.");
  }

  const extension = signature.name.split(".").pop()?.toLowerCase() || "png";
  const path = `${organizationId}/${inspectorId}/signature-${Date.now()}.${extension}`;
  const supabase = await createClient();
  const { error } = await supabase.storage
    .from("inspector-signatures")
    .upload(path, signature, { contentType: signature.type, upsert: false });
  if (error) throw new Error(error.message);
  return { path, filename: signature.name, contentType: signature.type };
}

export async function createInspector(formData: FormData) {
  const organizationId = clean(formData, "organizationId");
  const fullName = clean(formData, "fullName");
  const email = clean(formData, "email");
  const licenseNumber = clean(formData, "licenseNumber");
  if (!organizationId || !fullName) {
    redirect(inspectorUrl("Inspector name is required.", "error"));
  }
  const licenseIssue = licenseNumber
    ? validateCaliforniaWdoInspectorLicense(licenseNumber)
    : null;
  if (licenseIssue) redirect(inspectorUrl(licenseIssue, "error"));

  const supabase = await createClient();
  const { data: inspectorId, error } = await supabase.rpc("create_inspector", {
    target_organization_id: organizationId,
    inspector_full_name: fullName,
    inspector_email: email || null,
    inspector_phone: clean(formData, "phone") || null,
    inspector_license_number: licenseNumber || null,
    inspector_license_expires_on: clean(formData, "licenseExpiresOn") || null,
    inspector_is_active: true,
  });

  if (error || !inspectorId) {
    redirect(inspectorUrl(error?.message ?? "Unable to create inspector.", "error"));
  }

  if (formData.get("allowLogin") === "on") {
    if (!email) redirect(inspectorUrl("Inspector created. Add an email before inviting login.", "error"));
    try {
      await sendInvitation({
        organizationId,
        email,
        role: "inspector",
        inspectorId,
      });
    } catch (inviteError) {
      redirect(inspectorUrl(
        `Inspector created, but invitation failed: ${
          inviteError instanceof Error ? inviteError.message : "Unknown error"
        }`,
        "error",
      ));
    }
  }

  revalidatePath("/team/inspectors");
  redirect(inspectorUrl("Inspector created."));
}

export async function updateInspector(formData: FormData) {
  const organizationId = clean(formData, "organizationId");
  const inspectorId = clean(formData, "inspectorId");
  const licenseNumber = clean(formData, "licenseNumber");
  const licenseIssue = licenseNumber
    ? validateCaliforniaWdoInspectorLicense(licenseNumber)
    : null;
  if (licenseIssue) redirect(inspectorUrl(licenseIssue, "error"));
  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("inspectors")
    .select("signature_path")
    .eq("organization_id", organizationId)
    .eq("id", inspectorId)
    .single();

  let uploaded: Awaited<ReturnType<typeof uploadSignature>> = null;
  try {
    uploaded = await uploadSignature(organizationId, inspectorId, formData.get("signature"));
  } catch (error) {
    redirect(inspectorUrl(error instanceof Error ? error.message : "Signature upload failed.", "error"));
  }

  const { error } = await supabase.rpc("update_inspector", {
    target_organization_id: organizationId,
    target_inspector_id: inspectorId,
    inspector_full_name: clean(formData, "fullName"),
    inspector_email: clean(formData, "email") || null,
    inspector_phone: clean(formData, "phone") || null,
    inspector_license_number: licenseNumber || null,
    inspector_license_expires_on: clean(formData, "licenseExpiresOn") || null,
    inspector_is_active: formData.get("isActive") === "on",
    inspector_signature_path: uploaded?.path ?? null,
    inspector_signature_filename: uploaded?.filename ?? null,
    inspector_signature_content_type: uploaded?.contentType ?? null,
  });

  if (error) {
    if (uploaded) await supabase.storage.from("inspector-signatures").remove([uploaded.path]);
    redirect(inspectorUrl(error.message, "error"));
  }
  if (uploaded && existing?.signature_path) {
    await supabase.storage.from("inspector-signatures").remove([existing.signature_path]);
  }

  revalidatePath("/team/inspectors");
  revalidatePath("/jobs/new");
  redirect(inspectorUrl("Inspector updated."));
}

type InvitationInput = {
  organizationId: string;
  email: string;
  role: "administrator" | "manager" | "office_coordinator" | "inspector" | "treatment_coordinator";
  inspectorId?: string | null;
};

async function sendInvitation(input: InvitationInput) {
  const { supabase, organization, membership } = await getCurrentContext();
  if (membership.role !== "administrator" || organization.id !== input.organizationId) {
    throw new Error("Administrator access required.");
  }

  const { data: invitationId, error } = await supabase.rpc("create_organization_invitation", {
    target_organization_id: input.organizationId,
    invitation_email: input.email,
    invitation_role: input.role,
    target_inspector_id: input.inspectorId || null,
  });
  if (error || !invitationId) throw new Error(error?.message ?? "Unable to create invitation.");

  try {
    const admin = createAdminClient();
    const redirectTo = `${process.env.NEXT_PUBLIC_APP_URL}/auth/accept`;
    const { error: inviteError } = await admin.auth.admin.inviteUserByEmail(input.email, {
      redirectTo,
      data: {
        tig360_invitation_id: invitationId,
        full_name: input.role === "inspector" ? undefined : input.email.split("@")[0],
      },
    });
    if (inviteError) {
      const existingAccount = /already|registered|exists/i.test(inviteError.message);
      if (!existingAccount) throw inviteError;

      const { error: magicLinkError } = await admin.auth.signInWithOtp({
        email: input.email,
        options: {
          emailRedirectTo: redirectTo,
          shouldCreateUser: false,
        },
      });
      if (magicLinkError) throw magicLinkError;
    }

    const { error: sentError } = await supabase.rpc("mark_organization_invitation_sent", {
      target_organization_id: input.organizationId,
      target_invitation_id: invitationId,
    });
    if (sentError) throw sentError;
  } catch (error) {
    await supabase
      .from("organization_invitations")
      .update({ status: "failed" })
      .eq("id", invitationId);
    throw error;
  }
}

export async function inviteTeamMember(formData: FormData) {
  const organizationId = clean(formData, "organizationId");
  const email = clean(formData, "inviteEmail").toLowerCase();
  const role = clean(formData, "inviteRole") as InvitationInput["role"];
  const inspectorId = clean(formData, "inspectorId") || null;

  try {
    await sendInvitation({ organizationId, email, role, inspectorId });
  } catch (error) {
    redirect(inspectorUrl(error instanceof Error ? error.message : "Unable to send invitation.", "error"));
  }

  revalidatePath("/team/inspectors");
  redirect(inspectorUrl(`Invitation sent to ${email}.`));
}

export async function resendTeamInvitation(formData: FormData) {
  const organizationId = clean(formData, "organizationId");
  const email = clean(formData, "inviteEmail").toLowerCase();
  const role = clean(formData, "inviteRole") as InvitationInput["role"];
  const inspectorId = clean(formData, "inspectorId") || null;

  try {
    await sendInvitation({ organizationId, email, role, inspectorId });
  } catch (error) {
    redirect(inspectorUrl(error instanceof Error ? error.message : "Unable to resend invitation.", "error"));
  }

  revalidatePath("/team/inspectors");
  redirect(inspectorUrl(`A fresh invitation was sent to ${email}.`));
}

export async function revokeTeamInvitation(formData: FormData) {
  const organizationId = clean(formData, "organizationId");
  const invitationId = clean(formData, "invitationId");
  const { supabase, organization, membership } = await getCurrentContext();
  if (membership.role !== "administrator" || organization.id !== organizationId) {
    redirect(inspectorUrl("Administrator access required.", "error"));
  }

  const { error } = await supabase.rpc("revoke_organization_invitation", {
    target_organization_id: organizationId,
    target_invitation_id: invitationId,
  });
  if (error) redirect(inspectorUrl(error.message, "error"));

  revalidatePath("/team/inspectors");
  redirect(inspectorUrl("Invitation revoked."));
}

export async function updateTeamMemberAccess(formData: FormData) {
  const organizationId = clean(formData, "organizationId");
  const userId = clean(formData, "userId");
  const role = clean(formData, "role") as InvitationInput["role"];
  const status = clean(formData, "status") as "active" | "suspended";
  const { supabase, organization, membership } = await getCurrentContext();

  if (membership.role !== "administrator" || organization.id !== organizationId) {
    redirect(inspectorUrl("Administrator access required.", "error"));
  }

  const { error } = await supabase.rpc("update_organization_member_access", {
    target_organization_id: organizationId,
    target_user_id: userId,
    target_role: role,
    target_status: status,
  });
  if (error) redirect(inspectorUrl(error.message, "error"));

  revalidatePath("/team/inspectors");
  redirect(inspectorUrl("Team access updated."));
}

export async function removeInspectorSignature(formData: FormData) {
  const organizationId = clean(formData, "organizationId");
  const inspectorId = clean(formData, "inspectorId");
  const supabase = await createClient();
  const { data: inspector, error } = await supabase
    .from("inspectors")
    .select("signature_path")
    .eq("organization_id", organizationId)
    .eq("id", inspectorId)
    .single();

  if (error || !inspector?.signature_path) {
    redirect(inspectorUrl(error?.message ?? "No signature is stored.", "error"));
  }
  const { error: removeError } = await supabase.storage
    .from("inspector-signatures")
    .remove([inspector.signature_path]);
  if (removeError) redirect(inspectorUrl(removeError.message, "error"));

  await supabase
    .from("inspectors")
    .update({ signature_path: null, signature_filename: null, signature_content_type: null })
    .eq("organization_id", organizationId)
    .eq("id", inspectorId);

  revalidatePath("/team/inspectors");
  redirect(inspectorUrl("Inspector signature removed."));
}
