"use client";

import { ButtonHTMLAttributes, ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { LoaderCircle } from "lucide-react";

type PendingSubmitButtonProps = {
  children: ReactNode;
  pendingLabel: string;
  className: string;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children" | "className" | "type">;

export function PendingSubmitButton({
  children,
  pendingLabel,
  className,
  disabled,
  ...buttonProps
}: PendingSubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <button
      aria-disabled={pending}
      className={className}
      data-pending={pending ? "true" : "false"}
      disabled={pending || disabled}
      type="submit"
      {...buttonProps}
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
