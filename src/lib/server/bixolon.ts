/**
 * 빅솔론 매장솔루션 외부 매출 API (빅솔론 ‘외부 매출 API 연동 안내’ 2026-11-10 기준).
 *
 *   GET https://api.bixolon-pos.com/api/external/v2/sales/analysis/goods?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
 *   헤더: Authorization: {매장키}   ← 키를 그대로 (Bearer 같은 말 없이). 매장은 키로 구분해서 다른 헤더는 필요 없어요.
 *   응답: 상품별 합계 [{ goodsId, goodsCode, goodsName, salesQty, salesAmount, paymentAmount, ... }], 없으면 []
 *
 * - 합계 조회는 판매 후 최대 10분 뒤에 반영돼요 (건별 조회 /api/external/v2/sales 는 바로).
 * - 너무 자주 부르면 방화벽(WAF)에 막힐 수 있어요 → 하루 단위로, 필요할 때만 불러요.
 *
 * 키는 Vercel 환경변수에만 둬요 (브라우저로 절대 안 나가요):
 *   BIXOLON_API_KEY   ASP ‘외부 연결 관리 → 연동 키 발급’에서 받은 매장키
 *   BIXOLON_API_BASE  (선택) 기본 https://api.bixolon-pos.com
 */

export interface PosSaleLine {
  /** 원본에서 유일한 값. 같은 값이 다시 오면 수량·금액만 갱신돼요. */
  external_id: string;
  sold_at: string;
  product_code: string | null;
  barcode: string | null;
  product_name: string;
  /** 반품·취소는 음수 */
  qty: number;
  amount: number;
  payment: string | null;
  raw: unknown;
}

export class PosNotReady extends Error {}

const env = (name: string) => (process.env[name] ?? "").trim();

export function bixolonStatus() {
  const apiKey = Boolean(env("BIXOLON_API_KEY"));
  const apiBase = Boolean(env("BIXOLON_API_BASE"));
  return { apiKey, apiBase, adapterReady: apiKey };
}

interface GoodsRow {
  goodsId?: number;
  goodsCode?: string;
  goodsName?: string;
  salesQty?: number;
  salesAmount?: number;
  paymentAmount?: number;
}

/** 하루치 상품별 판매 합계 (day = 한국 날짜 YYYY-MM-DD). */
export async function fetchBixolonDay(day: string): Promise<PosSaleLine[]> {
  const key = env("BIXOLON_API_KEY");
  if (!key) {
    throw new PosNotReady("Vercel 환경변수에 BIXOLON_API_KEY(빅솔론 매장키)를 먼저 넣어 주세요.");
  }
  const base = (env("BIXOLON_API_BASE") || "https://api.bixolon-pos.com").replace(/\/$/, "");
  const url = `${base}/api/external/v2/sales/analysis/goods?startDate=${day}&endDate=${day}`;
  const res = await fetch(url, { headers: { accept: "application/json", authorization: key }, cache: "no-store" });
  if (res.status === 401) {
    throw new Error(
      "빅솔론이 매장키를 받아주지 않았어요 (HTTP 401). 키를 새로 발급했다면 Vercel의 BIXOLON_API_KEY도 바꾸고 Redeploy 해 주세요.",
    );
  }
  if (res.status === 403 || res.status === 429) {
    throw new Error(`빅솔론이 잠시 요청을 막았어요 (HTTP ${res.status}). 너무 자주 눌렀다면 몇 분 뒤에 다시 해 주세요.`);
  }
  if (!res.ok) throw new Error(`빅솔론 응답 오류 (HTTP ${res.status})`);
  const data = (await res.json().catch(() => null)) as GoodsRow[] | { data?: GoodsRow[] } | null;
  const rows = Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : null;
  if (!rows) throw new Error("빅솔론 응답 형식이 예상과 달라요.");
  return rows
    .filter((r) => (r.goodsCode || r.goodsId) && typeof r.salesQty === "number")
    .map((r) => ({
      external_id: `goods:${day}:${r.goodsId ?? r.goodsCode}`,
      sold_at: `${day}T00:00:00+09:00`,
      product_code: r.goodsCode ?? null,
      barcode: null,
      product_name: r.goodsName ?? "",
      qty: Math.round(r.salesQty ?? 0),
      amount: Math.round(r.paymentAmount ?? r.salesAmount ?? 0),
      payment: null,
      raw: r,
    }));
}
