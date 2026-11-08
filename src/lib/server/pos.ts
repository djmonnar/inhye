import { adminClient } from "./admin";
import { fetchBixolonSales, PosNotReady, type PosSaleLine } from "./bixolon";

export interface PosSyncResult {
  fetched: number;
  inserted: number;
  matched: number;
  applied: number;
  unmatched: number;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/** 판매 줄을 저장하고(중복은 무시) 상품 연결 + 재고 차감까지 해요. 실행 기록도 남겨요. */
export async function ingestPosSales(
  source: string,
  lines: PosSaleLine[],
  range: { from: Date; to: Date },
): Promise<PosSyncResult> {
  const db = adminClient();
  const { data: run } = await db
    .from("pos_sync_runs")
    .insert({ source, range_from: range.from.toISOString(), range_to: range.to.toISOString() })
    .select("id")
    .single();
  try {
    let inserted = 0;
    for (const part of chunk(lines, 500)) {
      const { data, error } = await db
        .from("pos_sales")
        .upsert(
          part.map((l) => ({ ...l, source })),
          { onConflict: "source,external_id", ignoreDuplicates: true },
        )
        .select("id");
      if (error) throw new Error(error.message);
      inserted += data?.length ?? 0;
    }
    const { data: applied, error } = await db.rpc("apply_pos_sales");
    if (error) throw new Error(error.message);
    const a = (applied ?? {}) as { matched?: number; applied?: number; unmatched?: number };
    const result = {
      fetched: lines.length,
      inserted,
      matched: a.matched ?? 0,
      applied: a.applied ?? 0,
      unmatched: a.unmatched ?? 0,
    };
    if (run) {
      await db
        .from("pos_sync_runs")
        .update({ ok: true, finished_at: new Date().toISOString(), ...result })
        .eq("id", run.id);
    }
    return result;
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

export async function syncBixolon(days: number): Promise<PosSyncResult> {
  const to = new Date();
  const from = new Date(to.getTime() - days * 86400000);
  const lines = await fetchBixolonSales({ from, to });
  return ingestPosSales("bixolon", lines, { from, to });
}

export { PosNotReady };
