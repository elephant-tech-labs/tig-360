"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function AcceptAuthLinkPage() {
  const [message, setMessage] = useState("Securing your invitation...");

  useEffect(() => {
    async function completeAuth() {
      const params = new URLSearchParams(window.location.search);
      const hash = new URLSearchParams(window.location.hash.slice(1));
      const authError = params.get("error") || hash.get("error");
      const errorCode = params.get("error_code") || hash.get("error_code");
      const errorDescription = params.get("error_description") || hash.get("error_description");

      if (authError) {
        const text = errorCode === "otp_expired"
          ? "This invitation link has expired. Ask an administrator to resend it."
          : errorDescription || "Unable to accept this invitation.";
        window.location.replace(`/login?error=${encodeURIComponent(text)}`);
        return;
      }

      const supabase = createClient();
      const code = params.get("code");
      const accessToken = hash.get("access_token");
      const refreshToken = hash.get("refresh_token");

      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
          window.location.replace(`/login?error=${encodeURIComponent(error.message)}`);
          return;
        }
      } else if (accessToken && refreshToken) {
        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (error) {
          window.location.replace(`/login?error=${encodeURIComponent(error.message)}`);
          return;
        }
      } else {
        const { data } = await supabase.auth.getSession();
        if (!data.session) {
          setMessage("This invitation link is incomplete or has expired.");
          return;
        }
      }

      window.location.replace("/activate");
    }

    void completeAuth();
  }, []);

  return (
    <main className="activation-page">
      <section className="activation-card">
        <div className="auth-loading-mark">TI</div>
        <h1>Accepting invitation</h1>
        <p>{message}</p>
      </section>
    </main>
  );
}
