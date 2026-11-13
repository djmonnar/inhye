import type { Order, OrderChatResult, OrderChatTurn, PriceInput, Product, ProductSource, Role, Supplier, SupplierInput } from "../../types";

/** 연결된 카카오 사용자 = 앱 계정 (권한도 앱 계정 그대로) */
export interface BotUser {
  key: string;
  profileId: string;
  name: string;
  role: Role;
}

/** 여러 번 주고받는 대화(거래처 등록, 가격 기록 …)의 진행 상태 */
export interface BotSession {
  /** ai_job: 오래 걸리는 주문 비서 작업 (step: running / done / error) — ‘결과’로 받아 가요 */
  flow: "sup_new" | "sup_edit" | "sup_del" | "price" | "search" | "ai_job";
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
  /** 진행 중인 주문 (날짜·시간순) */
  listOrders(): Promise<Order[]>;
}

/** AI가 알아들은 뜻 — 챗봇의 정해진 명령으로 바꿔서 실행해요 */
export type AiIntent =
  | "orders"
  | "order_list"
  | "supplier"
  | "supplier_list"
  | "supplier_products"
  | "supplier_new"
  | "supplier_edit"
  | "product"
  | "price_record"
  | "reorder"
  | "sales"
  | "help"
  | "unknown";

export interface AiRoute {
  intent: AiIntent;
  /** 거래처 이름·상품 이름 같은 찾을 말 (없으면 null) */
  query: string | null;
}

/** 챗봇의 AI (OpenAI, 서버 전용) — 테스트에선 가짜로 바꿔 끼워요 */
export interface BotAi {
  /** 정해진 말이 아닐 때 뜻 알아내기. 늦거나 실패하면 null */
  route(said: string, hints: { suppliers: string[] }): Promise<AiRoute | null>;
  /** 주문 비서 (앱과 같은 두뇌). userId = 연결된 앱 계정 */
  orderChat(message: string, history: OrderChatTurn[], userId: string): Promise<OrderChatResult>;
}
