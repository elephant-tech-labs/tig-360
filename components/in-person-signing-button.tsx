"use client";

import { useState, type MouseEvent } from "react";
import { ExternalLink, LoaderCircle } from "lucide-react";
import { startEmbeddedContractSigning } from "@/app/jobs/[jobId]/send/actions";

function prepareSigningWindow(popup: Window) {
  popup.opener = null;
  popup.document.title = "Opening secure signing";
  popup.document.body.textContent = "Opening secure Zoho Sign session...";
  popup.document.body.style.cssText = [
    "align-items:center",
    "background:#f4f7f5",
    "color:#17352d",
    "display:flex",
    "font-family:Arial,sans-serif",
    "font-size:16px",
    "justify-content:center",
    "margin:0",
    "min-height:100vh",
  ].join(";");
}

export function InPersonSigningButton() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function startSigning(event: MouseEvent<HTMLButtonElement>) {
    const form = event.currentTarget.form;
    if (!form || pending) return;

    setError(null);
    const popup = window.open("", "_blank");
    if (!popup) {
      setError("Allow pop-ups for TIG-360, then try again.");
      return;
    }

    prepareSigningWindow(popup);
    setPending(true);
    try {
      const result = await startEmbeddedContractSigning(new FormData(form));
      if (!result.ok) {
        popup.close();
        setError(result.error);
        return;
      }
      popup.location.replace(result.url);
    } catch (signingError) {
      popup.close();
      setError(signingError instanceof Error ? signingError.message : "Unable to open the signing session.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="in-person-signing-control">
      <button
        aria-disabled={pending}
        className="secondary-button"
        data-pending={pending ? "true" : "false"}
        disabled={pending}
        onClick={startSigning}
        type="button"
      >
        {pending ? (
          <><LoaderCircle className="button-spinner" size={16} /> Opening signing</>
        ) : (
          <><ExternalLink size={16} /> Start in-person signing</>
        )}
      </button>
      {error ? <span aria-live="polite" className="in-person-signing-error" role="alert">{error}</span> : null}
    </div>
  );
}
