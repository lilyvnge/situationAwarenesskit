import LoginPage from "../components/LoginPage";
import { useAuth } from "./AuthContext";

export default function ProtectedRoute({ children, allowedRoles, workspace = "dashboard" }) {
  const auth = useAuth();

  if (auth.status === "checking") {
    return (
      <main className="auth-page">
        <div className="auth-loading">Checking secure session...</div>
      </main>
    );
  }

  if (!auth.isAuthenticated) {
    return <LoginPage workspace={workspace} />;
  }

  if (allowedRoles?.length && !allowedRoles.includes(auth.user?.role)) {
    return (
      <main className="auth-page">
        <section className="login-panel access-panel">
          <div className="login-copy">
            <span className="login-kicker">Access Boundary</span>
            <h1>Not available for this account</h1>
            <p>This sign-in can access a different workspace. Log out and use an account assigned to this page.</p>
          </div>
          <button className="primary" type="button" onClick={auth.logout}>
            Logout
          </button>
        </section>
      </main>
    );
  }

  return children;
}
