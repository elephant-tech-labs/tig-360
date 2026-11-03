import { Building2, CheckCircle2, ClipboardCheck, ShieldCheck } from "lucide-react";
import { requestLoginCode, verifyLoginCode } from "@/app/auth/actions";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import { EmailOtpInput } from "@/components/email-otp-input";

type LoginPageProps = {
  searchParams: Promise<{
    step?: string;
    email?: string;
    error?: string;
    message?: string;
  }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const isVerifying = params.step === "verify" && Boolean(params.email);
  const email = params.email ?? "";

  return (
    <main className="auth-page">
      <section className="auth-context">
        <div className="auth-brand">
          <span>TI</span>
          <div><strong>Trident</strong><small>Inspect360</small></div>
        </div>
        <div className="auth-copy">
          <p className="eyebrow">Inspection operations</p>
          <h1>From field evidence to a delivered report.</h1>
          <p>
            One workspace for inspections, findings, documents, contacts, and
            delivery history.
          </p>
        </div>
        <div className="auth-benefits">
          <span><ClipboardCheck size={18} /> Guided inspection workflow</span>
          <span><ShieldCheck size={18} /> Organization-isolated records</span>
          <span><Building2 size={18} /> Reusable properties and contacts</span>
        </div>
      </section>

      <section className="auth-panel">
        <div className="auth-card">
          <p className="eyebrow">Welcome</p>
          <h2>{isVerifying ? "Enter your email code" : "Sign in to Inspect360"}</h2>
          <p className="auth-intro">
            {isVerifying
              ? `Check ${email} for your one-time sign-in code.`
              : "Enter your authorized work email. No password is required."}
          </p>

          {params.error ? <div className="form-alert error" role="alert">{params.error}</div> : null}
          {params.message ? (
            <div className="form-alert success" role="status"><CheckCircle2 size={17} /> {params.message}</div>
          ) : null}

          {isVerifying ? (
            <>
              <form className="form-stack" action={verifyLoginCode}>
                <input name="email" type="hidden" value={email} />
                <EmailOtpInput />
                <PendingSubmitButton
                  className="primary-button form-submit"
                  pendingLabel="Verifying code"
                >
                  Verify and sign in
                </PendingSubmitButton>
              </form>
              <form className="form-stack" action={requestLoginCode}>
                <input name="email" type="hidden" value={email} />
                <PendingSubmitButton
                  className="secondary-button form-submit"
                  pendingLabel="Requesting new code"
                >
                  Send another code
                </PendingSubmitButton>
              </form>
              <p className="auth-help"><a href="/login">Use a different email address</a></p>
            </>
          ) : (
            <form className="form-stack" action={requestLoginCode}>
              <label>
                Work email
                <input
                  name="email"
                  type="email"
                  defaultValue={email}
                  autoComplete="email"
                  autoFocus
                  required
                />
              </label>
              <PendingSubmitButton
                className="primary-button form-submit"
                pendingLabel="Sending code"
              >
                Email me a sign-in code
              </PendingSubmitButton>
            </form>
          )}

          <p className="auth-help">
            Access is limited to active Inspect360 team members.
            Contact your administrator if you need an invitation.
          </p>
        </div>
      </section>
    </main>
  );
}
