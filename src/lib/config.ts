export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  "";

/** Without Supabase settings the app runs in a device-local demo mode. */
export const IS_DEMO = !SUPABASE_URL || !SUPABASE_KEY;

export const LOGIN_DOMAIN =
  process.env.NEXT_PUBLIC_LOGIN_EMAIL_DOMAIN || "inhye.local";

export const APP_NAME = "몽실창고";
export const SHOP_NAME = process.env.NEXT_PUBLIC_SHOP_NAME || "우리 소품샵";

export const IMAGE_BUCKET = "product-images";

/** Supabase project ref, used to deep-link into the dashboard. */
export const SUPABASE_REF = (() => {
  try {
    return new URL(SUPABASE_URL).hostname.split(".")[0];
  } catch {
    return "";
  }
})();
