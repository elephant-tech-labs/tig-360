import { readFile } from "node:fs/promises";
import path from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";

const brandAssetCache = new Map<string, Promise<string>>();

function mimeType(filename: string, fallback = "image/png") {
  const extension = filename.split(".").pop()?.toLowerCase();
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
  if (extension === "webp") return "image/webp";
  if (extension === "svg") return "image/svg+xml";
  return fallback;
}

function toDataUri(bytes: Uint8Array, type: string) {
  return `data:${type};base64,${Buffer.from(bytes).toString("base64")}`;
}

export function bundledBrandAsset(filename: string) {
  const cached = brandAssetCache.get(filename);
  if (cached) return cached;

  const asset = readFile(path.join(process.cwd(), "public", "brand", filename))
    .then((bytes) => toDataUri(bytes, mimeType(filename)));
  brandAssetCache.set(filename, asset);
  return asset;
}

export async function embeddedStorageImage(
  supabase: SupabaseClient,
  bucket: string,
  storagePath: string | null,
) {
  if (!storagePath) return null;
  const { data, error } = await supabase.storage.from(bucket).download(storagePath);
  if (error || !data) return null;

  const bytes = new Uint8Array(await data.arrayBuffer());
  return toDataUri(bytes, data.type || mimeType(storagePath));
}
