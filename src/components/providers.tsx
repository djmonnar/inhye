"use client";

import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { store } from "@/lib/store";
import type { AppUser } from "@/lib/types";
import { Mascot, type Mood } from "./Mascot";

/* ---------------------------------- auth ---------------------------------- */

interface AuthState {
  user: AppUser | null;
  loading: boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthCtx = createContext<AuthState | null>(null);

function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const next = await store().getUser().catch(() => null);
    setUser(next);
    setLoading(false);
  }, []);

  useEffect(() => {
    let alive = true;
    store()
      .getUser()
      .catch(() => null)
      .then((u) => {
        if (!alive) return;
        setUser(u);
        setLoading(false);
      });
    const off = store().onAuthChange(() => void refresh());
    return () => {
      alive = false;
      off();
    };
  }, [refresh]);

  const signOut = useCallback(async () => {
    await store().signOut();
    qc.clear();
    setUser(null);
  }, [qc]);

  return <AuthCtx.Provider value={{ user, loading, refresh, signOut }}>{children}</AuthCtx.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error("useAuth outside provider");
  return ctx;
}

/* --------------------------------- toasts --------------------------------- */

interface Toast {
  id: number;
  text: string;
  mood: Mood;
}

const ToastCtx = createContext<(text: string, mood?: Mood) => void>(() => {});

function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seq = useRef(0);

  const push = useCallback((text: string, mood: Mood = "happy") => {
    const id = ++seq.current;
    setToasts((t) => [...t.slice(-2), { id, text, mood }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2800);
  }, []);

  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 top-0 z-[60] flex flex-col items-center gap-2 px-4"
        style={{ paddingTop: "calc(env(safe-area-inset-top) + 0.75rem)" }}
        aria-live="polite"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className="card pointer-events-auto flex max-w-sm animate-pop-in items-center gap-2 py-2 pl-2 pr-4 shadow-soft"
          >
            <Mascot mood={t.mood} size={34} />
            <span className="text-[15px] font-medium">{t.text}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast() {
  return useContext(ToastCtx);
}

/* -------------------------------- providers ------------------------------- */

export function Providers({ children }: { children: ReactNode }) {
  const [qc] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: true },
        },
      }),
  );
  return (
    <QueryClientProvider client={qc}>
      <AuthProvider>
        <ToastProvider>{children}</ToastProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
