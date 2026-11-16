import { json, requireMember } from "@/lib/server/admin";
import { LogenError, logenRegister } from "@/lib/server/logen";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** 고른 택배 주문을 로젠에 접수 → 로젠 ‘주문등록출력(복수건)’에서 송장 출력 */
export async function POST(req: Request) {
  const caller = await requireMember(req);
  if (caller instanceof Response) return caller;
  const body = (await req.json().catch(() => ({}))) as { ids?: unknown };
  const ids = (Array.isArray(body.ids) ? body.ids : []).filter((x): x is string => typeof x === "string" && /^[0-9a-f-]{36}$/i.test(x));
  if (!ids.length) return json({ error: "접수할 주문을 골라 주세요." }, 400);
  try {
    return json(await logenRegister(ids.slice(0, 50)));
  } catch (e) {
    if (e instanceof LogenError) return json({ error: e.message }, e.status);
    console.error("[logen/register]", e);
    return json({ error: "로젠 접수를 하지 못했어요." }, 500);
  }
}
