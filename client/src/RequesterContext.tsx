import { createContext, ReactNode, useContext, useEffect, useState } from "react";
import { getRequesters, Requester } from "./api.js";

export const REQUESTER_STORAGE_KEY = "toktickit.requesterId";
type LoadState = "loading" | "ready" | "empty" | "error";

interface RequesterContextValue {
  requesters: Requester[];
  currentRequester: Requester | null;
  loadState: LoadState;
  selectRequester: (id: number) => boolean;
  retry: () => Promise<void>;
}

const RequesterContext = createContext<RequesterContextValue | null>(null);

function storedRequesterId(): number | null {
  const raw = sessionStorage.getItem(REQUESTER_STORAGE_KEY);
  if (!raw || !/^[1-9]\d*$/.test(raw)) return null;
  const id = Number(raw);
  return Number.isSafeInteger(id) ? id : null;
}

export function RequesterProvider({ children }: { children: ReactNode }) {
  const [requesters, setRequesters] = useState<Requester[]>([]);
  const [currentRequester, setCurrentRequester] = useState<Requester | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("loading");

  async function load() {
    setLoadState("loading");
    try {
      const activeRequesters = (await getRequesters()).filter((requester) => requester.isActive);
      setRequesters(activeRequesters);
      const storedId = storedRequesterId();
      const storedRequester = activeRequesters.find((requester) => requester.id === storedId) ?? null;
      setCurrentRequester(storedRequester);
      if (!storedRequester) sessionStorage.removeItem(REQUESTER_STORAGE_KEY);
      setLoadState(activeRequesters.length === 0 ? "empty" : "ready");
    } catch {
      setRequesters([]);
      setLoadState("error");
    }
  }

  useEffect(() => { void load(); }, []);

  function selectRequester(id: number) {
    const requester = requesters.find((candidate) => candidate.id === id) ?? null;
    if (!requester) return false;
    sessionStorage.setItem(REQUESTER_STORAGE_KEY, String(requester.id));
    setCurrentRequester(requester);
    return true;
  }

  return (
    <RequesterContext.Provider value={{ requesters, currentRequester, loadState, selectRequester, retry: load }}>
      {children}
    </RequesterContext.Provider>
  );
}

export function useRequester() {
  const context = useContext(RequesterContext);
  if (!context) throw new Error("useRequester must be used inside RequesterProvider");
  return context;
}
