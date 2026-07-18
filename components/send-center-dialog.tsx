"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Mail, X } from "lucide-react";

type SendCenterDialogProps = {
  children: ReactNode;
  disabledReason?: string | null;
};

export function SendCenterDialog({ children, disabledReason }: SendCenterDialogProps) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <>
      <button
        className="send-option-action"
        disabled={Boolean(disabledReason)}
        onClick={() => setOpen(true)}
        title={disabledReason ?? undefined}
        type="button"
      >
        <Mail size={16} /> Compose custom email
      </button>
      {disabledReason ? <small className="send-option-reason">{disabledReason}</small> : null}

      {open ? (
        <div
          aria-labelledby="custom-delivery-title"
          aria-modal="true"
          className="send-dialog-backdrop"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) setOpen(false);
          }}
          role="dialog"
        >
          <section className="send-dialog">
            <header className="send-dialog-header">
              <div>
                <p className="eyebrow">Alternative delivery</p>
                <h2 id="custom-delivery-title">Compose custom email</h2>
                <p>Choose recipients, attachments, and message content for this delivery.</p>
              </div>
              <button
                aria-label="Close custom email"
                className="icon-button"
                onClick={() => setOpen(false)}
                type="button"
              >
                <X size={19} />
              </button>
            </header>
            <div className="send-dialog-body">{children}</div>
          </section>
        </div>
      ) : null}
    </>
  );
}
