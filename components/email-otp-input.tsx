"use client";

import { useRef, useState, type ClipboardEvent, type ChangeEvent } from "react";

const CODE_LENGTH = 8;

/**
 * One native input drives all eight visual slots.
 *
 * Unlike eight separate inputs, this preserves mobile one-time-code autofill,
 * keyboard navigation, text replacement, screen-reader semantics and pasting
 * an entire code in one action.
 */
export function EmailOtpInput() {
  const [code, setCode] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function normalize(value: string) {
    return value.replace(/\D/g, "").slice(0, CODE_LENGTH);
  }

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    setCode(normalize(event.target.value));
  }

  function handlePaste(event: ClipboardEvent<HTMLInputElement>) {
    const pasted = event.clipboardData.getData("text");
    // Allow codes copied with spaces, dashes or surrounding prose.
    const digits = normalize(pasted);
    if (digits) {
      event.preventDefault();
      setCode(digits);
    }
  }

  const currentIndex = code.length < CODE_LENGTH ? code.length : -1;

  return (
    <div className="otp-field">
      <label htmlFor="tig-otp-code" className="otp-field-label">
        Verification code
      </label>
      <div className="otp-code-group">
        {Array.from({ length: CODE_LENGTH }, (_, index) => (
          <span
            key={index}
            className={[
              "otp-code-box",
              code[index] ? "otp-code-filled" : "",
              isFocused && index === currentIndex ? "otp-code-current" : "",
            ].filter(Boolean).join(" ")}
            aria-hidden="true"
          >
            {code[index] ?? ""}
          </span>
        ))}
        <input
          ref={inputRef}
          id="tig-otp-code"
          name="token"
          className="otp-code-native-input"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]{8}"
          aria-describedby="tig-otp-help"
          value={code}
          onChange={handleChange}
          onPaste={handlePaste}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          autoFocus
          required
        />
      </div>
      <p className="otp-field-help" id="tig-otp-help">
        Type your 8-digit code, or paste all 8 digits at once.
      </p>
    </div>
  );
}
