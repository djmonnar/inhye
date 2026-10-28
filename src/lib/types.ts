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
