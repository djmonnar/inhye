import { USERNAME_RE } from "@/lib/supabase";
import { adminClient, emailFor, hasServiceKey, json } from "@/lib/server/admin";

export const dynamic = "force-dynamic";

/** 처음 설치할 때 한 번만: 관리자 계정이 하나도 없을 때만 동작합니다. */
export async function POST(req: Request) {
  if (!hasServiceKey()) {
    return json(
      { error: "SUPABASE_SERVICE_ROLE_KEY 환경변수가 없어요. 아래 ‘직접 만들기’ 방법을 이용하거나 키를 추가해 주세요." },
      501,
    );
  }
  const body = (await req.json().catch(() => ({}))) as { username?: string; password?: string; display_name?: string };
  const username = (body.username ?? "").trim().toLowerCase();
  const password = body.password ?? "";
  const displayName = (body.display_name ?? "").trim() || username;

  if (!USERNAME_RE.test(username)) {
    return json({ error: "아이디는 영어 소문자·숫자로 3~32자예요 (. _ - 사용 가능)." }, 400);
  }
  if (password.length < 6) return json({ error: "비밀번호는 6자 이상이에요." }, 400);

  const admin = adminClient();
  const { count, error: countError } = await admin
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("role", "admin");
  if (countError) {
    return json({ error: "DB 테이블이 아직 없어요. 1단계 SQL을 먼저 실행해 주세요." }, 412);
  }
  if ((count ?? 0) > 0) return json({ error: "이미 관리자 계정이 있어요. 로그인해 주세요." }, 409);

  const { data, error } = await admin.auth.admin.createUser({
    email: emailFor(username),
    password,
    email_confirm: true,
    user_metadata: { username, display_name: displayName },
  });
  if (error || !data.user) {
    return json({ error: error?.message ?? "계정을 만들지 못했어요." }, 400);
  }
  await admin
    .from("profiles")
    .upsert({ id: data.user.id, username, display_name: displayName, role: "admin" }, { onConflict: "id" });
  return json({ ok: true });
}
