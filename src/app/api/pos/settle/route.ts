import { json, requireMember } from "@/lib/server/admin";
import { fetchBixolonGoods, PosNotReady } from "@/lib/server/bixolon";
import { kstDay } from "@/lib/server/pos";
import type { PosSettle } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * A/B 정산용: 기간(최대 31일) 상품별 판매를 빅솔론 분류명과 같이 바로 받아요 (저장 없음).
 * 빅솔론은 너무 자주 부르면 막으니(WAF) 같은 기간은 1분 동안 재사용해요.
 */
const cache = new Map<string, PosSettle>();
const CACHE_MS = 60_000;
const MAX_DAYS = 31;

const isDay = (v: string | null): v is string => Boolean(v && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)));

export async function GET(req: Request) {
  const caller = await requireMember(req);
  if (caller instanceof Response) return caller;

  const q = new URL(req.url).searchParams;
  const start = q.get("start");
  const end = q.get("end");
  const today = kstDay(new Date());
  if (!isDay(start) || !isDay(end) || start > end || end > today) {
    return json({ error: "기간이 올바르지 않아요. 시작일 ≤ 끝날 ≤ 오늘로 골라 주세요." }, 400);
  }
  const days = Math.round((Date.parse(end) - Date.parse(start)) / 86400000) + 1;
  if (days > MAX_DAYS) return json({ error: `한 번에 ${MAX_DAYS}일까지 볼 수 있어요. 기간을 줄여 주세요.` }, 400);

  const key = `${start}~${end}`;
  const hit = cache.get(key);
  if (hit && Date.now() - new Date(hit.fetchedAt).getTime() < CACHE_MS) return json(hit);

  try {
    const items = await fetchBixolonGoods(start, end);
    const out: PosSettle = { start, end, fetchedAt: new Date().toISOString(), items };
    cache.set(key, out);
    return json(out);
  } catch (e) {
    if (e instanceof PosNotReady) return json({ error: e.message }, 501);
    return json({ error: e instanceof Error ? e.message : "빅솔론에서 받아오지 못했어요." }, 502);
  }
}
