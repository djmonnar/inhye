import { json, requireAdmin } from "@/lib/server/admin";
import { PosNotReady, syncBixolon } from "@/lib/server/pos";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** 관리자가 ‘지금 가져오기’를 누르면 최근 N일 매출을 빅솔론에서 받아와요. */
export async function POST(req: Request) {
  const caller = await requireAdmin(req);
  if (caller instanceof Response) return caller;
  const body = (await req.json().catch(() => ({}))) as { days?: number };
  const days = Math.min(31, Math.max(1, Math.round(body.days ?? 3)));
  try {
    return json({ ok: true, ...(await syncBixolon(days)) });
  } catch (e) {
    if (e instanceof PosNotReady) return json({ error: e.message, notReady: true }, 501);
    return json({ error: e instanceof Error ? e.message : "가져오지 못했어요." }, 502);
  }
}
