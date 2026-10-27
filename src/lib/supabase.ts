import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { LOGIN_DOMAIN, SUPABASE_KEY, SUPABASE_URL } from "./config";

const REMEMBER_KEY = "mongsil.remember";

/** 자동 로그인: on → session lives in localStorage, off → only this tab (sessionStorage). */
export function setRemember(on: boolean) {
  try {
    localStorage.setItem(REMEMBER_KEY, on ? "1" : "0");
  } catch {
    /* private mode */
  }
}

export function getRemember(): boolean {
  try {
    return localStorage.getItem(REMEMBER_KEY) !== "0";
  } catch {
    return true;
  }
}

const rememberAwareStorage = {
  getItem(key: string) {
    try {
      return localStorage.getItem(key) ?? sessionStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem(key: string, value: string) {
    try {
      if (getRemember()) {
        localStorage.setItem(key, value);
        sessionStorage.removeItem(key);
      } else {
        sessionStorage.setItem(key, value);
        localStorage.removeItem(key);
      }
    } catch {
      /* ignore */
    }
  },
  removeItem(key: string) {
    try {
      localStorage.removeItem(key);
      sessionStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  },
};

let client: SupabaseClient | null = null;

export function supabase(): SupabaseClient {
  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
        storageKey: "mongsil.auth",
        storage: typeof window === "undefined" ? undefined : rememberAwareStorage,
      },
    });
  }
  return client;
}

/** 아이디 → 내부 로그인 이메일. 이메일을 그대로 넣어도 됩니다. */
export function loginEmail(id: string): string {
  const v = id.trim().toLowerCase();
  return v.includes("@") ? v : `${v}@${LOGIN_DOMAIN}`;
}

export const USERNAME_RE = /^[a-z0-9][a-z0-9._-]{2,31}$/;
