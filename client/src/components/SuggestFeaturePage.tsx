import { useState, type FormEvent } from "react";
import type { Account } from "../account";
import * as api from "../api";
import { BackIcon } from "./Icons";

interface SuggestFeaturePageProps {
  /** The signed-in account. Suggestions are saved with who sent them. */
  account: Account;
  /** Goes back to Settings. */
  onBack: () => void;
}

/** Lets a signed-in user send a feature idea for the admins to read. */
export function SuggestFeaturePage({ account, onBack }: SuggestFeaturePageProps) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (submitEvent: FormEvent) => {
    submitEvent.preventDefault();
    setError("");
    setSending(true);
    try {
      await api.suggestFeature(account.token, text.trim());
      setSent(true);
    } catch (caught) {
      // The text stays in the box, so nothing typed is lost.
      setError(
        caught instanceof api.ApiError
          ? caught.message
          : "Couldn't reach the server. Check your connection and try again.",
      );
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="settings">
      <header className="header">
        <button type="button" className="header-icon-button" onClick={onBack} aria-label="Back">
          <BackIcon />
        </button>
        <h1 className="header-title">Suggest a feature</h1>
      </header>

      <main className="settings-content">
        {sent ? (
          <section className="account-card">
            <p className="settings-placeholder">Thanks, your suggestion was sent.</p>
            <button type="button" className="button-primary account-submit" onClick={onBack}>
              Back to Settings
            </button>
          </section>
        ) : (
          <section className="account-card">
            <p className="form-note">What would make Calendar better for you?</p>
            <form className="account-form" onSubmit={handleSubmit}>
              <label>
                Your idea
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  maxLength={api.MAX_SUGGESTION_LENGTH}
                  rows={6}
                  required
                />
              </label>
              <p className="form-note suggestion-count">
                {text.length} / {api.MAX_SUGGESTION_LENGTH}
              </p>

              {error && (
                <p className="form-error" role="alert">
                  {error}
                </p>
              )}

              <button
                type="submit"
                className="button-primary account-submit"
                disabled={sending || text.trim() === ""}
              >
                {sending ? "Sending…" : "Send"}
              </button>
            </form>
          </section>
        )}
      </main>
    </div>
  );
}
