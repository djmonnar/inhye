import type {
  BarcodeIssue,
  BarcodeIssueInput,
  AiProductDraft,
  AiReport,
  AppUser,
  BulkProductRow,
  Member,
  MemberInput,
  MoveInput,
  KakaoBotStatus,
  KakaoStatus,
  LogenCheck,
  LogenInfo,
  LogenRun,
  Order,
  OrderChatResult,
  OrderChatTurn,
  OrderInput,
  PosLive,
  PosSettle,
  PosReceiptsDay,
  PosSale,
  PosStatus,
  PosSyncResult,
  PosSyncRun,
  PriceInput,
  PriceLog,
  PrintJob,
  PrintStation,
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
  /** 상품 없이 만든 매장용 바코드 (최근 것부터) — v10 전 DB면 빈 목록 */
  listBarcodeIssues(): Promise<BarcodeIssue[]>;
  /** 새 매장용 바코드 만들기 — 상품 바코드·이미 만든 번호와 안 겹치게 번호를 정해 기록해요 (완전히 지우진 않아요: 지운 번호가 다시 나가면 이미 붙인 라벨과 겹쳐서 — 목록에서만 숨겨요) */
  issueBarcodes(input: BarcodeIssueInput): Promise<BarcodeIssue[]>;
  /** 만든 바코드를 목록에서 지우기 (관리자, v13) — 숨기기만 해서 번호는 다시 나가지 않아요 */
  hideBarcodeIssue(id: string): Promise<void>;
  listPrintJobs(which: "pending" | "recent"): Promise<PrintJob[]>;
  /** stationId = 보낼 노트북 (없으면 아무 노트북이나) */
  addPrintJobs(items: PrintRequest[], requestedBy: string, stationId?: string | null): Promise<void>;
  /** Atomically takes waiting jobs (pending → printing) so two stations never double-print. */
  /** stationId를 주면 그 노트북 것 + 노트북을 안 고른 것만 가져가요 */
  claimPrintJobs(stationId?: string | null): Promise<PrintJob[]>;
  /** 인쇄 대기열이 바뀌면 바로 알려줘요 (실시간). onStatus(true) = 실시간 연결됨. 돌려준 함수로 끊어요 */
  watchPrintJobs(onChange: () => void, onStatus?: (live: boolean) => void): () => void;
  /** 인쇄 노트북 (v11) — v11 전 DB면 빈 목록 */
  listPrintStations(): Promise<PrintStation[]>;
  registerPrintStation(name: string): Promise<PrintStation>;
  /** 이름 바꾸기 · seen = ‘지금 켜져 있어요’ 알리기 */
  updatePrintStation(id: string, patch: { name?: string; seen?: boolean }): Promise<void>;
  removePrintStation(id: string): Promise<void>;
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
  /** 기간 판매를 빅솔론 분류명과 같이 (A/B 정산, 최대 31일) */
  posSettle(start: string, end: string): Promise<PosSettle>;
  /** 빅솔론 하루치 영수증(건별)을 바로 보기만 해요. */
  posReceipts(day: string): Promise<PosReceiptsDay>;

  /** 예약 주문: 진행 중 전부 + 최근 60일 안에 끝난/취소한 것 */
  listOrders(): Promise<Order[]>;
  /** 정산용: 기간(픽업일·출고일 기준) 근처의 취소 안 된 주문 — 거르기는 settleOrders()가 해요 */
  settleOrders(start: string, end: string): Promise<Order[]>;
  saveOrder(input: OrderInput, id?: string): Promise<Order>;
  /** 관리자만. 보통은 status 'canceled'로 취소해요(되살릴 수 있게). */
  deleteOrder(id: string): Promise<void>;
  /** 주문 비서: 말로 등록·수정·완료·취소. history = 최근 대화 몇 줄 */
  orderChat(message: string, history: OrderChatTurn[]): Promise<OrderChatResult>;

  /** 로젠택배 API: 준비 상태 (빠진 환경변수 이름) */
  logenStatus(): Promise<LogenInfo>;
  /** 고른 택배 주문을 로젠에 접수 (송장은 로젠 쪽에서 출력) */
  logenRegister(ids: string[]): Promise<LogenRun>;
  /** 로젠 송장번호 받아 오기 (ids 없으면 ‘접수됨’ 전부) */
  logenSlips(ids?: string[]): Promise<LogenRun>;
  /** 관리자: 로젠 연결 확인 (계약 운임 조회) */
  logenCheck(): Promise<LogenCheck>;

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
