"use client";

import { useLinkStatus } from "next/link";

// Must render inside a <Link>. An <i> so tab styles aimed at "> span" never apply;
// absolutely positioned so it never changes the link's size or centring.
// CSS delays the fade-in so fast navigations never flash it.
export function LinkPendingIndicator() {
  const { pending } = useLinkStatus();
  return <i aria-hidden="true" className="link-pending" data-pending={pending ? "true" : undefined} />;
}
