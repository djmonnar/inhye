import { json, requireAdmin } from "@/lib/server/admin";
import { KakaoError, saveBriefHour } from "@/lib/server/kakao";

export const dynamic = "force-dynamic";

/** 관리자: 매일 카카오톡 알림을 보낼 한국 시각(0~23시) 정하기 */
export async function POST(req: Request) {
  const caller = await requireAdmin(req);
  if (caller instanceof Response) return caller;
  const body = (await req.json().catch(() => ({}))) as { hour?: unknown };
  const hour = Number(body.hour);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return json({ error: "0시부터 23시 사이로 골라 주세요." }, 400);
  try {
    await saveBriefHour(hour);
    return json({ ok: true });
  } catch (e) {
    return json({ error: e instanceof KakaoError ? e.message : "저장하지 못했어요." }, 500);
  }
}
