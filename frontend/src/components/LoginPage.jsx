import { useState } from "react";
import { useAuth } from "../auth/AuthContext";
import BrandMark from "./BrandMark";

const LOGIN_CONFIG = {
  dashboard: {
    defaultUsername: "analyst",
    defaultPassword: "analyst123",
    kicker: "Dashboard Access",
    title: "Intelligence Workspace",
    description: "Sign in with an admin, analyst, or viewer account.",
    hint: "Dashboard roles: admin/admin123, analyst/analyst123, viewer/viewer123"
  },
  portal: {
    defaultUsername: "portal",
    defaultPassword: "portal123",
    kicker: "Portal Access",
    title: "Observation Portal",
    description: "Sign in with a portal submitter account. Portal access does not grant dashboard access.",
    hint: "Portal role: portal/portal123"
  }
};

export default function LoginPage({ workspace = "dashboard" }) {
  const auth = useAuth();
  const config = LOGIN_CONFIG[workspace] || LOGIN_CONFIG.dashboard;
  const [username, setUsername] = useState(config.defaultUsername);
  const [password, setPassword] = useState(config.defaultPassword);
  const [error, setError] = useState("");

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    try {
      await auth.login(username.trim(), password, workspace);
    } catch (err) {
      setError(err.message || "Unable to sign in.");
    }
  };

  return (
    <main className="auth-page">
      <section className="login-panel">
        <div className="login-copy">
          <BrandMark size="large" />
          {/* <span className="login-kicker">{config.kicker}</span> */}
          <h1>{config.title}</h1>
          <p>{config.description}</p>
        </div>
        <form className="login-form" onSubmit={handleSubmit}>
          <label>
            Username
            <input
              autoComplete="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
            />
          </label>
          <label>
            Password
            <input
              autoComplete="current-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          {error && <div className="login-error">{error}</div>}
          <button className="primary login-submit" type="submit" disabled={auth.status === "checking"}>
            {auth.status === "checking" ? "Signing in..." : "Sign In"}
          </button>
          <div className="login-hint">
            {config.hint}
          </div>
        </form>
      </section>
    </main>
  );
}
