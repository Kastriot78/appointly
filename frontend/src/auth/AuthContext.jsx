import {
  createContext,
  useContext,
  useState,
  useMemo,
  useCallback,
} from "react";
import {
  getStoredUser,
  setSession,
  clearSession,
  replaceSessionUser,
  setStoredWorkspaceId,
} from "./session";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => getStoredUser());
  const ready = true;

  const login = useCallback((token, userData) => {
    setSession(token, userData);
    if (userData?.staffBusinessId) {
      setStoredWorkspaceId(String(userData.staffBusinessId));
    }
    setUser(userData);
  }, []);

  const logout = useCallback(() => {
    clearSession();
    setUser(null);
  }, []);

  const refreshUser = useCallback((userData) => {
    if (!userData) return;
    replaceSessionUser(userData);
    setUser(userData);
  }, []);

  const value = useMemo(
    () => ({
      user,
      login,
      logout,
      refreshUser,
      ready,
      isAuthenticated: Boolean(user),
    }),
    [user, login, logout, refreshUser, ready],
  );

  return (
    <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
