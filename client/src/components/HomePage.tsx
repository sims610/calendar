import { useState, type FormEvent } from "react";

type AccountMode = "sign-in" | "register";

/**
 * The Home tab. For now it offers signing in or creating an account, so events can later be
 * kept with an account and synced between devices. The forms aren't connected to the server yet.
 */
export function HomePage() {
  const [mode, setMode] = useState<AccountMode>("sign-in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const isRegistering = mode === "register";

  const handleSubmit = (submitEvent: FormEvent) => {
    submitEvent.preventDefault();
  };

  return (
    <div className="settings">
      <header className="header">
        <h1 className="header-title">Home</h1>
      </header>

      <main className="settings-content">
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

            <p className="form-note">
              Accounts are coming soon. Until then, your events stay on this device.
            </p>

            <button type="submit" className="button-primary account-submit" disabled>
              {isRegistering ? "Create account" : "Sign in"}
            </button>
          </form>

          <button
            type="button"
            className="account-switch"
            onClick={() => setMode(isRegistering ? "sign-in" : "register")}
          >
            {isRegistering ? "Already have an account? Sign in" : "New here? Create an account"}
          </button>
        </section>
      </main>
    </div>
  );
}
