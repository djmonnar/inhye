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

import type { PosReceipt, PosSettleItem } from "../types";

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
  categoryName?: string;
  salesQty?: number;
  salesAmount?: number;
  paymentAmount?: number;
}

/** 기간(한국 날짜 start~end) 상품별 판매 합계 — 빅솔론 응답 그대로 */
async function requestGoods(start: string, end: string): Promise<GoodsRow[]> {
  const key = env("BIXOLON_API_KEY");
  if (!key) {
    throw new PosNotReady("Vercel 환경변수에 BIXOLON_API_KEY(빅솔론 매장키)를 먼저 넣어 주세요.");
  }
  const base = (env("BIXOLON_API_BASE") || "https://api.bixolon-pos.com").replace(/\/$/, "");
  const url = `${base}/api/external/v2/sales/analysis/goods?startDate=${start}&endDate=${end}`;
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
  return rows.filter((r) => (r.goodsCode || r.goodsId) && typeof r.salesQty === "number");
}

/** 기간 상품별 판매 합계 + 빅솔론 상품 분류명 (정산용, 저장 없음) */
export async function fetchBixolonGoods(start: string, end: string): Promise<PosSettleItem[]> {
  const rows = await requestGoods(start, end);
  return rows.map((r) => ({
    code: r.goodsCode ?? null,
    name: r.goodsName ?? "",
    category: (r.categoryName ?? "").trim(),
    qty: Math.round(r.salesQty ?? 0),
    amount: Math.round(r.paymentAmount ?? r.salesAmount ?? 0),
  }));
}

/** 하루치 상품별 판매 합계 (day = 한국 날짜 YYYY-MM-DD). */
export async function fetchBixolonDay(day: string): Promise<PosSaleLine[]> {
  const rows = await requestGoods(day, day);
  return rows
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

// ---------------------------------------------------------------------------
// 영수증(건별) 매출: GET /api/external/v2/sales?startDate&endDate — 판매 즉시 조회돼요.
// 문서에 위쪽 칸 이름만 있고 salesGoods / salesPayments 안쪽 칸 이름은 없어서,
// 흔한 이름 후보를 차례로 찾아요. 실제 칸 이름은 fieldKeys 로 같이 돌려줘서 확인할 수 있어요.
// 카드 번호·승인 번호 같은 결제 세부 값은 화면에 필요 없어서 넘기지 않아요.
// ---------------------------------------------------------------------------

type Obj = Record<string, unknown>;

const asNum = (v: unknown): number | undefined =>
  typeof v === "number" && Number.isFinite(v)
    ? v
    : typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))
      ? Number(v)
      : undefined;
const asStr = (v: unknown): string | undefined =>
  typeof v === "string" && v.trim() ? v.trim() : typeof v === "number" ? String(v) : undefined;

function pick<T>(o: Obj, keys: string[], f: (v: unknown) => T | undefined): T | undefined {
  for (const k of keys) {
    const v = f(o[k]);
    if (v !== undefined) return v;
  }
  return undefined;
}

/** 시간대 표시가 없는 시각은 한국 시각으로 봐요. */
function toIso(v: unknown): string | null {
  const s = asStr(v);
  if (!s) return null;
  const local = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(s);
  const d = new Date(local ? `${s.replace(" ", "T")}+09:00` : s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

const PAYMENT_LABELS: Record<string, string> = {
  CARD: "카드",
  CREDIT_CARD: "카드",
  CASH: "현금",
  CASH_RECEIPT: "현금영수증",
  POINT: "포인트",
  COUPON: "쿠폰",
  KAKAO_PAY: "카카오페이",
  KAKAOPAY: "카카오페이",
  NAVER_PAY: "네이버페이",
  NAVERPAY: "네이버페이",
  PAYCO: "페이코",
  SAMSUNG_PAY: "삼성페이",
  ZERO_PAY: "제로페이",
  ZEROPAY: "제로페이",
  TOSS_PAY: "토스페이",
  APPLE_PAY: "애플페이",
  EASY_PAY: "간편결제",
  SIMPLE_PAY: "간편결제",
  QR: "QR결제",
};

export function normalizeReceipt(o: Obj, i: number): PosReceipt {
  const goodsRaw = Array.isArray(o.salesGoods) ? (o.salesGoods as Obj[]) : [];
  const payRaw = Array.isArray(o.salesPayments) ? (o.salesPayments as Obj[]) : [];
  return {
    id: asStr(o.id) ?? asStr(o.billNo) ?? `r${i}`,
    billNo: asStr(o.billNo) ?? null,
    device: asStr(o.deviceName) ?? null,
    status: (asStr(o.status) ?? "PAID").toUpperCase(),
    salesAmount: Math.round(asNum(o.salesAmount) ?? 0),
    paymentAmount: Math.round(asNum(o.paymentAmount) ?? asNum(o.salesAmount) ?? 0),
    discountAmount: Math.round(asNum(o.discountAmount) ?? 0),
    at: toIso(o.paidAt) ?? toIso(o.orderedAt),
    cancelledAt: toIso(o.cancelledAt),
    returnedAt: toIso(o.returnedAt),
    goods: goodsRaw.map((g) => ({
      code: pick(g, ["goodsCode", "code", "productCode", "itemCode"], asStr) ?? null,
      name: pick(g, ["goodsName", "name", "productName", "itemName"], asStr) ?? "",
      qty: Math.round(pick(g, ["salesQty", "qty", "quantity", "goodsQty", "count", "orderQty"], asNum) ?? 0),
      amount: Math.round(
        pick(g, ["paymentAmount", "salesAmount", "amount", "totalAmount", "goodsAmount", "price"], asNum) ?? 0,
      ),
    })),
    payments: payRaw.map((p) => {
      const raw = pick(p, ["paymentTypeName", "paymentName", "paymentType", "paymentMethod", "payType", "type", "name"], asStr) ?? "";
      const label = PAYMENT_LABELS[raw.toUpperCase()] ?? (raw || "기타");
      const card = pick(p, ["cardName", "issuerName", "acquirerName", "cardCompanyName"], asStr);
      return {
        method: card && label === "카드" ? `카드 (${card})` : label,
        amount: Math.round(pick(p, ["paymentAmount", "amount", "approvalAmount", "payAmount"], asNum) ?? 0),
      };
    }),
  };
}

const keysOf = (rows: Obj[]) => [...new Set(rows.flatMap((r) => (r && typeof r === "object" ? Object.keys(r) : [])))].sort();

/** 하루치 영수증 (day = 한국 날짜 YYYY-MM-DD). */
export async function fetchBixolonReceipts(
  day: string,
): Promise<{ receipts: PosReceipt[]; fieldKeys: { receipt: string[]; goods: string[]; payments: string[] } }> {
  const key = env("BIXOLON_API_KEY");
  if (!key) throw new PosNotReady("Vercel 환경변수에 BIXOLON_API_KEY(빅솔론 매장키)를 먼저 넣어 주세요.");
  const base = (env("BIXOLON_API_BASE") || "https://api.bixolon-pos.com").replace(/\/$/, "");
  const res = await fetch(`${base}/api/external/v2/sales?startDate=${day}&endDate=${day}`, {
    headers: { accept: "application/json", authorization: key },
    cache: "no-store",
  });
  if (res.status === 401) {
    throw new Error("빅솔론이 매장키를 받아주지 않았어요 (HTTP 401). Vercel의 BIXOLON_API_KEY를 확인해 주세요.");
  }
  if (res.status === 403 || res.status === 429) {
    throw new Error(`빅솔론이 잠시 요청을 막았어요 (HTTP ${res.status}). 몇 분 뒤에 다시 해 주세요.`);
  }
  if (!res.ok) throw new Error(`빅솔론 응답 오류 (HTTP ${res.status})`);
  const data = (await res.json().catch(() => null)) as Obj[] | { data?: Obj[] } | null;
  const rows = Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : null;
  if (!rows) throw new Error("빅솔론 응답 형식이 예상과 달라요.");
  return {
    receipts: rows.map(normalizeReceipt),
    fieldKeys: {
      receipt: keysOf(rows),
      goods: keysOf(rows.flatMap((r) => (Array.isArray(r.salesGoods) ? (r.salesGoods as Obj[]) : []))),
      payments: keysOf(rows.flatMap((r) => (Array.isArray(r.salesPayments) ? (r.salesPayments as Obj[]) : []))),
    },
  };
}
