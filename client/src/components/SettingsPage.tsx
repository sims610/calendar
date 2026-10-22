import { useState } from "react";
import { getSavedTheme, saveTheme, THEMES, type Theme } from "../theme";
import { CheckIcon } from "./Icons";

interface SettingsPageProps {
  /** Opens the Home tab, where signing in happens. */
  onGoToSignIn: () => void;
}

export function SettingsPage({ onGoToSignIn }: SettingsPageProps) {
  const [selectedTheme, setSelectedTheme] = useState(getSavedTheme);

  const chooseTheme = (theme: Theme) => {
    saveTheme(theme);
    setSelectedTheme(theme);
  };

  return (
    <div className="settings">
      <header className="header">
        <h1 className="header-title">Settings</h1>
      </header>

      <main className="settings-content">
        {/* Accounts aren't connected yet, so this is always the signed-out view. */}
        <section>
          <h2 className="settings-heading">Account</h2>
          <p className="settings-placeholder">
            You're not signed in. Your events are saved on this device only.
          </p>
          <button type="button" className="settings-link" onClick={onGoToSignIn}>
            Sign in or create an account
          </button>
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
      </main>
    </div>
  );
}
