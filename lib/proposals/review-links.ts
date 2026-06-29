import { createHash, randomBytes } from "node:crypto";

export function createReviewToken() {
  return randomBytes(32).toString("base64url");
}

export function hashReviewToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function appOrigin() {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`.replace(/\/$/, "");
  return "http://localhost:3000";
}

export function customerReviewUrl(token: string) {
  return `${appOrigin()}/customer/proposals/${token}`;
}
