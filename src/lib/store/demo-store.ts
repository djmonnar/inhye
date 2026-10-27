import { createStore, get, set } from "idb-keyval";
import { setRemember, getRemember } from "../supabase";
import type {
  AppUser,
  Product,
  ProductInput,
  StockMove,
  Supplier,
  SupplierInput,
} from "../types";
import { StoreError, type DataStore } from "./types";

/**
 * Device-local store used when Supabase isn't configured yet, so the app can be
 * tried right after deploying. Everything lives in this browser's IndexedDB.
 */

const db = typeof indexedDB === "undefined" ? undefined : createStore("mongsil-demo", "kv");
const USER_KEY = "mongsil.demo.user";

const KIOSK_FIELDS: (keyof Product)[] = [
  "name", "category", "sale_price", "is_active", "kiosk_track_stock", "barcode", "cost_price",
  "kiosk_code", "name_en", "name_zh", "name_ja",
  "description", "description_en", "description_zh", "description_ja",
];

async function load<T>(key: string, fallback: T): Promise<T> {
  if (!db) return fallback;
  return ((await get(key, db)) as T | undefined) ?? fallback;
}

async function save<T>(key: string, value: T) {
  if (db) await set(key, value, db);
}

const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function emojiImage(emoji: string, bg: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="${bg}"/><text x="50" y="56" font-size="56" text-anchor="middle" dominant-baseline="middle">${emoji}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function blankProduct(): Omit<Product, "id" | "name"> {
  const now = new Date().toISOString();
  return {
    category: "기타", barcode: null, kiosk_code: null, supplier_id: null, purchase_url: null,
    supplier_sku: null, cost_price: 0, sale_price: 0, stock_qty: 0, safety_stock: 0,
    kiosk_track_stock: false, is_active: true, image_path: null, tags: [], memo: null,
    name_en: null, name_zh: null, name_ja: null, description: null, description_en: null,
    description_zh: null, description_ja: null, kiosk_synced_at: null,
    kiosk_changed_at: now, created_at: now, updated_at: now,
  };
}

function seed(): { suppliers: Supplier[]; products: Product[] } {
  const now = Date.now();
  const iso = (daysAgo: number) => new Date(now - daysAgo * 86400000).toISOString();
  const sup = (id: string, name: string, kind: Supplier["kind"], website: string | null, extra: Partial<Supplier> = {}): Supplier => ({
    id, name, kind, website, contact: null, phone: null, order_note: null, memo: null,
    favorite: false, created_at: iso(30), updated_at: iso(30), ...extra,
  });
  const suppliers = [
    sup("s-dome", "도매꾹", "wholesale", "https://domeggook.com", { favorite: true, order_note: "3만원 이상 무료배송" }),
    sup("s-1688", "1688", "online", "https://www.1688.com", { memo: "배대지 이용, 2~3주 소요" }),
    sup("s-ndm", "남대문 꽃님상가 2층", "offline", null, { phone: "02-000-0000", contact: "김사장님", favorite: true }),
    sup("s-ali", "알리익스프레스", "online", "https://www.aliexpress.com"),
  ];
  const p = (id: string, name: string, category: string, emoji: string, bg: string, cost: number, price: number, stock: number, safety: number, supplier: string | null, daysAgo: number, extra: Partial<Product> = {}): Product => ({
    ...blankProduct(), id, name, category, cost_price: cost, sale_price: price, stock_qty: stock,
    safety_stock: safety, supplier_id: supplier, image_path: emojiImage(emoji, bg),
    created_at: iso(daysAgo), updated_at: iso(daysAgo), kiosk_changed_at: iso(daysAgo), ...extra,
  });
  const products = [
    p("p1", "곰돌이 털 키링", "키링", "🧸", "#FFE9D6", 1800, 4500, 12, 5, "s-dome", 1, { barcode: "8801234567893", purchase_url: "https://domeggook.com/12345", kiosk_synced_at: iso(5) }),
    p("p2", "토끼 머리끈 세트", "헤어", "🐰", "#FFE1EA", 900, 2500, 3, 6, "s-1688", 2, { barcode: "2000000000015" }),
    p("p3", "딸기 우유 볼펜", "문구", "🍓", "#FFE1EA", 600, 1500, 40, 10, "s-dome", 3, { barcode: "2000000000022", kiosk_synced_at: iso(1) }),
    p("p4", "구름 미니 거울", "생활", "☁️", "#E3F3FC", 2200, 5900, 0, 3, "s-ndm", 4, { kiosk_synced_at: iso(10) }),
    p("p5", "고양이 스티커 팩", "스티커", "🐱", "#FFF6D6", 500, 2000, 25, 10, "s-ali", 6, { barcode: "2000000000039", purchase_url: "https://www.aliexpress.com/item/1005.html", kiosk_synced_at: iso(10) }),
    p("p6", "네잎클로버 파우치", "파우치", "🍀", "#E2F7EC", 3500, 8900, 7, 3, "s-ndm", 8, { kiosk_synced_at: iso(10) }),
    p("p7", "별빛 무드등", "생활", "⭐", "#FFF6D6", 7800, 16900, 2, 2, "s-1688", 12, { barcode: "2000000000046", kiosk_synced_at: iso(15) }),
    p("p8", "체리 헤어핀", "헤어", "🍒", "#FFE1EA", 700, 2000, 18, 8, "s-dome", 15, { kiosk_synced_at: iso(16) }),
  ];
  return { suppliers, products };
}

async function getProducts(): Promise<Product[]> {
  const existing = await load<Product[] | null>("products", null);
  if (existing) return existing;
  const s = seed();
  await save("suppliers", s.suppliers);
  await save("products", s.products);
  return s.products;
}

function readUser(): AppUser | null {
  try {
    const raw = localStorage.getItem(USER_KEY) ?? sessionStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as AppUser) : null;
  } catch {
    return null;
  }
}

export function createDemoStore(): DataStore {
  const store: DataStore = {
    mode: "demo",

    async getUser() {
      return readUser();
    },

    async signIn(id, _password, remember) {
      const username = id.trim() || "demo";
      const user: AppUser = { id: "demo", username, display_name: username, role: "admin" };
      setRemember(remember);
      const target = getRemember() ? localStorage : sessionStorage;
      target.setItem(USER_KEY, JSON.stringify(user));
      emit();
      return user;
    },

    async signOut() {
      localStorage.removeItem(USER_KEY);
      sessionStorage.removeItem(USER_KEY);
      emit();
    },

    onAuthChange(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },

    async listProducts() {
      const list = await getProducts();
      return [...list].sort((a, b) => b.created_at.localeCompare(a.created_at));
    },

    async saveProduct(input: ProductInput, id?: string) {
      const list = await getProducts();
      if (input.barcode && list.some((p) => p.barcode === input.barcode && p.id !== id))
        throw new StoreError("이미 등록된 바코드예요.");
      const now = new Date().toISOString();
      let result: Product;
      if (id) {
        const idx = list.findIndex((p) => p.id === id);
        if (idx < 0) throw new StoreError("상품을 찾을 수 없어요.");
        const prev = list[idx];
        const changedKiosk = KIOSK_FIELDS.some(
          (k) => k in input && JSON.stringify(prev[k]) !== JSON.stringify(input[k as keyof ProductInput]),
        );
        result = {
          ...prev, ...input, updated_at: now,
          kiosk_changed_at: changedKiosk ? now : prev.kiosk_changed_at,
        };
        list[idx] = result;
      } else {
        result = { ...blankProduct(), ...input, id: crypto.randomUUID(), created_at: now, updated_at: now, kiosk_changed_at: now };
        list.push(result);
      }
      await save("products", list);
      return result;
    },

    async deleteProduct(id) {
      const list = await getProducts();
      await save("products", list.filter((p) => p.id !== id));
      const moves = await load<StockMove[]>("moves", []);
      await save("moves", moves.filter((m) => m.product_id !== id));
    },

    async bulkSaveProducts(rows) {
      let created = 0;
      let updated = 0;
      for (const r of rows) {
        const { id, ...rest } = r;
        if (id) {
          await store.saveProduct(rest as ProductInput, id);
          updated++;
        } else {
          await store.saveProduct({ ...blankProduct(), ...rest } as ProductInput);
          created++;
        }
      }
      return { created, updated };
    },

    async markKioskSynced(ids) {
      const set_ = new Set(ids);
      const now = new Date().toISOString();
      const list = await getProducts();
      await save("products", list.map((p) => (set_.has(p.id) ? { ...p, kiosk_synced_at: now } : p)));
    },

    async listSuppliers() {
      await getProducts();
      const list = await load<Supplier[]>("suppliers", []);
      return [...list].sort((a, b) => a.name.localeCompare(b.name, "ko"));
    },

    async saveSupplier(input: SupplierInput, id?: string) {
      const list = await load<Supplier[]>("suppliers", []);
      const now = new Date().toISOString();
      let result: Supplier;
      if (id) {
        const idx = list.findIndex((s) => s.id === id);
        if (idx < 0) throw new StoreError("구매처를 찾을 수 없어요.");
        result = { ...list[idx], ...input, updated_at: now };
        list[idx] = result;
      } else {
        result = { ...input, id: crypto.randomUUID(), created_at: now, updated_at: now };
        list.push(result);
      }
      await save("suppliers", list);
      return result;
    },

    async deleteSupplier(id) {
      const list = await load<Supplier[]>("suppliers", []);
      await save("suppliers", list.filter((s) => s.id !== id));
      const products = await getProducts();
      await save("products", products.map((p) => (p.supplier_id === id ? { ...p, supplier_id: null } : p)));
    },

    async listMoves(productId, limit = 100) {
      const moves = await load<StockMove[]>("moves", []);
      return moves
        .filter((m) => !productId || m.product_id === productId)
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .slice(0, limit);
    },

    async addMove(m) {
      const list = await getProducts();
      const idx = list.findIndex((p) => p.id === m.product_id);
      if (idx < 0) throw new StoreError("상품을 찾을 수 없어요.");
      const p = list[idx];
      list[idx] = {
        ...p,
        stock_qty: p.stock_qty + m.qty,
        cost_price: m.update_cost && m.unit_cost != null ? m.unit_cost : p.cost_price,
      };
      await save("products", list);
      const moves = await load<StockMove[]>("moves", []);
      moves.push({
        id: crypto.randomUUID(), product_id: m.product_id, kind: m.kind, qty: m.qty,
        unit_cost: m.unit_cost ?? null, supplier_id: m.supplier_id ?? null, memo: m.memo ?? null,
        created_by_name: readUser()?.display_name ?? null, created_at: new Date().toISOString(),
      });
      await save("moves", moves);
      return list[idx].stock_qty;
    },

    async uploadImage(file) {
      return await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new StoreError("사진을 읽지 못했어요."));
        reader.readAsDataURL(file);
      });
    },

    async removeImage() {},

    imageUrl(path) {
      return path ?? null;
    },

    async listMembers() {
      const u = readUser();
      return u ? [{ ...u, created_at: new Date().toISOString() }] : [];
    },

    async createMember() {
      throw new StoreError("체험 모드에서는 직원 계정을 만들 수 없어요. Supabase를 연결해 주세요.");
    },

    async updateMember() {
      throw new StoreError("체험 모드에서는 사용할 수 없어요.");
    },

    async deleteMember() {
      throw new StoreError("체험 모드에서는 사용할 수 없어요.");
    },
  };
  return store;
}

export async function resetDemoData(empty: boolean) {
  if (empty) {
    await save("products", []);
    await save("suppliers", []);
  } else {
    const s = seed();
    await save("products", s.products);
    await save("suppliers", s.suppliers);
  }
  await save("moves", []);
}
