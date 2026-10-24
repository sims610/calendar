import { useState, type FormEvent } from "react";
import type { Account } from "../account";
import * as api from "../api";

type AccountMode = "sign-in" | "register";

interface HomePageProps {
  /** The signed-in account, or null when signed out. */
  account: Account | null;
  onSignedIn: (account: Account) => void;
}

/** What to tell the user when signing in or registering fails. */
function errorMessage(error: unknown): string {
  if (error instanceof api.ApiError) {
    if (error.status === 401) {
      return "That email and password don't match an account.";
    }
    if (error.status === 409) {
      return "There's already an account with that email. Try signing in.";
    }
    return error.message;
  }
  return "Couldn't reach the server. Check your connection and try again.";
}

/**
 * The Home tab. Signed out, it offers signing in or creating an account, so events are kept
 * with the account and synced between devices. Signed in, it says who.
 */
export function HomePage({ account, onSignedIn }: HomePageProps) {
  const [mode, setMode] = useState<AccountMode>("sign-in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const isRegistering = mode === "register";

  const handleSubmit = async (submitEvent: FormEvent) => {
    submitEvent.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const signedIn = isRegistering
        ? await api.register(name.trim(), email.trim(), password)
        : await api.signIn(email.trim(), password);
      setPassword("");
      onSignedIn(signedIn);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setSubmitting(false);
    }
  };

  const switchMode = () => {
    setMode(isRegistering ? "sign-in" : "register");
    setError("");
  };

  return (
    <div className="settings">
      <header className="header">
        <h1 className="header-title">Home</h1>
      </header>

      <main className="settings-content">
        {account ? (
          <section className="account-card">
            <h2 className="account-title">Hi, {account.user.name}</h2>
            <p className="form-note">
              Signed in as {account.user.email}. Your events are saved to your account and show
              on all your devices.
            </p>
          </section>
        ) : (
          <section className="account-card">
            <h2 className="account-title">
              {isRegistering ? "Create an account" : "Sign in"}
            </h2>
            <p className="form-note">
              Keep your events with your account and see them on all your devices.
            </p>

            <form className="account-form" onSubmit={handleSubmit}>
              {isRegistering && (
                <label>
                  Name
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    autoComplete="name"
                    required
                  />
                </label>
              )}
              <label>
                Email
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  required
                />
              </label>
              <label>
                Password
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={isRegistering ? "new-password" : "current-password"}
                  required
                />
              </label>

              {error && (
                <p className="form-error" role="alert">
                  {error}
                </p>
              )}

              <button
                type="submit"
                className="button-primary account-submit"
                disabled={submitting}
              >
                {isRegistering ? "Create account" : "Sign in"}
              </button>
            </form>

            <button type="button" className="account-switch" onClick={switchMode}>
              {isRegistering ? "Already have an account? Sign in" : "New here? Create an account"}
            </button>
          </section>
        )}
      </main>
    </div>
  );
}
