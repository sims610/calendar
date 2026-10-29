import { useEffect, useState } from "react";
import type { Account } from "../account";
import * as api from "../api";
import { BackIcon } from "./Icons";

interface AdminPageProps {
  /** The signed-in admin's account. */
  account: Account;
  /** Goes back to Settings. */
  onBack: () => void;
}

/** Lists everyone registered on the site. Only admins can open it. */
export function AdminPage({ account, onBack }: AdminPageProps) {
  const [users, setUsers] = useState<api.UserSummary[] | null>(null);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let current = true;
    api
      .getUsers(account.token)
      .then((loaded) => current && setUsers(loaded))
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
        <h1 className="header-title">Users</h1>
      </header>

      <main className="settings-content">
        {loadError ? (
          <p className="settings-placeholder">Couldn't load users.</p>
        ) : users === null ? (
          <p className="settings-placeholder">Loading users…</p>
        ) : (
          <section>
            <h2 className="settings-heading">
              {users.length} {users.length === 1 ? "user" : "users"}
            </h2>
            <ul className="admin-user-list">
              {users.map((user) => (
                <li key={user.id} className="admin-user">
                  <span className="admin-user-name">{user.name}</span>
                  <span className="admin-user-email">{user.email}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </div>
  );
}
