import { USERNAME_RE } from "@/lib/supabase";
import { adminClient, emailFor, json, requireAdmin } from "@/lib/server/admin";

export const dynamic = "force-dynamic";

type Body = { id?: string; username?: string; password?: string; display_name?: string; role?: string };

async function readBody(req: Request): Promise<Body> {
  return (await req.json().catch(() => ({}))) as Body;
}

export async function POST(req: Request) {
  const caller = await requireAdmin(req);
  if (caller instanceof Response) return caller;
  const body = await readBody(req);
  const username = (body.username ?? "").trim().toLowerCase();
  const password = body.password ?? "";
  const displayName = (body.display_name ?? "").trim() || username;
  const role = body.role === "admin" ? "admin" : "staff";

  if (!USERNAME_RE.test(username)) {
    return json({ error: "아이디는 영어 소문자·숫자로 3~32자예요 (. _ - 사용 가능)." }, 400);
  }
  if (password.length < 6) return json({ error: "비밀번호는 6자 이상이에요." }, 400);

  const admin = adminClient();
  const { data: taken } = await admin.from("profiles").select("id").eq("username", username).maybeSingle();
  if (taken) return json({ error: "이미 있는 아이디예요." }, 409);

  const { data, error } = await admin.auth.admin.createUser({
    email: emailFor(username),
    password,
    email_confirm: true,
    user_metadata: { username, display_name: displayName },
  });
  if (error || !data.user) {
    const msg = error?.message ?? "";
    return json({ error: msg.includes("already") ? "이미 있는 아이디예요." : msg || "계정을 만들지 못했어요." }, 400);
  }
  await admin
    .from("profiles")
    .upsert({ id: data.user.id, username, display_name: displayName, role }, { onConflict: "id" });
  return json({ ok: true });
}

export async function PATCH(req: Request) {
  const caller = await requireAdmin(req);
  if (caller instanceof Response) return caller;
  const body = await readBody(req);
  if (!body.id) return json({ error: "대상이 없어요." }, 400);
  if (!body.password || body.password.length < 6) return json({ error: "비밀번호는 6자 이상이에요." }, 400);
  const { error } = await adminClient().auth.admin.updateUserById(body.id, { password: body.password });
  if (error) return json({ error: error.message }, 400);
  return json({ ok: true });
}

export async function DELETE(req: Request) {
  const caller = await requireAdmin(req);
  if (caller instanceof Response) return caller;
  const body = await readBody(req);
  if (!body.id) return json({ error: "대상이 없어요." }, 400);
  if (body.id === caller) return json({ error: "내 계정은 삭제할 수 없어요." }, 400);
  const { error } = await adminClient().auth.admin.deleteUser(body.id);
  if (error) return json({ error: error.message }, 400);
  return json({ ok: true });
}
