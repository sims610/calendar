import { useState, type FormEvent } from "react";
import type { Account } from "../account";
import * as api from "../api";

interface PeoplePageProps {
  /** The signed-in account, or null when signed out. */
  account: Account | null;
  connections: api.Connection[];
  /** The ids of the people whose events are hidden from the calendar. */
  hiddenPeople: string[];
  /** Opens the Home tab, where signing in happens. */
  onGoToSignIn: () => void;
  /** Fetches the connections again, after one has changed. */
  onChanged: () => Promise<void>;
  /** Shows or hides a person's events on the calendar. */
  onSetShown: (userId: string, shown: boolean) => void;
}

/** What to tell the user when a request fails. */
function errorMessage(error: unknown): string {
  if (error instanceof api.ApiError) {
    return error.message;
  }
  return "Couldn't reach the server. Check your connection and try again.";
}

/** Who someone is, shown at the start of each row. */
function PersonDetails({ user }: { user: api.UserSummary }) {
  return (
    <div className="connection-person">
      <span className="connection-name">{user.name}</span>
      <span className="connection-email">{user.email}</span>
    </div>
  );
}

/** Connects with other people by email, to see each other's calendars. */
export function PeoplePage({
  account,
  connections,
  hiddenPeople,
  onGoToSignIn,
  onChanged,
  onSetShown,
}: PeoplePageProps) {
  return (
    <div className="settings">
      <header className="header">
        <h1 className="header-title">People</h1>
      </header>

      <main className="settings-content">
        {account ? (
          <Connections
            account={account}
            connections={connections}
            hiddenPeople={hiddenPeople}
            onChanged={onChanged}
            onSetShown={onSetShown}
          />
        ) : (
          <>
            <p className="settings-placeholder">
              Sign in to connect with people and see each other's calendars.
            </p>
            <button type="button" className="settings-link" onClick={onGoToSignIn}>
              Sign in or create an account
            </button>
          </>
        )}
      </main>
    </div>
  );
}

type ConnectionsProps = Omit<PeoplePageProps, "account" | "onGoToSignIn"> & { account: Account };

function Connections({ account, connections, hiddenPeople, onChanged, onSetShown }: ConnectionsProps) {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const requests = connections.filter((c) => c.status === "pending" && c.direction === "incoming");
  const sent = connections.filter((c) => c.status === "pending" && c.direction === "outgoing");
  const connected = connections.filter((c) => c.status === "accepted");

  /** Runs a change and returns whether it worked. Fetches either way: a failure may mean the list is out of date. */
  const change = async (action: () => Promise<unknown>): Promise<boolean> => {
    setError("");
    setSubmitting(true);
    try {
      await action();
      return true;
    } catch (caught) {
      setError(errorMessage(caught));
      return false;
    } finally {
      await onChanged();
      setSubmitting(false);
    }
  };

  const handleSubmit = async (submitEvent: FormEvent) => {
    submitEvent.preventDefault();
    if (await change(() => api.requestConnection(account.token, email.trim()))) {
      setEmail("");
    }
  };

  const remove = ({ id, user }: api.Connection) => {
    if (window.confirm(`Remove ${user.name}? You'll stop seeing each other's calendars.`)) {
      change(() => api.deleteConnection(account.token, id));
    }
  };

  return (
    <>
      <section className="account-card">
        <h2 className="settings-heading">Add someone</h2>
        <p className="form-note">
          Once they accept, you'll each see all of the other's events. Only the owner can change them.
        </p>
        <form className="account-form" onSubmit={handleSubmit}>
          <label>
            Their email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoCapitalize="none"
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
            disabled={submitting || email.trim() === ""}
          >
            Send
          </button>
        </form>
      </section>

      {requests.length > 0 && (
        <section className="settings-section">
          <h2 className="settings-heading">Requests</h2>
          <ul className="connection-list">
            {requests.map((connection) => (
              <li key={connection.id} className="connection-row">
                <PersonDetails user={connection.user} />
                <div className="connection-actions">
                  <button
                    type="button"
                    className="button-primary connection-button"
                    disabled={submitting}
                    onClick={() => change(() => api.acceptConnection(account.token, connection.id))}
                  >
                    Accept
                  </button>
                  <button
                    type="button"
                    className="button-plain connection-button"
                    disabled={submitting}
                    onClick={() => change(() => api.deleteConnection(account.token, connection.id))}
                  >
                    Decline
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {sent.length > 0 && (
        <section className="settings-section">
          <h2 className="settings-heading">Sent</h2>
          <ul className="connection-list">
            {sent.map((connection) => (
              <li key={connection.id} className="connection-row">
                <PersonDetails user={connection.user} />
                <div className="connection-actions">
                  <span className="connection-pending">Pending</span>
                  <button
                    type="button"
                    className="button-plain connection-button"
                    disabled={submitting}
                    onClick={() => change(() => api.deleteConnection(account.token, connection.id))}
                  >
                    Cancel
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {connected.length > 0 && (
        <section className="settings-section">
          <h2 className="settings-heading">Connected</h2>
          <ul className="connection-list">
            {connected.map((connection) => (
              <li key={connection.id} className="connection-row">
                <PersonDetails user={connection.user} />
                <div className="connection-actions">
                  <label className="connection-switch">
                    <input
                      type="checkbox"
                      role="switch"
                      checked={!hiddenPeople.includes(connection.user.id)}
                      onChange={(e) => onSetShown(connection.user.id, e.target.checked)}
                    />
                    Show on calendar
                  </label>
                  <button
                    type="button"
                    className="button-danger connection-button"
                    disabled={submitting}
                    onClick={() => remove(connection)}
                  >
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
