import type { Product, ProductSource } from "./types";

/**
 * 거래처별 가격 정리 — 앱 화면과 카카오 챗봇이 같이 써요 (브라우저·서버 공용, 순수 함수).
 * 가격을 모르는 줄(null)은 맨 뒤로 보내고, 같은 값이면 최근에 확인한 줄을 앞에 둬요.
 */
export function sortSources<T extends Pick<ProductSource, "price" | "price_at">>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    if (a.price == null && b.price == null) return (b.price_at ?? "").localeCompare(a.price_at ?? "");
    if (a.price == null) return 1;
    if (b.price == null) return -1;
    if (a.price !== b.price) return a.price - b.price;
    return (b.price_at ?? "").localeCompare(a.price_at ?? "");
  });
}

/** 가격이 있는 줄 중 제일 싼 줄 (없으면 undefined) */
export function cheapest<T extends Pick<ProductSource, "price" | "price_at">>(rows: T[]): T | undefined {
  const first = sortSources(rows)[0];
  return first && first.price != null ? first : undefined;
}

/** 주 거래처보다 더 싼 곳이 있으면 그 줄과 아낄 수 있는 개당 금액 */
export function cheaperThanMain(
  product: Pick<Product, "supplier_id" | "cost_price">,
  rows: ProductSource[],
): { source: ProductSource; save: number } | null {
  const best = cheapest(rows);
  if (!best || best.price == null || best.supplier_id === product.supplier_id) return null;
  const main = rows.find((r) => r.supplier_id === product.supplier_id);
  const base = main?.price ?? (product.cost_price || null);
  if (base == null || best.price >= base) return null;
  return { source: best, save: base - best.price };
}

/** 확인한 지 오래된 가격 (기본 60일) — 다시 확인해 보라고 표시해요 */
export function isStale(priceAt: string | null | undefined, days = 60, now = Date.now()): boolean {
  if (!priceAt) return true;
  return now - new Date(priceAt).getTime() > days * 86400000;
}

/** 발주 추천 수량 — 발주 화면과 같은 계산 */
export const suggestQty = (p: Pick<Product, "safety_stock" | "stock_qty">) =>
  Math.max(p.safety_stock * 2 - p.stock_qty, p.safety_stock || 1, 1);
