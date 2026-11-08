/**
 * 빅솔론 매장솔루션(ASP) 매출 연동.
 *
 * 빅솔론 관리자 화면(www.bixolon-pos.com)이 쓰는 API를 그대로 불러요:
 *   GET https://api.bixolon-pos.com/api/v2/sales/analysis/goods?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
 *   헤더: shop-id(매장 ID), brand-id·hq-id·agency-id(있으면), authorization
 *   응답: 상품별 합계 [{ goodsId, goodsCode, goodsName, salesQty, salesAmount, paymentAmount, ... }]
 *
 * 키는 Vercel 환경변수에만 둬요 (브라우저로 절대 안 나가요):
 *   BIXOLON_STORE_ID     매장 ID (연동 키 발급 화면의 ‘매장 ID’)
 *   BIXOLON_API_KEY      발급된 API 키
 *   BIXOLON_BRAND_ID / BIXOLON_HQ_ID / BIXOLON_AGENCY_ID   (선택) 관리자 화면이 같이 보내는 값
 *   BIXOLON_AUTH_SCHEME  (선택) authorization 앞에 붙일 말. 기본 "Bearer", 없이 보내려면 "none"
 *   BIXOLON_API_BASE     (선택) 기본 https://api.bixolon-pos.com
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
  const storeId = Boolean(env("BIXOLON_STORE_ID"));
  const apiKey = Boolean(env("BIXOLON_API_KEY"));
  const apiBase = Boolean(env("BIXOLON_API_BASE"));
  return { storeId, apiKey, apiBase, adapterReady: storeId && apiKey };
}

interface GoodsRow {
  goodsId?: number;
  goodsCode?: string;
  goodsName?: string;
  salesQty?: number;
  salesAmount?: number;
  paymentAmount?: number;
}

function headers(): Record<string, string> {
  const scheme = env("BIXOLON_AUTH_SCHEME") || "Bearer";
  const key = env("BIXOLON_API_KEY");
  const h: Record<string, string> = {
    accept: "application/json",
    "shop-id": env("BIXOLON_STORE_ID"),
    authorization: scheme.toLowerCase() === "none" ? key : `${scheme} ${key}`,
  };
  for (const [name, v] of [
    ["brand-id", "BIXOLON_BRAND_ID"],
    ["hq-id", "BIXOLON_HQ_ID"],
    ["agency-id", "BIXOLON_AGENCY_ID"],
  ] as const) {
    if (env(v)) h[name] = env(v);
  }
  return h;
}

/** 하루치 상품별 판매 합계 (day = 한국 날짜 YYYY-MM-DD). */
export async function fetchBixolonDay(day: string): Promise<PosSaleLine[]> {
  const s = bixolonStatus();
  if (!s.storeId || !s.apiKey) {
    throw new PosNotReady("Vercel 환경변수에 BIXOLON_STORE_ID와 BIXOLON_API_KEY를 먼저 넣어 주세요.");
  }
  const base = (env("BIXOLON_API_BASE") || "https://api.bixolon-pos.com").replace(/\/$/, "");
  const url = `${base}/api/v2/sales/analysis/goods?startDate=${day}&endDate=${day}`;
  const res = await fetch(url, { headers: headers(), cache: "no-store" });
  if (res.status === 401 || res.status === 403) {
    throw new Error(
      `빅솔론이 연동 키를 받아주지 않았어요 (HTTP ${res.status}). 키를 새로 발급했다면 Vercel의 BIXOLON_API_KEY도 바꿔 주세요.`,
    );
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
