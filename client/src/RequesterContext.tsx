import { createContext, ReactNode, useContext, useEffect, useState } from "react";
import { CurrentUser, Requester, getCurrentUser } from "./api.js";
export const REQUESTER_STORAGE_KEY = "toktickit.requesterId";
type LoadState = "loading" | "ready" | "empty" | "unauthenticated" | "error";

interface RequesterContextValue {
  /** Legacy property name retained while identity now comes from the session. */
  currentRequester: CurrentUser | null;
  loadState: LoadState;
  /** Deprecated compatibility no-op; identity is never selected client-side. */
  selectRequester: (_id: number) => boolean;
  retry: () => Promise<void>;
  requesters: Requester[];
}

const RequesterContext = createContext<RequesterContextValue | null>(null);

export function RequesterProvider({ children }: { children: ReactNode }) {
  const [currentRequester, setCurrentRequester] = useState<CurrentUser | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("loading");

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

  useEffect(() => { void load(); }, []);

  return (
    <RequesterContext.Provider value={{ requesters: [], currentRequester, loadState, selectRequester: () => false, retry: load }}>
      {children}
    </RequesterContext.Provider>
  );
}

export function useRequester() {
  const context = useContext(RequesterContext);
  if (!context) throw new Error("useRequester must be used inside RequesterProvider");
  return context;
}
