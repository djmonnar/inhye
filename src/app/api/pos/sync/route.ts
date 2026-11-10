import { json, requireAdmin } from "@/lib/server/admin";
import { PosBadRequest, PosNotReady, syncBixolon } from "@/lib/server/pos";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** 관리자가 ‘지금 가져오기’를 누르면 마지막 가져오기 이후 매출을 빅솔론에서 받아와요. */
export async function POST(req: Request) {
  const caller = await requireAdmin(req);
  if (caller instanceof Response) return caller;
  const body = (await req.json().catch(() => ({}))) as { from?: unknown };
  const from = typeof body.from === "string" && body.from ? body.from : undefined;
  try {
    return json({ ok: true, ...(await syncBixolon(from)) });
  } catch (e) {
    if (e instanceof PosNotReady) return json({ error: e.message, notReady: true }, 501);
    if (e instanceof PosBadRequest) return json({ error: e.message }, 400);
    return json({ error: e instanceof Error ? e.message : "가져오지 못했어요." }, 502);
  }
}
