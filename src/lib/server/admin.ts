import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { LOGIN_DOMAIN, SUPABASE_KEY, SUPABASE_URL } from "../config";

/** Also accepts prefixed names from the Vercel integration (e.g. STORAGE_SUPABASE_SERVICE_ROLE_KEY). */
const SERVICE_KEY = (() => {
  const names = ["SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEY"];
  for (const n of names) if (process.env[n]) return process.env[n] as string;
  for (const n of names) {
    const key = Object.keys(process.env).find((k) => k.endsWith(n) && process.env[k]);
    if (key) return process.env[key] as string;
  }
  return "";
})();

export const hasServiceKey = () => Boolean(SUPABASE_URL && SERVICE_KEY);

export function adminClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function emailFor(username: string): string {
  return `${username.trim().toLowerCase()}@${LOGIN_DOMAIN}`;
}

export function json(body: unknown, status = 200) {
  return Response.json(body, { status });
}

/** Returns the caller's id when the bearer token belongs to one of `roles`. */
async function requireRole(req: Request, roles: string[], denied: string): Promise<string | Response> {
  if (!hasServiceKey()) {
    return json({ error: "서버에 SUPABASE_SERVICE_ROLE_KEY가 설정되지 않았어요. Vercel 환경변수를 확인해 주세요." }, 501);
  }
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "로그인이 필요해요." }, 401);
  const anon = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });
  const { data, error } = await anon.auth.getUser(token);
  if (error || !data.user) return json({ error: "로그인이 만료됐어요. 다시 로그인해 주세요." }, 401);
  const { data: profile } = await adminClient().from("profiles").select("role").eq("id", data.user.id).maybeSingle();
  if (!roles.includes(profile?.role ?? "")) return json({ error: denied }, 403);
  return data.user.id;
}

export const requireAdmin = (req: Request) => requireRole(req, ["admin"], "관리자만 할 수 있어요.");

/** Admins and approved staff — not accounts still waiting for approval. */
export const requireMember = (req: Request) =>
  requireRole(req, ["admin", "staff"], "승인된 직원만 쓸 수 있어요. 관리자에게 승인을 요청해 주세요.");
