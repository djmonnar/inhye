export type Role = "admin" | "staff" | "pending";

export interface AppUser {
  id: string;
  username: string;
  display_name: string;
  role: Role;
}

export type SupplierKind = "online" | "wholesale" | "offline" | "etc";

export interface Supplier {
  id: string;
  name: string;
  kind: SupplierKind;
  website: string | null;
  contact: string | null;
  phone: string | null;
  order_note: string | null;
  memo: string | null;
  favorite: boolean;
  created_at: string;
  updated_at: string;
}

export type SupplierInput = Omit<Supplier, "id" | "created_at" | "updated_at">;

export interface Product {
  id: string;
  name: string;
  category: string;
  barcode: string | null;
  kiosk_code: string | null;
  supplier_id: string | null;
  purchase_url: string | null;
  supplier_sku: string | null;
  cost_price: number;
  sale_price: number;
  stock_qty: number;
  safety_stock: number;
  kiosk_track_stock: boolean;
  is_active: boolean;
  image_path: string | null;
  tags: string[];
  memo: string | null;
  name_en: string | null;
  name_zh: string | null;
  name_ja: string | null;
  description: string | null;
  description_en: string | null;
  description_zh: string | null;
  description_ja: string | null;
  kiosk_synced_at: string | null;
  /** Last change to a field that goes into the kiosk Excel. */
  kiosk_changed_at: string;
  created_at: string;
  updated_at: string;
}

export type ProductInput = Omit<
  Product,
  "id" | "created_at" | "updated_at" | "kiosk_synced_at" | "kiosk_changed_at"
>;

/** What the AI read from a product photo. Prices and barcodes are never guessed. */
export interface AiProductDraft {
  name: string;
  category: string;
  tags: string[];
  description: string;
  name_en: string;
  name_zh: string;
  name_ja: string;
  description_en: string;
  description_zh: string;
  description_ja: string;
  /** Something the owner should double-check (empty when there's nothing to flag). */
  note: string;
  /** Only from a supplier link: price shown on the page, in won (0 when not in KRW). */
  cost_price?: number;
  /** Only from a supplier link: the seller's product name / option / number. */
  supplier_sku?: string;
}

export interface PromoRequest {
  name: string;
  category: string;
  sale_price: number;
  tags: string[];
  description: string | null;
  /** What the owner wants to stress, e.g. "오늘 입고", "1+1". */
  focus: string;
}

export interface PromoDraft {
  instagram: { text: string; hashtags: string[] };
  daangn: { title: string; text: string };
  kakao: { text: string };
}

/** Numbers computed in the app from products and stock moves; the AI only writes about them. */
export interface ReportFacts {
  period_days: number;
  from: string;
  to: string;
  /** False when no 출고/판매 was recorded at all, so sales-based advice is meaningless. */
  has_outflow: boolean;
  totals: {
    active_products: number;
    out_of_stock: number;
    low_stock: number;
    stock_cost: number;
    avg_margin_rate: number;
    out_qty: number;
    est_revenue: number;
    est_profit: number;
    in_qty: number;
    in_amount: number;
    new_products: number;
  };
  top_movers: { name: string; category: string; out_qty: number; est_revenue: number; margin_rate: number; stock: number }[];
  reorder: { name: string; stock: number; safety_stock: number; out_qty: number; suggest_qty: number; supplier: string }[];
  slow_movers: { name: string; stock: number; stock_cost: number; days_since_created: number }[];
  low_margin: { name: string; cost_price: number; sale_price: number; margin_rate: number }[];
  new_products: { name: string; category: string; sale_price: number; tags: string[] }[];
}

export interface AiReport {
  headline: string;
  summary: string;
  good: string[];
  watch: string[];
  reorder: { name: string; qty: number; reason: string }[];
  todo: string[];
  /** Instagram post introducing this period's new products ("" when there were none). */
  new_arrivals_post: string;
}

export type MoveKind = "in" | "out" | "adjust" | "sale";

export interface StockMove {
  id: string;
  product_id: string;
  kind: MoveKind;
  qty: number;
  unit_cost: number | null;
  supplier_id: string | null;
  memo: string | null;
  created_by_name: string | null;
  created_at: string;
}

export interface MoveInput {
  product_id: string;
  kind: MoveKind;
  /** Signed change in stock (e.g. +10 for 입고, -1 for 출고). */
  qty: number;
  unit_cost?: number | null;
  supplier_id?: string | null;
  memo?: string | null;
  /** Also overwrite the product's cost_price with unit_cost. */
  update_cost?: boolean;
}

export interface Member extends AppUser {
  created_at: string;
}

export interface MemberInput {
  username: string;
  password: string;
  display_name: string;
  role: Role;
}

export type BulkProductRow = Partial<ProductInput> & { id?: string; name: string };

export type PrintStyle = "label" | "price";
export type PrintStatus = "pending" | "printing" | "done" | "failed";

export interface PrintJob {
  id: string;
  product_id: string;
  copies: number;
  style: PrintStyle;
  status: PrintStatus;
  requested_by_name: string | null;
  error: string | null;
  created_at: string;
  claimed_at: string | null;
  printed_at: string | null;
}

export interface PrintRequest {
  product_id: string;
  copies: number;
  style: PrintStyle;
}
