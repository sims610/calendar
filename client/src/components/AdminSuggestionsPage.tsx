import { useEffect, useState } from "react";
import type { Account } from "../account";
import * as api from "../api";
import { BackIcon } from "./Icons";

interface AdminSuggestionsPageProps {
  /** The signed-in admin's account. */
  account: Account;
  /** Goes back to Settings. */
  onBack: () => void;
}

/** "Nov 11, 2026, 3:04 PM" in the viewer's own time zone. */
function formatSentAt(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

/** Lists every feature suggestion, newest first. Only admins can open it. */
export function AdminSuggestionsPage({ account, onBack }: AdminSuggestionsPageProps) {
  const [suggestions, setSuggestions] = useState<api.FeatureSuggestion[] | null>(null);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let current = true;
    api
      .getFeatureSuggestions(account.token)
      .then((loaded) => current && setSuggestions(loaded))
      .catch(() => current && setLoadError(true));
    return () => {
      current = false;
    };
  }, [account.token]);

  return (
    <div className="settings">
      <header className="header">
        <button type="button" className="header-icon-button" onClick={onBack} aria-label="Back">
          <BackIcon />
        </button>
        <h1 className="header-title">Feature suggestions</h1>
      </header>

      <main className="settings-content">
        {loadError ? (
          <p className="settings-placeholder">Couldn't load suggestions.</p>
        ) : suggestions === null ? (
          <p className="settings-placeholder">Loading suggestions…</p>
        ) : suggestions.length === 0 ? (
          <p className="settings-placeholder">No suggestions yet.</p>
        ) : (
          <section>
            <h2 className="settings-heading">
              {suggestions.length} {suggestions.length === 1 ? "suggestion" : "suggestions"}
            </h2>
            <ul className="admin-user-list">
              {suggestions.map((suggestion) => (
                <li key={suggestion.id} className="admin-user">
                  <span className="admin-suggestion-text">{suggestion.text}</span>
                  <span className="admin-user-email">
                    {suggestion.user.name} · {suggestion.user.email} ·{" "}
                    {formatSentAt(suggestion.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </div>
  );
}
