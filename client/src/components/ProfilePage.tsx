import { useState, type FormEvent } from "react";
import type { Account, User } from "../account";
import * as api from "../api";
import { BackIcon } from "./Icons";

interface ProfilePageProps {
  /** The signed-in account. */
  account: Account;
  /** Called with the user's details as the server saved them. */
  onSaved: (user: User) => void;
  /** Goes back to Settings. */
  onBack: () => void;
}

/** What to tell the user when saving fails. */
function errorMessage(error: unknown): string {
  if (error instanceof api.ApiError) {
    if (error.status === 401) {
      return "Your current password isn't right.";
    }
    if (error.status === 409) {
      return "There's already an account with that email.";
    }
    return error.message;
  }
  return "Couldn't reach the server. Check your connection and try again.";
}

/** Lets any signed-in user change their name, email and password. */
export function ProfilePage({ account, onSaved, onBack }: ProfilePageProps) {
  const [name, setName] = useState(account.user.name);
  const [email, setEmail] = useState(account.user.email);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const nameChanged = name.trim() !== account.user.name;
  const emailChanged = email.trim().toLowerCase() !== account.user.email;
  const passwordChanged = newPassword !== "";
  // Only the name can change without proving who's asking.
  const needsCurrentPassword = emailChanged || passwordChanged;
  const hasChanges = nameChanged || emailChanged || passwordChanged;

  const handleSubmit = async (submitEvent: FormEvent) => {
    submitEvent.preventDefault();
    setError("");
    setSaved(false);
    if (passwordChanged && newPassword !== confirmPassword) {
      setError("The new passwords don't match.");
      return;
    }

    const changes: api.ProfileChanges = {};
    if (nameChanged) {
      changes.name = name.trim();
    }
    if (emailChanged) {
      changes.email = email.trim();
    }
    if (passwordChanged) {
      changes.password = newPassword;
    }
    if (needsCurrentPassword) {
      changes.currentPassword = currentPassword;
    }

    setSubmitting(true);
    try {
      const user = await api.updateProfile(account.token, changes);
      setNewPassword("");
      setConfirmPassword("");
      setCurrentPassword("");
      setName(user.name);
      setEmail(user.email);
      setSaved(true);
      onSaved(user);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="settings">
      <header className="header">
        <button type="button" className="header-icon-button" onClick={onBack} aria-label="Back">
          <BackIcon />
        </button>
        <h1 className="header-title">Account</h1>
      </header>

      <main className="settings-content">
        <section className="account-card">
          <h2 className="account-title">Your details</h2>
          <p className="form-note">Leave the new password blank to keep your current one.</p>

          <form className="account-form" onSubmit={handleSubmit}>
            <label>
              Name
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
                required
              />
            </label>
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
              New password
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
              />
            </label>
            {passwordChanged && (
              <label>
                Confirm new password
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                  required
                />
              </label>
            )}
            {needsCurrentPassword && (
              <label>
                Current password
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                />
              </label>
            )}

            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            {saved && !hasChanges && <p className="form-note">Saved.</p>}

            <button
              type="submit"
              className="button-primary account-submit"
              disabled={submitting || !hasChanges}
            >
              {submitting ? "Saving…" : "Save"}
            </button>
          </form>
        </section>
      </main>
    </div>
  );
}
