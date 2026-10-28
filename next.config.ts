import type { NextConfig } from "next";

/**
 * Supabase 값을 찾아요. Vercel 연동은 이름 앞에 접두어(예: STORAGE_)를 붙이거나
 * NEXT_PUBLIC_ 없이 넣기도 해서, 끝부분이 맞는 이름도 받아줘요.
 */
function findEnv(...names: string[]): string | undefined {
  for (const n of names) if (process.env[n]) return process.env[n];
  for (const n of names) {
    const key = Object.keys(process.env).find((k) => k.endsWith(n) && process.env[k]);
    if (key) return process.env[key];
  }
  return undefined;
}

const supabaseUrl = findEnv("NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_URL");
const supabaseKey = findEnv(
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_ANON_KEY",
);

const supabaseHost = (() => {
  try {
    return new URL(supabaseUrl ?? "").hostname;
  } catch {
    return undefined;
  }
})();

const nextConfig: NextConfig = {
  reactStrictMode: true,
  env: {
    ...(supabaseUrl ? { NEXT_PUBLIC_SUPABASE_URL: supabaseUrl } : {}),
    ...(supabaseKey ? { NEXT_PUBLIC_SUPABASE_ANON_KEY: supabaseKey } : {}),
  },
  images: supabaseHost
    ? { remotePatterns: [{ protocol: "https", hostname: supabaseHost }] }
    : undefined,
};

export default nextConfig;
