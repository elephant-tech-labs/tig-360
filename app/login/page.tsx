import { Building2, CheckCircle2, ClipboardCheck, ShieldCheck } from "lucide-react";
import { signIn, signUp } from "@/app/auth/actions";

type LoginPageProps = {
  searchParams: Promise<{ error?: string; message?: string }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;

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
          <h2>Sign in to Inspect360</h2>
          <p className="auth-intro">Use your work account to continue.</p>

          {params.error ? <div className="form-alert error">{params.error}</div> : null}
          {params.message ? (
            <div className="form-alert success"><CheckCircle2 size={17} /> {params.message}</div>
          ) : null}

          <form className="form-stack" action={signIn}>
            <label>
              Email
              <input name="email" type="email" autoComplete="email" required />
            </label>
            <label>
              Password
              <input name="password" type="password" autoComplete="current-password" required />
            </label>
            <button className="primary-button form-submit" type="submit">Sign in</button>
          </form>

          <details className="signup-panel">
            <summary>Create the first account</summary>
            <form className="form-stack" action={signUp}>
              <label>
                Full name
                <input name="fullName" autoComplete="name" required />
              </label>
              <label>
                Email
                <input name="email" type="email" autoComplete="email" required />
              </label>
              <label>
                Password
                <input
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  required
                />
              </label>
              <button className="secondary-button form-submit" type="submit">Create account</button>
            </form>
          </details>
        </div>
      </section>
    </main>
  );
}
