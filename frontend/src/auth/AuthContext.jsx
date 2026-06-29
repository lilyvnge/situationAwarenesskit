import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { clearStoredToken, fetchCurrentUser, getCurrentWorkspace, getStoredToken, login as loginRequest } from "../api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const workspace = getCurrentWorkspace();
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState(() => (getStoredToken(workspace) ? "checking" : "anonymous"));

  useEffect(() => {
    if (!getStoredToken(workspace)) return;
    let canceled = false;
    fetchCurrentUser(workspace)
      .then((currentUser) => {
        if (!canceled) {
          setUser(currentUser);
          setStatus("authenticated");
        }
      })
      .catch(() => {
        if (!canceled) {
          clearStoredToken(workspace);
          setUser(null);
          setStatus("anonymous");
        }
      });
    return () => {
      canceled = true;
    };
  }, [workspace]);

  useEffect(() => {
    const onExpired = (event) => {
      if (event.detail?.workspace && event.detail.workspace !== workspace) return;
      setUser(null);
      setStatus("anonymous");
    };
    window.addEventListener("auth:expired", onExpired);
    return () => window.removeEventListener("auth:expired", onExpired);
  }, [workspace]);

  const value = useMemo(
    () => ({
      user,
      status,
      isAuthenticated: status === "authenticated",
      hasRole: (...roles) => Boolean(user && roles.includes(user.role)),
      login: async (username, password, workspace = "dashboard") => {
        setStatus("checking");
        try {
          const data = await loginRequest(username, password, workspace);
          setUser(data.user);
          setStatus("authenticated");
          return data.user;
        } catch (error) {
          setUser(null);
          setStatus("anonymous");
          throw error;
        }
      },
      logout: () => {
        clearStoredToken(workspace);
        setUser(null);
        setStatus("anonymous");
      }
    }),
    [user, status, workspace]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
