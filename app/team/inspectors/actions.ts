"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

function clean(formData: FormData, name: string) {
  return String(formData.get(name) ?? "").trim();
}

function inspectorUrl(message: string, kind: "saved" | "error" = "saved") {
  return `/team/inspectors?${kind}=${encodeURIComponent(message)}`;
}

export async function saveInspectorProfile(formData: FormData) {
  const organizationId = clean(formData, "organizationId");
  const userId = clean(formData, "userId");
  const licenseNumber = clean(formData, "licenseNumber");
  const licenseExpiresOn = clean(formData, "licenseExpiresOn");
  const isActive = formData.get("isActive") === "on";
  const signature = formData.get("signature");

  if (!organizationId || !userId) {
    redirect(inspectorUrl("Unable to identify this team member.", "error"));
  }

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("inspector_profiles")
    .select("signature_path")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .maybeSingle();

  let signaturePath: string | null = null;
  let signatureFilename: string | null = null;
  let signatureContentType: string | null = null;

  if (signature instanceof File && signature.size > 0) {
    if (!["image/png", "image/jpeg", "image/webp"].includes(signature.type)) {
      redirect(inspectorUrl("Signature must be a PNG, JPEG, or WebP image.", "error"));
    }
    if (signature.size > 5 * 1024 * 1024) {
      redirect(inspectorUrl("Signature image must be 5 MB or smaller.", "error"));
    }

    const extension = signature.name.split(".").pop()?.toLowerCase() || "png";
    signaturePath = `${organizationId}/${userId}/signature-${Date.now()}.${extension}`;
    signatureFilename = signature.name;
    signatureContentType = signature.type;

    const { error: uploadError } = await supabase.storage
      .from("inspector-signatures")
      .upload(signaturePath, signature, {
        contentType: signature.type,
        upsert: false,
      });

    if (uploadError) {
      redirect(inspectorUrl(uploadError.message, "error"));
    }
  }

  const { error } = await supabase.rpc("save_inspector_profile", {
    target_organization_id: organizationId,
    target_user_id: userId,
    inspector_license_number: licenseNumber || null,
    inspector_license_expires_on: licenseExpiresOn || null,
    inspector_is_active: isActive,
    inspector_signature_path: signaturePath,
    inspector_signature_filename: signatureFilename,
    inspector_signature_content_type: signatureContentType,
  });

  if (error) {
    if (signaturePath) {
      await supabase.storage.from("inspector-signatures").remove([signaturePath]);
    }
    redirect(inspectorUrl(error.message, "error"));
  }

  if (signaturePath && existing?.signature_path) {
    await supabase.storage
      .from("inspector-signatures")
      .remove([existing.signature_path]);
  }

  revalidatePath("/team/inspectors");
  revalidatePath("/jobs/new");
  redirect(inspectorUrl("Inspector profile saved."));
}

export async function removeInspectorSignature(formData: FormData) {
  const organizationId = clean(formData, "organizationId");
  const userId = clean(formData, "userId");
  const supabase = await createClient();
  const { data: inspector, error: fetchError } = await supabase
    .from("inspector_profiles")
    .select("signature_path")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .single();

  if (fetchError || !inspector?.signature_path) {
    redirect(inspectorUrl(fetchError?.message ?? "No signature is stored.", "error"));
  }

  const { error: removeError } = await supabase.storage
    .from("inspector-signatures")
    .remove([inspector.signature_path]);
  if (removeError) redirect(inspectorUrl(removeError.message, "error"));

  const { error } = await supabase
    .from("inspector_profiles")
    .update({
      signature_path: null,
      signature_filename: null,
      signature_content_type: null,
    })
    .eq("organization_id", organizationId)
    .eq("user_id", userId);

  if (error) redirect(inspectorUrl(error.message, "error"));
  revalidatePath("/team/inspectors");
  redirect(inspectorUrl("Inspector signature removed."));
}
