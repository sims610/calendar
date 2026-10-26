import { useState } from "react";
import type { Account } from "../account";
import { getSavedTheme, saveTheme, THEMES, type Theme } from "../theme";
import { CheckIcon } from "./Icons";

interface SettingsPageProps {
  /** The signed-in account, or null when signed out. */
  account: Account | null;
  /** Opens the Home tab, where signing in happens. */
  onGoToSignIn: () => void;
  /** Resolves once the user's events are uploaded and removed from this device. */
  onSignOut: () => Promise<void>;
}

export function SettingsPage({ account, onGoToSignIn, onSignOut }: SettingsPageProps) {
  const [selectedTheme, setSelectedTheme] = useState(getSavedTheme);
  const [signingOut, setSigningOut] = useState(false);

  const chooseTheme = (theme: Theme) => {
    saveTheme(theme);
    setSelectedTheme(theme);
  };

  const signOut = async () => {
    setSigningOut(true);
    try {
      await onSignOut();
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <div className="settings">
      <header className="header">
        <h1 className="header-title">Settings</h1>
      </header>

      <main className="settings-content">
        <section>
          <h2 className="settings-heading">Account</h2>
          {account ? (
            <>
              <p className="settings-placeholder">
                Signed in as {account.user.name} ({account.user.email})
              </p>
              <button
                type="button"
                className="settings-link"
                onClick={signOut}
                disabled={signingOut}
              >
                {signingOut ? "Signing out…" : "Sign out"}
              </button>
            </>
          ) : (
            <>
              <p className="settings-placeholder">
                You're not signed in. Your events are saved on this device only.
              </p>
              <button type="button" className="settings-link" onClick={onGoToSignIn}>
                Sign in or create an account
              </button>
            </>
          )}
        </section>

        <section className="settings-section">
          <h2 className="settings-heading">App color</h2>
          <div className="color-options" role="radiogroup" aria-label="App color">
            {THEMES.map((theme) => {
              const selected = theme.id === selectedTheme.id;
              return (
                <button
                  key={theme.id}
                  className={selected ? "color-option selected" : "color-option"}
                  role="radio"
                  aria-checked={selected}
                  onClick={() => chooseTheme(theme)}
                >
                  <span className="color-swatch" style={{ background: theme.color }}>
                    {selected && <CheckIcon size={20} />}
                  </span>
                  <span>{theme.name}</span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="settings-section">
          <h2 className="settings-heading">Notifications</h2>
          <p className="settings-placeholder">Coming soon</p>
        </section>

        <section className="settings-section">
          <h2 className="settings-heading">Connected calendars</h2>
          <p className="settings-placeholder">Coming soon</p>
        </section>
      </main>
    </div>
  );
}
