import { adminClient } from "./admin";
import { fetchBixolonDay, PosNotReady, type PosSaleLine } from "./bixolon";

export interface PosSyncResult {
  fetched: number;
  inserted: number;
  matched: number;
  applied: number;
  unmatched: number;
  days: string[];
}

/** DB 오류를 사장님이 할 일이 보이는 문장으로 바꿔요. */
function dbError(error: { message: string; code?: string }): Error {
  if (error.code === "PGRST205" || error.code === "PGRST202" || error.code === "42P01" || error.code === "42883") {
    return new Error("Supabase에 매출 표가 아직 없어요. 설정 화면(/setup)에서 SQL을 복사해 Supabase SQL 편집기에서 다시 실행해 주세요.");
  }
  return new Error(error.message);
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/** 한국 날짜 YYYY-MM-DD */
export function kstDay(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

function daysBetween(from: string, to: string): string[] {
  const out: string[] = [];
  const d = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  while (d <= end && out.length < 31) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

/**
 * 판매 행을 저장(같은 external_id면 수량·금액 갱신)하고 상품 연결 + 재고 차감까지 해요.
 * 실행 기록도 남겨요.
 */
export async function ingestPosSales(source: string, lines: PosSaleLine[], days: string[]): Promise<PosSyncResult> {
  const db = adminClient();
  const { data: run } = await db
    .from("pos_sync_runs")
    .insert({
      source,
      range_from: `${days[0]}T00:00:00+09:00`,
      range_to: `${days[days.length - 1]}T00:00:00+09:00`,
    })
    .select("id")
    .single();
  try {
    let inserted = 0;
    for (const part of chunk(lines, 500)) {
      const { data, error } = await db
        .from("pos_sales")
        .upsert(
          part.map((l) => ({ ...l, source })),
          { onConflict: "source,external_id" },
        )
        .select("id");
      if (error) throw dbError(error);
      inserted += data?.length ?? 0;
    }
    const { data: applied, error } = await db.rpc("apply_pos_sales");
    if (error) throw dbError(error);
    const a = (applied ?? {}) as { matched?: number; applied?: number; unmatched?: number };
    const result = {
      fetched: lines.length,
      inserted,
      matched: a.matched ?? 0,
      applied: a.applied ?? 0,
      unmatched: a.unmatched ?? 0,
    };
    if (run) {
      await db.from("pos_sync_runs").update({ ok: true, finished_at: new Date().toISOString(), ...result }).eq("id", run.id);
    }
    return { ...result, days };
  } catch (e) {
    if (run) {
      await db
        .from("pos_sync_runs")
        .update({ ok: false, finished_at: new Date().toISOString(), error: e instanceof Error ? e.message : String(e) })
        .eq("id", run.id);
    }
    throw e;
  }
}

/**
 * 마지막으로 성공한 날의 전날부터 오늘까지 하루씩 받아와요 (늦게 들어온 판매·반품 반영).
 * 처음이면 오늘부터 — 연동을 켠 날 이전 판매로 재고가 빠지지 않게요.
 */
export async function syncBixolon(): Promise<PosSyncResult> {
  const db = adminClient();
  const today = kstDay(new Date());
  const { data: last } = await db
    .from("pos_sync_runs")
    .select("range_to")
    .eq("source", "bixolon")
    .eq("ok", true)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  let from = today;
  if (last?.range_to) {
    const prev = new Date(last.range_to);
    prev.setUTCDate(prev.getUTCDate() - 1);
    from = kstDay(prev) < today ? kstDay(prev) : today;
  }
  const days = daysBetween(from, today);
  const lines: PosSaleLine[] = [];
  for (const day of days) lines.push(...(await fetchBixolonDay(day)));
  return ingestPosSales("bixolon", lines, days);
}

export { PosNotReady };
