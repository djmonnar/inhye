import { json, requireMember } from "@/lib/server/admin";
import { LogenError, logenSlips } from "@/lib/server/logen";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** 로젠에 접수한 주문의 송장번호 받아 오기 (ids가 없으면 ‘접수됨’ 전부) */
export async function POST(req: Request) {
  const caller = await requireMember(req);
  if (caller instanceof Response) return caller;
  const body = (await req.json().catch(() => ({}))) as { ids?: unknown };
  const ids = Array.isArray(body.ids)
    ? body.ids.filter((x): x is string => typeof x === "string" && /^[0-9a-f-]{36}$/i.test(x)).slice(0, 50)
    : null;
  try {
    return json(await logenSlips(ids && ids.length ? ids : null));
  } catch (e) {
    if (e instanceof LogenError) return json({ error: e.message }, e.status);
    console.error("[logen/slips]", e);
    return json({ error: "송장번호를 받아 오지 못했어요." }, 500);
  }
}
