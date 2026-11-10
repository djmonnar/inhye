import { adminClient } from "./admin";
import { fetchBixolonDay, PosNotReady, type PosSaleLine } from "./bixolon";

export interface PosSyncResult {
  fetched: number;
  inserted: number;
  matched: number;
  applied: number;
  unmatched: number;
  days: string[];
  linked?: number;
}

/** DB 오류를 사장님이 할 일이 보이는 문장으로 바꿔요. */
function dbError(error: { message: string; code?: string }): Error {
  if (error.code === "PGRST205" || error.code === "PGRST202" || error.code === "42P01" || error.code === "42883") {
    return new Error("Supabase에 매출 표가 아직 없어요. 설정 화면(/setup)에서 ‘앱에서 바로 실행’을 눌러 DB를 업데이트해 주세요.");
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

/** 시작 날짜로 고를 수 있는 가장 이른 날 (오늘 포함 31일) */
export function earliestSyncDay(today = kstDay(new Date())): string {
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 30);
  return d.toISOString().slice(0, 10);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * 마지막으로 성공한 날의 전날부터 오늘까지 하루씩 받아와요 (늦게 들어온 판매·반품 반영).
 * 처음이면 오늘부터 — 연동을 켠 날 이전 판매로 재고가 빠지지 않게요.
 * `from`(YYYY-MM-DD)을 주면 그날부터 받아요 — 재고를 센 날부터 빠짐없이 빼고 싶을 때.
 * 이미 반영한 날을 다시 받아도 차이만 반영돼서 안전해요.
 */
export async function syncBixolon(from?: string): Promise<PosSyncResult> {
  const db = adminClient();
  const today = kstDay(new Date());
  if (from !== undefined) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || from > today || from < earliestSyncDay(today)) {
      throw new PosBadRequest("시작 날짜는 오늘부터 30일 전까지 고를 수 있어요.");
    }
    const days = daysBetween(from, today);
    return ingestWithLinks(await fetchDays(days), days);
  }
  const { data: last } = await db
    .from("pos_sync_runs")
    .select("range_to")
    .eq("source", "bixolon")
    .eq("ok", true)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  let start = today;
  if (last?.range_to) {
    const prev = new Date(last.range_to);
    prev.setUTCDate(prev.getUTCDate() - 1);
    start = kstDay(prev) < today ? kstDay(prev) : today;
  }
  const days = daysBetween(start, today);
  return ingestWithLinks(await fetchDays(days), days);
}

/** 이름으로 코드를 먼저 이어 붙이고 저장해요 (붙이기가 실패해도 저장은 해요). */
async function ingestWithLinks(lines: PosSaleLine[], days: string[]): Promise<PosSyncResult> {
  const linked = await linkCodesByName(lines.map((l) => ({ code: l.product_code, name: l.product_name }))).catch(() => 0);
  return { ...(await ingestPosSales("bixolon", lines, days)), linked };
}

/** 하루씩 차례로 받아요. 빅솔론 방화벽(WAF)에 걸리지 않게 사이에 조금 쉬어요. */
async function fetchDays(days: string[]): Promise<PosSaleLine[]> {
  const lines: PosSaleLine[] = [];
  for (const [i, day] of days.entries()) {
    if (i > 0) await sleep(300);
    lines.push(...(await fetchBixolonDay(day)));
  }
  return lines;
}

export class PosBadRequest extends Error {}

const normName = (s: string) => s.normalize("NFC").replace(/\s+/g, " ").trim().toLowerCase();

/**
 * 빅솔론 상품 코드가 앱에 없을 때, 이름이 똑같은 앱 상품(코드 없음)이 딱 하나면 그 상품에 코드를 붙여요.
 * - 같은 이름의 앱 상품이 여러 개거나, 빅솔론에 같은 이름이 여러 코드로 있으면 헷갈리니 건너뛰어요.
 * - 코드는 빅솔론에서 온 거라 ‘빅솔론 반영 필요’ 표시는 붙기 전 상태 그대로 둬요.
 * 붙인 개수를 돌려줘요.
 */
export async function linkCodesByName(items: { code: string | null; name: string }[]): Promise<number> {
  const byName = new Map<string, Set<string>>();
  for (const it of items) {
    if (!it.code || !it.name.trim()) continue;
    const key = normName(it.name);
    byName.set(key, (byName.get(key) ?? new Set()).add(it.code));
  }
  if (!byName.size) return 0;
  const db = adminClient();
  const codes = [...new Set([...byName.values()].flatMap((s) => [...s]))];
  const { data: taken, error: e1 } = await db.from("products").select("kiosk_code").in("kiosk_code", codes);
  if (e1) throw dbError(e1);
  const takenCodes = new Set((taken ?? []).map((t) => t.kiosk_code as string));
  const { data: free, error: e2 } = await db
    .from("products")
    .select("id, name, kiosk_changed_at, kiosk_synced_at")
    .is("kiosk_code", null);
  if (e2) throw dbError(e2);
  const candidates = new Map<string, { id: string; kiosk_changed_at: string; kiosk_synced_at: string | null }[]>();
  for (const p of free ?? []) {
    const key = normName(p.name as string);
    candidates.set(key, [...(candidates.get(key) ?? []), p as { id: string; kiosk_changed_at: string; kiosk_synced_at: string | null }]);
  }
  let linked = 0;
  for (const [key, codeSet] of byName) {
    if (codeSet.size !== 1) continue;
    const code = [...codeSet][0];
    const match = candidates.get(key);
    if (takenCodes.has(code) || !match || match.length !== 1) continue;
    const p = match[0];
    const wasClean = Boolean(p.kiosk_synced_at && p.kiosk_changed_at <= p.kiosk_synced_at);
    const { data: upd, error } = await db
      .from("products")
      .update({ kiosk_code: code })
      .eq("id", p.id)
      .is("kiosk_code", null)
      .select("kiosk_changed_at")
      .maybeSingle();
    if (error || !upd) continue;
    // 코드 변경으로 붙은 ‘반영 필요’ 표시를 원래대로 (원래 깨끗했던 상품만)
    if (wasClean) await db.from("products").update({ kiosk_synced_at: upd.kiosk_changed_at }).eq("id", p.id);
    linked++;
  }
  return linked;
}

export { PosNotReady };
