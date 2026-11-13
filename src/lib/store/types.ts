import type {
  AiProductDraft,
  AiReport,
  AppUser,
  BulkProductRow,
  Member,
  MemberInput,
  MoveInput,
  KakaoBotStatus,
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
  PriceInput,
  PriceLog,
  PrintJob,
  PrintRequest,
  Product,
  ProductInput,
  ProductSource,
  PromoDraft,
  PromoRequest,
  ReportFacts,
  Role,
  SourcePatch,
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

  /** 거래처별 가격 전체 (상품·거래처 화면에서 걸러 써요) */
  listSources(): Promise<ProductSource[]>;
  /** 가격 기록, 최신순. productId 또는 supplierId로 걸러요 */
  listPriceLogs(filter: { productId?: string; supplierId?: string }, limit?: number): Promise<PriceLog[]>;
  /** 가격 기록: 거래처별 최근 가격을 바꾸고 기록을 한 줄 남겨요 (없던 거래처면 새로 붙여요) */
  recordPrice(input: PriceInput): Promise<void>;
  /** 거래처별 가격 줄의 링크·구매처 상품명·메모만 고쳐요 */
  updateSource(id: string, patch: SourcePatch): Promise<void>;
  /** 관리자만. 이 상품을 그 거래처에서 더는 안 사요 */
  deleteSource(id: string): Promise<void>;
  /** 이 거래처를 상품의 주 거래처로 (구매 링크·상품명·원가도 그 줄 값으로) */
  setMainSource(source: ProductSource): Promise<void>;

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

  /** 카카오 챗봇: 연결 상태·연결된 사람 */
  kakaoBotStatus(): Promise<KakaoBotStatus>;
  /** 카카오 챗봇: 내 계정 연결 코드(6자리, 10분) 받기 */
  kakaoBotCode(): Promise<{ code: string; expires_at: string }>;
  /** 카카오 챗봇 연결 끊기 (자기 것, 관리자는 누구 것이든) */
  kakaoBotUnlink(key: string): Promise<void>;
}

export class StoreError extends Error {}
