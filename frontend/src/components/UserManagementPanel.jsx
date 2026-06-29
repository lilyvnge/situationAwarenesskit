import { useEffect, useState } from "react";
import { createUser, deleteUser, fetchUsers, updateUser } from "../api";

const ROLES = ["admin", "analyst", "viewer", "submitter"];

const EMPTY_FORM = {
  username: "",
  password: "",
  role: "viewer",
  is_active: true
};

export default function UserManagementPanel({ currentUser, onClose }) {
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [passwords, setPasswords] = useState({});
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const loadUsers = async () => {
    setError("");
    const data = await fetchUsers();
    setUsers(data);
  };

  useEffect(() => {
    loadUsers().catch((err) => setError(err.message || "Unable to load users."));
  }, []);

  const submitCreate = async (event) => {
    event.preventDefault();
    setBusy("create");
    setError("");
    try {
      await createUser(form);
      setForm(EMPTY_FORM);
      await loadUsers();
    } catch (err) {
      setError(err.message || "Unable to create user.");
    } finally {
      setBusy("");
    }
  };

  const patchUser = async (username, payload) => {
    setBusy(username);
    setError("");
    try {
      await updateUser(username, payload);
      await loadUsers();
    } catch (err) {
      setError(err.message || "Unable to update user.");
    } finally {
      setBusy("");
    }
  };

  const resetPassword = async (username) => {
    const password = passwords[username] || "";
    if (!password) return;
    await patchUser(username, { password });
    setPasswords((current) => ({ ...current, [username]: "" }));
  };

  const removeUser = async (username) => {
    setBusy(username);
    setError("");
    try {
      await deleteUser(username);
      await loadUsers();
    } catch (err) {
      setError(err.message || "Unable to delete user.");
    } finally {
      setBusy("");
    }
  };

  return (
    <section className="panel user-admin-panel">
      <header className="panel-title-row">
        <div>
          <h2>User Administration</h2>
          <span className="mono">Manage access, roles, and account status</span>
        </div>
        <button className="ghost-button" type="button" onClick={onClose}>
          Close
        </button>
      </header>

      {error && <div className="login-error">{error}</div>}

      <form className="user-create-form" onSubmit={submitCreate}>
        <label>
          Username
          <input
            value={form.username}
            onChange={(event) => setForm((current) => ({ ...current, username: event.target.value }))}
            placeholder="new.user"
          />
        </label>
        <label>
          Password
          <input
            type="password"
            value={form.password}
            onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
            placeholder="Minimum 8 characters"
          />
        </label>
        <label>
          Role
          <select value={form.role} onChange={(event) => setForm((current) => ({ ...current, role: event.target.value }))}>
            {ROLES.map((role) => (
              <option key={role} value={role}>
                {role}
              </option>
            ))}
          </select>
        </label>
        <label className="toggle-row">
          <input
            type="checkbox"
            checked={form.is_active}
            onChange={(event) => setForm((current) => ({ ...current, is_active: event.target.checked }))}
          />
          Active
        </label>
        <button className="primary" type="submit" disabled={busy === "create" || !form.username || !form.password}>
          {busy === "create" ? "Adding..." : "Add User"}
        </button>
      </form>

      <div className="user-table">
        {users.map((user) => {
          const isSelf = user.username === currentUser?.username;
          return (
            <article className="user-row" key={user.id}>
              <div className="user-identity">
                <strong>{user.username}</strong>
                <span className={`role-pill role-${user.role}`}>{user.role}</span>
                <span className={user.is_active ? "user-state-active" : "user-state-inactive"}>
                  {user.is_active ? "active" : "inactive"}
                </span>
              </div>
              <div className="user-controls">
                <select
                  value={user.role}
                  onChange={(event) => patchUser(user.username, { role: event.target.value })}
                  disabled={busy === user.username || isSelf}
                >
                  {ROLES.map((role) => (
                    <option key={role} value={role}>
                      {role}
                    </option>
                  ))}
                </select>
                <button
                  className="ghost-button"
                  type="button"
                  onClick={() => patchUser(user.username, { is_active: !user.is_active })}
                  disabled={busy === user.username || isSelf}
                >
                  {user.is_active ? "Deactivate" : "Activate"}
                </button>
                <input
                  type="password"
                  placeholder="New password"
                  value={passwords[user.username] || ""}
                  onChange={(event) => setPasswords((current) => ({ ...current, [user.username]: event.target.value }))}
                />
                <button
                  className="ghost-button"
                  type="button"
                  onClick={() => resetPassword(user.username)}
                  disabled={busy === user.username || !passwords[user.username]}
                >
                  Reset
                </button>
                <button
                  className="danger-button"
                  type="button"
                  onClick={() => removeUser(user.username)}
                  disabled={busy === user.username || isSelf}
                >
                  Remove
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
