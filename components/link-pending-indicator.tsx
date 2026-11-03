"use client";

import { useLinkStatus } from "next/link";

// Must render inside a <Link>. CSS delays the fade-in so fast navigations never flash it.
export function LinkPendingIndicator() {
  const { pending } = useLinkStatus();
  return <span aria-hidden="true" className="link-pending" data-pending={pending ? "true" : undefined} />;
}
