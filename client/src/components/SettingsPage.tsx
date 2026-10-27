import { useState } from "react";
import {
  getSavedReminder,
  isInstalledApp,
  pushSupported,
  REMINDER_OPTIONS,
  saveReminder,
  type ReminderOption,
} from "../notifications";
import type { Account } from "../account";
import { getSavedTheme, saveTheme, THEMES, type Theme } from "../theme";
import { CheckIcon } from "./Icons";
// The deploy (ci.yml) stamps this with the build's date and time, e.g. 20261022.040710.
import { version } from "../version.json";

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
          <NotificationSettings signedIn={account !== null} />
        </section>

        <section className="settings-section">
          <h2 className="settings-heading">Connected calendars</h2>
          <p className="settings-placeholder">Coming soon</p>
        </section>

        <p className="settings-version">Version {version}</p>
      </main>
    </div>
  );
}

/**
 * Why reminders can't be turned on here, or "" if they can. They're only offered when they'll
 * arrive with the app closed, so nobody expects a reminder that never comes.
 */
function notificationsUnavailableReason(signedIn: boolean): string {
  if (!pushSupported()) {
    return "This browser can't send notifications when Calendar is closed.";
  }
  if (!isInstalledApp()) {
    return "Add Calendar to your home screen to get notified before your events.";
  }
  if (!signedIn) {
    return "Sign in to get notified before your events, even when Calendar is closed.";
  }
  return "";
}

function NotificationSettings({ signedIn }: { signedIn: boolean }) {
  // Reminders only work while signed in with notifications allowed, so show them as off otherwise.
  const [selectedReminder, setSelectedReminder] = useState(() =>
    signedIn && pushSupported() && Notification.permission === "granted"
      ? getSavedReminder()
      : REMINDER_OPTIONS[0],
  );
  const [result, setResult] = useState<"ok" | "blocked" | "failed">("ok");

  const unavailableReason = notificationsUnavailableReason(signedIn);
  if (unavailableReason) {
    return <p className="settings-placeholder">{unavailableReason}</p>;
  }

  const chooseReminder = async (option: ReminderOption) => {
    const saved = await saveReminder(option);
    setResult(saved);
    if (saved === "ok") {
      setSelectedReminder(option);
    }
  };

  return (
    <>
      <div className="reminder-options" role="radiogroup" aria-label="Notifications">
        {REMINDER_OPTIONS.map((option) => {
          const selected = option.id === selectedReminder.id;
          return (
            <button
              key={option.id}
              className="reminder-option"
              role="radio"
              aria-checked={selected}
              onClick={() => chooseReminder(option)}
            >
              <span>{option.name}</span>
              {selected && <CheckIcon size={20} />}
            </button>
          );
        })}
      </div>
      {result === "blocked" && (
        <p className="settings-placeholder settings-note">
          Notifications are blocked for Calendar. Allow them in your phone's settings, then try
          again.
        </p>
      )}
      {result === "failed" && (
        <p className="settings-placeholder settings-note">
          Couldn't turn on notifications. Check your connection and try again.
        </p>
      )}
    </>
  );
}
