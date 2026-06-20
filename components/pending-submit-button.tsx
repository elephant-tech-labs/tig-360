"use client";

import { ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { LoaderCircle } from "lucide-react";

type PendingSubmitButtonProps = {
  children: ReactNode;
  pendingLabel: string;
  className: string;
};

export function PendingSubmitButton({
  children,
  pendingLabel,
  className,
}: PendingSubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <button
      aria-disabled={pending}
      className={className}
      data-pending={pending ? "true" : "false"}
      disabled={pending}
      type="submit"
    >
      {pending ? (
        <>
          <LoaderCircle className="button-spinner" size={16} />
          {pendingLabel}
        </>
      ) : (
        children
      )}
    </button>
  );
}
