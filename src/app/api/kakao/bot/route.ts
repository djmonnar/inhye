import { randomInt } from "node:crypto";
import { adminClient, json, requireMember } from "@/lib/server/admin";
import { appUrl } from "@/lib/server/kakao";
import type { KakaoBotStatus, Role } from "@/lib/types";

export const dynamic = "force-dynamic";

/** 카카오 챗봇 연결 관리 (앱 → 더보기 → 카카오 챗봇). 표는 서버만 읽고 써요. */

async function roleOf(id: string): Promise<Role> {
  const { data } = await adminClient().from("profiles").select("role").eq("id", id).maybeSingle();
  return (data?.role as Role) ?? "pending";
}

function tableMissing(error: { code?: string } | null) {
  return error?.code === "PGRST205" || error?.code === "42P01";
}
const NEED_SCHEMA = "DB에 챗봇 표가 아직 없어요. 설정 화면에서 DB 업데이트(스키마 v6)를 먼저 해 주세요.";

export async function GET(req: Request) {
  const caller = await requireMember(req);
  if (caller instanceof Response) return caller;
  const sb = adminClient();
  const isAdmin = (await roleOf(caller)) === "admin";
  let q = sb.from("kakao_bot_users").select("bot_user_key, profile_id, linked_at, last_seen_at, profiles(display_name, username, role)");
  if (!isAdmin) q = q.eq("profile_id", caller);
  const { data, error } = await q.order("linked_at", { ascending: false });
  if (error) return json({ error: tableMissing(error) ? NEED_SCHEMA : error.message }, tableMissing(error) ? 409 : 500);

  type Row = {
    bot_user_key: string;
    profile_id: string;
    linked_at: string;
    last_seen_at: string | null;
    profiles: { display_name: string; username: string; role: Role } | { display_name: string; username: string; role: Role }[] | null;
  };
  const status: KakaoBotStatus = {
    secretConfigured: Boolean((process.env.KAKAO_SKILL_SECRET ?? "").trim()),
    skillUrl: `${appUrl(new URL(req.url).origin)}/api/kakao/skill`,
    links: ((data ?? []) as Row[]).map((r) => {
      const p = Array.isArray(r.profiles) ? r.profiles[0] : r.profiles;
      return {
        key: r.bot_user_key,
        name: p?.display_name || p?.username || "알 수 없음",
        role: p?.role ?? "pending",
        linked_at: r.linked_at,
        last_seen_at: r.last_seen_at,
        mine: r.profile_id === caller,
      };
    }),
  };
  return json(status);
}

/** 내 계정 연결 코드 (6자리, 10분, 한 번만) */
export async function POST(req: Request) {
  const caller = await requireMember(req);
  if (caller instanceof Response) return caller;
  const sb = adminClient();
  await sb.from("kakao_bot_codes").delete().or(`profile_id.eq.${caller},expires_at.lt.${new Date().toISOString()}`);
  const expires_at = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  for (let i = 0; i < 5; i++) {
    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    const { error } = await sb.from("kakao_bot_codes").insert({ code, profile_id: caller, expires_at });
    if (!error) return json({ code, expires_at });
    if (tableMissing(error)) return json({ error: NEED_SCHEMA }, 409);
    if (error.code !== "23505") return json({ error: error.message }, 500);
  }
  return json({ error: "코드를 만들지 못했어요. 다시 눌러 주세요." }, 500);
}

/** 연결 끊기: 내 것, 관리자는 누구 것이든 */
export async function DELETE(req: Request) {
  const caller = await requireMember(req);
  if (caller instanceof Response) return caller;
  const { key } = (await req.json().catch(() => ({}))) as { key?: string };
  if (!key) return json({ error: "끊을 연결을 골라 주세요." }, 400);
  const sb = adminClient();
  let q = sb.from("kakao_bot_users").delete().eq("bot_user_key", key);
  if ((await roleOf(caller)) !== "admin") q = q.eq("profile_id", caller);
  const { data, error } = await q.select("bot_user_key");
  if (error) return json({ error: error.message }, 500);
  if (!data?.length) return json({ error: "끊을 수 있는 연결이 아니에요." }, 403);
  await sb.from("kakao_bot_sessions").delete().eq("bot_user_key", key);
  return json({ ok: true });
}
