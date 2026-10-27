import type { Product } from "./types";

const wonFmt = new Intl.NumberFormat("ko-KR");

export function won(n: number | null | undefined): string {
  return `${wonFmt.format(Math.round(n ?? 0))}원`;
}

export function num(n: number | null | undefined): string {
  return wonFmt.format(Math.round(n ?? 0));
}

/** Parses "3,500원" / " 3500 " / 3500 into an integer, or 0. */
export function parseNum(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? Math.round(v) : 0;
  if (typeof v !== "string") return 0;
  const cleaned = v.replace(/[^\d.-]/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

export interface Margin {
  amount: number;
  /** Margin as a share of the sale price (0–100). */
  rate: number;
  /** Sale price ÷ cost. */
  markup: number;
}

export function margin(cost: number, price: number): Margin {
  const amount = price - cost;
  return {
    amount,
    rate: price > 0 ? (amount / price) * 100 : 0,
    markup: cost > 0 ? price / cost : 0,
  };
}

/** Rounds a price up to the next `unit` (default 100원). */
export function roundPrice(n: number, unit = 100): number {
  if (n <= 0) return 0;
  return Math.ceil(n / unit) * unit;
}

export function suggestPrices(cost: number): { label: string; price: number }[] {
  if (cost <= 0) return [];
  const unit = cost * 2 >= 10000 ? 1000 : 500;
  return [2, 2.5, 3].map((x) => ({
    label: `×${x}`,
    price: roundPrice(cost * x, unit),
  }));
}

export function relTime(iso: string | null | undefined): string {
  if (!iso) return "-";
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "방금";
  if (min < 60) return `${min}분 전`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}시간 전`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}일 전`;
  return shortDate(iso);
}

export function shortDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear() % 100}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

export function normalizeBarcode(v: string | null | undefined): string | null {
  const s = (v ?? "").replace(/\s+/g, "").trim();
  return s ? s : null;
}

export function ean13CheckDigit(first12: string): number {
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const d = Number(first12[i]);
    sum += i % 2 === 0 ? d : d * 3;
  }
  return (10 - (sum % 10)) % 10;
}

export function isValidEan13(code: string): boolean {
  return /^\d{13}$/.test(code) && ean13CheckDigit(code.slice(0, 12)) === Number(code[12]);
}

/**
 * Next in-store EAN-13 (prefix 200 = 매장 내부용 번호 대역, never clashes with
 * manufacturer barcodes).
 */
export function nextStoreBarcode(products: Pick<Product, "barcode">[]): string {
  let max = 0;
  for (const p of products) {
    const b = p.barcode;
    if (b && /^200\d{10}$/.test(b)) max = Math.max(max, Number(b.slice(3, 12)));
  }
  const body = `200${String(max + 1).padStart(9, "0")}`;
  return body + ean13CheckDigit(body);
}

export function hostOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`);
    return u.hostname.replace(/^(www|m)\./, "").toLowerCase();
  } catch {
    return null;
  }
}

export function ensureUrl(url: string): string {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

/** Well-known Korean sourcing sites, for naming a supplier from a pasted link. */
const KNOWN_SITES: [string, string][] = [
  ["domeggook.com", "도매꾹"],
  ["domeme.com", "도매매"],
  ["ownerclan.com", "오너클랜"],
  ["sinsangmarket.kr", "신상마켓"],
  ["onch3.co.kr", "온채널"],
  ["1688.com", "1688"],
  ["taobao.com", "타오바오"],
  ["aliexpress.com", "알리익스프레스"],
  ["temu.com", "테무"],
  ["coupang.com", "쿠팡"],
  ["smartstore.naver.com", "네이버 스마트스토어"],
  ["brand.naver.com", "네이버 브랜드스토어"],
  ["shopping.naver.com", "네이버쇼핑"],
  ["11st.co.kr", "11번가"],
  ["gmarket.co.kr", "G마켓"],
  ["auction.co.kr", "옥션"],
  ["daisomall.co.kr", "다이소몰"],
  ["10x10.co.kr", "텐바이텐"],
  ["29cm.co.kr", "29CM"],
  ["idus.com", "아이디어스"],
  ["kakao.com", "카카오"],
  ["instagram.com", "인스타그램"],
];

export function siteNameFromUrl(url: string | null | undefined): string | null {
  const host = hostOf(url);
  if (!host) return null;
  for (const [domain, name] of KNOWN_SITES) {
    if (host === domain || host.endsWith(`.${domain}`)) return name;
  }
  return host;
}

export function needsKioskSync(p: Pick<Product, "kiosk_changed_at" | "kiosk_synced_at">): boolean {
  return !p.kiosk_synced_at || new Date(p.kiosk_changed_at) > new Date(p.kiosk_synced_at);
}

export type StockLevel = "out" | "low" | "ok";

export function stockLevel(p: Pick<Product, "stock_qty" | "safety_stock">): StockLevel {
  if (p.stock_qty <= 0) return "out";
  if (p.safety_stock > 0 && p.stock_qty <= p.safety_stock) return "low";
  return "ok";
}

export function searchText(...parts: (string | null | undefined)[]): string {
  return parts
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .replace(/\s+/g, "");
}
