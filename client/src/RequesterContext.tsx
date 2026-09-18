import { createContext, ReactNode, useContext, useEffect, useState } from "react";
import {
  AuthenticationResult,
  CurrentUser,
  changePassword as changePasswordRequest,
  getCurrentUser,
  login as loginRequest,
  logout as logoutRequest,
  setCsrfToken,
} from "./api.js";
export type LoadState = "loading" | "ready" | "unauthenticated" | "error";

interface RequesterContextValue {
  currentRequester: CurrentUser | null;
  currentUser: CurrentUser | null;
  loadState: LoadState;
  retry: () => Promise<void>;
  login: (email: string, password: string) => Promise<AuthenticationResult>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<AuthenticationResult>;
  logout: () => Promise<void>;
}

const RequesterContext = createContext<RequesterContextValue | null>(null);

export function RequesterProvider({ children }: { children: ReactNode }) {
  const [currentRequester, setCurrentRequester] = useState<CurrentUser | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("loading");

  function applyAuthentication(result: AuthenticationResult): AuthenticationResult {
    setCurrentRequester(result.user);
    setLoadState("ready");
    return result;
  }

  async function load() {
    setLoadState("loading");
    try {
      const { user } = await getCurrentUser();
      setCurrentRequester(user);
      setLoadState("ready");
    } catch (error) {
      setCurrentRequester(null);
      const status = error instanceof Error && "status" in error ? (error as { status?: number }).status : undefined;
      setLoadState(status === 401 ? "unauthenticated" : "error");
    }
  }

  async function login(email: string, password: string) {
    return applyAuthentication(await loginRequest(email, password));
  }

  async function changePassword(currentPassword: string, newPassword: string) {
    return applyAuthentication(await changePasswordRequest(currentPassword, newPassword));
  }

  async function logout() {
    await logoutRequest();
    setCsrfToken(null);
    setCurrentRequester(null);
    setLoadState("unauthenticated");
  }

  useEffect(() => { void load(); }, []);
  useEffect(() => {
    const recover = () => { void load(); };
    window.addEventListener("toktickit:auth-recovery", recover);
    return () => window.removeEventListener("toktickit:auth-recovery", recover);
  }, []);

  return (
    <RequesterContext.Provider value={{
      currentRequester,
      currentUser: currentRequester,
      loadState,
      retry: load,
      login,
      changePassword,
      logout,
    }}>
      {children}
    </RequesterContext.Provider>
  );
}

export function useRequester() {
  const context = useContext(RequesterContext);
  if (!context) throw new Error("useRequester must be used inside RequesterProvider");
  return context;
}
