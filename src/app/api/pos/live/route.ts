import { json, requireMember } from "@/lib/server/admin";
import { fetchBixolonDay, PosNotReady } from "@/lib/server/bixolon";
import { kstDay } from "@/lib/server/pos";
import type { PosLive } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * 빅솔론 하루치 상품별 판매를 바로 받아서 보여주기만 해요 (DB 저장·재고 차감 없음).
 * DB 표가 없어도 돼요. 빅솔론은 너무 자주 부르면 막으니(WAF) 같은 날짜는 1분 동안 재사용해요.
 */
const cache = new Map<string, PosLive>();
const CACHE_MS = 60_000;

export async function GET(req: Request) {
  const caller = await requireMember(req);
  if (caller instanceof Response) return caller;

  const today = kstDay(new Date());
  const day = new URL(req.url).searchParams.get("day") ?? today;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || day > today) {
    return json({ error: "날짜가 올바르지 않아요." }, 400);
  }

  const hit = cache.get(day);
  if (hit && Date.now() - new Date(hit.fetchedAt).getTime() < CACHE_MS) return json(hit);

  try {
    const lines = await fetchBixolonDay(day);
    const live: PosLive = {
      day,
      fetchedAt: new Date().toISOString(),
      items: lines.map((l) => ({ code: l.product_code, name: l.product_name, qty: l.qty, amount: l.amount })),
    };
    cache.set(day, live);
    return json(live);
  } catch (e) {
    if (e instanceof PosNotReady) return json({ error: e.message }, 501);
    return json({ error: e instanceof Error ? e.message : "빅솔론에서 받아오지 못했어요." }, 502);
  }
}
