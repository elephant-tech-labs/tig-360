"use client";

import Link from "next/link";
import { AlertTriangle, RotateCcw } from "lucide-react";

// Keeps the shell usable when a page fails to load and lets the user retry,
// which re-fetches the page from the server.
export default function WorkspaceError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <div className="form-page">
      <div className="form-alert error" role="alert">
        <AlertTriangle size={17} /> Something went wrong while loading this page.
      </div>
      <p className="route-error-help">
        Check your connection and try again. If it keeps happening, send this reference to an administrator:{" "}
        <code>{error.digest ?? "unavailable"}</code>
      </p>
      <div className="route-error-actions">
        <button className="primary-button" onClick={() => unstable_retry()} type="button">
          <RotateCcw size={16} /> Try again
        </button>
        <Link className="secondary-button" href="/jobs">Back to jobs</Link>
      </div>
    </div>
  );
}
