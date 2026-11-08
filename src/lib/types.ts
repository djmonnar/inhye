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

export interface PosSale {
  id: string;
  source: string;
  external_id: string;
  sold_at: string;
  product_code: string | null;
  barcode: string | null;
  product_name: string;
  qty: number;
  amount: number;
  payment: string | null;
  product_id: string | null;
  stock_applied_at: string | null;
  created_at: string;
}

export interface PosSyncRun {
  id: string;
  source: string;
  started_at: string;
  finished_at: string | null;
  ok: boolean | null;
  fetched: number;
  inserted: number;
  applied: number;
  unmatched: number;
  error: string | null;
}

export interface PosStatus {
  demo?: boolean;
  serviceKey: boolean;
  storeId: boolean;
  apiKey: boolean;
  apiBase: boolean;
  adapterReady: boolean;
}

export interface PosSyncResult {
  fetched: number;
  inserted: number;
  matched: number;
  applied: number;
  unmatched: number;
}
