import type {
  AiProductDraft,
  AiReport,
  AppUser,
  BulkProductRow,
  Member,
  MemberInput,
  MoveInput,
  KakaoStatus,
  Order,
  OrderChatResult,
  OrderChatTurn,
  OrderInput,
  PosLive,
  PosReceiptsDay,
  PosSale,
  PosStatus,
  PosSyncResult,
  PosSyncRun,
  PrintJob,
  PrintRequest,
  Product,
  ProductInput,
  PromoDraft,
  PromoRequest,
  ReportFacts,
  Role,
  StockMove,
  Supplier,
  SupplierInput,
} from "../types";

export interface DataStore {
  mode: "supabase" | "demo";

  getUser(): Promise<AppUser | null>;
  signIn(id: string, password: string, remember: boolean): Promise<AppUser>;
  signOut(): Promise<void>;
  onAuthChange(cb: () => void): () => void;

  listProducts(): Promise<Product[]>;
  saveProduct(input: ProductInput, id?: string): Promise<Product>;
  deleteProduct(id: string): Promise<void>;
  bulkSaveProducts(rows: BulkProductRow[]): Promise<{ created: number; updated: number }>;
  markKioskSynced(ids: string[]): Promise<void>;

  listSuppliers(): Promise<Supplier[]>;
  saveSupplier(input: SupplierInput, id?: string): Promise<Supplier>;
  deleteSupplier(id: string): Promise<void>;

  /** Newest first. Without productId returns recent moves across all products. */
  listMoves(productId?: string, limit?: number): Promise<StockMove[]>;
  addMove(input: MoveInput): Promise<number>;

  uploadImage(file: Blob): Promise<string>;
  removeImage(path: string): Promise<void>;
  imageUrl(path: string | null | undefined): string | null;
  /** Reads a product photo with AI (server-side OpenAI call) and drafts the form fields. */
  describeProduct(image: Blob, context: { categories: string[]; hint?: string }): Promise<AiProductDraft>;
  /** Reads a supplier's product page with AI; also drafts cost and the seller's product name. */
  readProductLink(url: string, context: { categories: string[] }): Promise<AiProductDraft>;
  writePromo(input: PromoRequest, image: Blob | null): Promise<PromoDraft>;
  writeReport(facts: ReportFacts): Promise<AiReport>;

  listMembers(): Promise<Member[]>;
  createMember(input: MemberInput): Promise<void>;
  updateMember(id: string, patch: { role?: Role; password?: string; display_name?: string }): Promise<void>;
  deleteMember(id: string): Promise<void>;

  /** "pending" = waiting or being printed; "recent" = finished (newest first). */
  listPrintJobs(which: "pending" | "recent"): Promise<PrintJob[]>;
  addPrintJobs(items: PrintRequest[], requestedBy: string): Promise<void>;
  /** Atomically takes waiting jobs (pending → printing) so two stations never double-print. */
  claimPrintJobs(): Promise<PrintJob[]>;
  finishPrintJobs(ids: string[], ok: boolean, error?: string): Promise<void>;
  deletePrintJob(id: string): Promise<void>;

  /** POS(빅솔론) 매출: sinceISO 이후, 최신순 */
  listPosSales(sinceISO: string): Promise<PosSale[]>;
  listPosSyncRuns(limit?: number): Promise<PosSyncRun[]>;
  posStatus(): Promise<PosStatus>;
  /** 마지막 가져오기 이후 매출을 받아와요 (서버가 기간을 정해요). from(YYYY-MM-DD)을 주면 그날부터. */
  posSync(from?: string): Promise<PosSyncResult>;
  /** 빅솔론 하루치 판매를 바로 보기만 해요 (저장·재고 차감 없음). day = 한국 날짜 YYYY-MM-DD */
  posLive(day: string): Promise<PosLive>;
  /** 빅솔론 하루치 영수증(건별)을 바로 보기만 해요. */
  posReceipts(day: string): Promise<PosReceiptsDay>;

  /** 예약 주문: 진행 중 전부 + 최근 60일 안에 끝난/취소한 것 */
  listOrders(): Promise<Order[]>;
  saveOrder(input: OrderInput, id?: string): Promise<Order>;
  /** 관리자만. 보통은 status 'canceled'로 취소해요(되살릴 수 있게). */
  deleteOrder(id: string): Promise<void>;
  /** 주문 비서: 말로 등록·수정·완료·취소. history = 최근 대화 몇 줄 */
  orderChat(message: string, history: OrderChatTurn[]): Promise<OrderChatResult>;

  /** 카카오톡 ‘나에게 보내기’ 알림 */
  kakaoStatus(): Promise<KakaoStatus>;
  /** 카카오 로그인 주소 (관리자) — 이 주소로 이동하면 연결돼요 */
  kakaoConnectUrl(): Promise<string>;
  /** 지금 알림을 한 번 보내 봐요 (관리자) */
  kakaoTest(): Promise<{ sent: boolean; text: string }>;
  /** 매일 알림 보낼 시각(한국 0~23시) 바꾸기 (관리자) */
  kakaoSetHour(hour: number): Promise<void>;
}

export class StoreError extends Error {}
