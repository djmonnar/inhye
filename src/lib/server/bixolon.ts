/**
 * 빅솔론 매장솔루션(ASP) 매출 연동.
 *
 * 키는 Vercel 환경변수에만 둬요 (브라우저로 절대 안 나가요):
 *   BIXOLON_STORE_ID   매장 ID (연동 키 발급 화면의 ‘매장 ID’)
 *   BIXOLON_API_KEY    발급된 API 키
 *   BIXOLON_API_BASE   API 주소 — 빅솔론 연동 명세서를 받으면 넣어요
 *
 * fetchBixolonSales()만 빅솔론 명세에 맞춰 채우면 나머지(저장·상품 연결·재고 차감·매출 화면)는
 * 이미 동작해요.
 */

export interface PosSaleLine {
  /** 원본에서 유일한 값 (예: 주문번호-줄번호). 같은 값이 다시 와도 한 번만 저장돼요. */
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
  return { storeId, apiKey, apiBase, adapterReady: ADAPTER_READY && storeId && apiKey && apiBase };
}

/** 빅솔론 API 명세에 맞춰 fetchBixolonSales를 구현하면 true로 바꿔요. */
const ADAPTER_READY = false;

export async function fetchBixolonSales(range: { from: Date; to: Date }): Promise<PosSaleLine[]> {
  void range;
  const s = bixolonStatus();
  if (!s.storeId || !s.apiKey) {
    throw new PosNotReady("Vercel 환경변수에 BIXOLON_STORE_ID와 BIXOLON_API_KEY를 먼저 넣어 주세요.");
  }
  throw new PosNotReady(
    "빅솔론 매출 API의 주소와 요청 형식(연동 명세서)을 받으면 바로 연결할게요. 키는 준비됐어요.",
  );
}
