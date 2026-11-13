import type { PriceInput, Product, ProductSource, Role, Supplier, SupplierInput } from "../../types";

/** 연결된 카카오 사용자 = 앱 계정 (권한도 앱 계정 그대로) */
export interface BotUser {
  key: string;
  profileId: string;
  name: string;
  role: Role;
}

/** 여러 번 주고받는 대화(거래처 등록, 가격 기록 …)의 진행 상태 */
export interface BotSession {
  flow: "sup_new" | "sup_edit" | "sup_del" | "price" | "search";
  step: string;
  data: Record<string, string | number | boolean | null>;
  /** ISO — 오래된 대화(15분)는 버려요 */
  at: string;
}

export interface TodaySales {
  day: string;
  /** live: 빅솔론에서 바로 · db: 마지막으로 가져온 매출 · none: 매출 연결 안 됨 */
  source: "live" | "db" | "none";
  amount: number;
  qty: number;
  items: { name: string; qty: number; amount: number }[];
  note?: string;
}

/** 챗봇이 쓰는 데이터 — 실제(Supabase 서비스 키)와 테스트용(메모리) 두 가지 */
export interface BotDb {
  findUser(key: string): Promise<BotUser | null>;
  /** 연결 코드가 맞으면 연결하고 그 계정을, 틀리거나 지났으면 null */
  useCode(code: string, key: string): Promise<BotUser | null>;
  unlink(key: string): Promise<void>;

  getSession(key: string): Promise<BotSession | null>;
  setSession(key: string, session: BotSession | null): Promise<void>;

  listSuppliers(): Promise<Supplier[]>;
  saveSupplier(input: SupplierInput, id?: string): Promise<Supplier>;
  deleteSupplier(id: string): Promise<void>;
  listProducts(): Promise<Product[]>;
  listSources(): Promise<ProductSource[]>;
  recordPrice(input: PriceInput, byName: string): Promise<void>;
  todaySales(day: string): Promise<TodaySales>;
}
