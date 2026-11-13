import { normTime, timeLabel } from "../../day";
import { margin, num, relTime, won } from "../../format";
import { j } from "../../josa";
import { cheaperThanMain, isStale, sortSources, suggestQty } from "../../sources";
import type { Order, OrderChangeOp, OrderChatResult, OrderChatTurn, Product, ProductSource, Supplier, SupplierInput, SupplierKind } from "../../types";
import {
  call,
  callbackAck,
  card,
  carousel,
  isCallbackAck,
  link,
  list,
  quick,
  reply,
  say,
  text,
  type Button,
  type CallbackAck,
  type ListItem,
  type SkillRequest,
  type SkillResponse,
} from "./kakao";
import { HOWTO_RE, howto, howtoTopic, topicFromQuery, type HowtoTopic } from "./howto";
import type { AiRoute, BotAi, BotDb, BotSession, BotUser } from "./types";

/**
 * 포포하우스 카카오 챗봇 — 오픈빌더의 폴백·웰컴 블록이 이 스킬을 불러요(말 전체를 여기서 해석).
 * 데이터는 BotDb로만 다뤄서, 실제 DB 없이도 테스트할 수 있어요.
 */
export interface BotContext {
  db: BotDb;
  /** 버튼이 열 앱 주소 (예: https://inhye.vercel.app) */
  appUrl: string;
  now?: Date;
  /** AI (서버에 OpenAI 키가 있을 때만) — 정해진 말이 아닐 때 뜻 알아내기 + 주문 비서 */
  ai?: BotAi;
  /** 이 시각(ms)까지 답해야 해요 (카카오 5초 규칙). 늦어지는 주문 정리는 ‘결과 보기’로 받아 가요 */
  deadline?: number;
  /** 답을 보낸 뒤에도 끝까지 마무리할 일 (Next.js after) */
  defer?: (work: Promise<unknown>) => void;
  /** 블록에서 콜백을 켰을 때만: 늦은 답을 카카오에 나중에 보내요 */
  callback?: (work: Promise<SkillResponse>) => void;
}

export type BotReply = SkillResponse | CallbackAck;

const KIND_LABEL: Record<SupplierKind, string> = { online: "온라인", wholesale: "도매", offline: "오프라인", etc: "기타" };
const ROLE_LABEL = { admin: "관리자", staff: "직원", pending: "승인 대기" } as const;
const SESSION_MS = 15 * 60 * 1000;
const PAGE = 5;

const MENU = quick("주문 목록", "거래처 목록", "발주 목록", "상품 찾기", "가격 기록", "오늘 매출", "거래처 등록", "도움말");
const CANCEL = quick("취소");

const clean = (s: string) => s.replace(/\s+/g, " ").trim();
const norm = (s: string) => s.toLowerCase().replace(/[\s·.,()\-_/]+/g, "");
const kstDay = (d: Date) => new Date(d.getTime() + 9 * 3600_000).toISOString().slice(0, 10);

const WEEK = ["일", "월", "화", "수", "목", "금", "토"];
const md = (day: string) => `${Number(day.slice(5, 7))}/${Number(day.slice(8, 10))}(${WEEK[new Date(`${day}T00:00:00Z`).getUTCDay()]})`;
const daysUntil = (day: string, today: string) =>
  Math.round((Date.parse(`${day}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000);
const dLabel = (n: number) => (n === 0 ? "오늘" : n > 0 ? `D-${n}` : `${-n}일 지남`);
const OP_LABEL: Record<OrderChangeOp, string> = { create: "등록", update: "수정", complete: "완료", reopen: "다시 진행", cancel: "취소" };
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 200);
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, Math.max(0, ms)));
const SLOW: unique symbol = Symbol("slow");
/** 오래 걸리는 주문 정리가 이보다 오래 ‘정리 중’이면 멈춘 걸로 봐요 */
const JOB_STALE_MS = 90_000;

/** 주문(예약) 이야기 같으면 바로 주문 비서로 — 날짜, 픽업·택배, 꽃다발, 보냈어·완료 … */
const ORDER_RE = /(\d{1,2}\s*[\/.월]\s*\d{1,2}|픽업|택배|꽃다발|예약|주문\s*(?:등록|추가|넣|받|들어)|보냈|찾아\s*갔|가져\s*갔|완료)/;

/** "1,800" "1800원" "2만" "1만5천" "1.5천" → 숫자 (모르면 null) */
export function parsePrice(s: string): number | null {
  const t = s.replace(/[,\s원₩]/g, "");
  let v: number | null = null;
  let m = t.match(/^(\d+(?:\.\d+)?)만(?:(\d+)천)?(\d+)?$/);
  if (m) v = parseFloat(m[1]) * 10000 + (m[2] ? Number(m[2]) * 1000 : 0) + (m[3] ? Number(m[3]) : 0);
  else if ((m = t.match(/^(\d+(?:\.\d+)?)천(\d+)?$/))) v = parseFloat(m[1]) * 1000 + (m[2] ? Number(m[2]) : 0);
  else if (/^\d+$/.test(t)) v = Number(t);
  if (v == null || !Number.isFinite(v)) return null;
  v = Math.round(v);
  return v > 0 && v <= 10_000_000 ? v : null;
}

function parseKind(s: string): SupplierKind | null {
  if (/온라인|인터넷|online/i.test(s)) return "online";
  if (/도매|wholesale/i.test(s)) return "wholesale";
  if (/오프라인|매장|시장|offline/i.test(s)) return "offline";
  if (/기타|etc/i.test(s)) return "etc";
  return null;
}

export { j };

const isSkip = (s: string) => /^(건너뛰기|건너뛸게|없음|없어|패스|-|x)$/i.test(s);
const isClear = (s: string) => /^(지우기|비우기|삭제)$/.test(s);

// ---------------------------------------------------------------------------

export async function handleSkill(body: SkillRequest, ctx: BotContext): Promise<BotReply> {
  const key = body.userRequest?.user?.id?.trim();
  // 웰컴 블록(대화방에 처음 들어올 때)은 어떤 말이 오든 인사·연결 안내로 답해요
  const welcome = /웰컴|welcome/i.test(`${body.userRequest?.block?.name ?? ""} ${body.intent?.name ?? ""}`);
  const said = welcome ? "" : clean(String(body.userRequest?.utterance ?? ""));
  if (!key) return reply([text("카카오 사용자 정보를 받지 못했어요. 채널 대화방에서 다시 말을 걸어 주세요.")]);

  const user = await ctx.db.findUser(key);
  if (!user) return linkAccount(ctx, key, said);
  if (user.role === "pending") {
    return reply([text(`${user.name}님 계정은 아직 승인 대기 중이에요. 관리자에게 앱 ‘직원 계정 관리’에서 승인해 달라고 해 주세요.`)]);
  }

  const bot = new Bot(ctx, user);
  let session = await ctx.db.getSession(key);
  if (session && bot.now.getTime() - new Date(session.at).getTime() > SESSION_MS) {
    session = null;
    await ctx.db.setSession(key, null);
  }

  if (/^(취소|그만|그만할게|처음|처음으로|메뉴|홈)$/.test(said)) {
    if (session) await ctx.db.setSession(key, null);
    return said.startsWith("취소") || said.startsWith("그만")
      ? reply([text(session ? "취소했어요. 다른 걸 해 볼까요?" : "진행 중인 게 없어요.")], MENU)
      : bot.menu();
  }
  if (session) return bot.continueFlow(session, said);
  return bot.command(said);
}

/** 아직 연결 안 된 카카오 사용자: 앱에서 받은 6자리 코드로만 연결돼요 */
async function linkAccount(ctx: BotContext, key: string, said: string): Promise<SkillResponse> {
  const m = said.match(/^(?:연결\s*)?(\d{6})$/);
  if (m) {
    const user = await ctx.db.useCode(m[1], key);
    if (!user) return reply([text("코드가 틀렸거나 10분이 지났어요. 앱에서 새 코드를 받아 다시 보내 주세요.")]);
    return reply(
      [text(`${user.name}님(${ROLE_LABEL[user.role]}) 계정과 연결됐어요 🎉\n이제 아래 버튼이나 말로 거래처·발주·재고·매출을 볼 수 있어요.`)],
      MENU,
    );
  }
  return reply([
    card(
      "포포하우스 계정 연결이 필요해요",
      "거래처 정보는 가게 사람만 볼 수 있어요.\n① 포포하우스 앱 → 더보기 → 카카오 챗봇\n② ‘연결 코드 받기’\n③ 여기에 ‘연결 123456’처럼 보내 주세요 (10분 안에)",
      [link("앱 열기", `${ctx.appUrl}/kakao-bot`)],
    ),
  ]);
}

class Bot {
  readonly now: Date;
  private suppliersCache?: Promise<Supplier[]>;
  private productsCache?: Promise<Product[]>;
  private sourcesCache?: Promise<ProductSource[]>;

  constructor(
    private ctx: BotContext,
    private user: BotUser,
  ) {
    this.now = ctx.now ?? new Date();
  }

  private get db() {
    return this.ctx.db;
  }
  private suppliers() {
    return (this.suppliersCache ??= this.db.listSuppliers());
  }
  private products() {
    return (this.productsCache ??= this.db.listProducts());
  }
  private sources() {
    return (this.sourcesCache ??= this.db.listSources());
  }
  private refreshData() {
    this.suppliersCache = this.productsCache = this.sourcesCache = undefined;
  }
  private setSession(s: Omit<BotSession, "at"> | null) {
    return this.db.setSession(this.user.key, s ? { ...s, at: this.now.toISOString() } : null);
  }
  private app(path: string) {
    return `${this.ctx.appUrl}${path}`;
  }

  // --- 말 해석 ---------------------------------------------------------------

  async command(said: string, viaAi = false): Promise<BotReply> {
    let m: RegExpMatchArray | null;
    if (!said || /^(시작|안녕|안녕하세요|하이|hi|hello|ㅎㅇ)/i.test(said)) return this.menu(true);
    if (/^(도움말|도움|help|\?|사용법|뭐\s*할\s*수\s*있어)/i.test(said)) return this.help();
    if (/^연결\s*(해제|끊기|끊어)/.test(said)) return this.unlink();
    if (/^연결/.test(said)) return reply([text(`이미 ${this.user.name}님 계정과 연결돼 있어요.`)], MENU);

    // 방법을 묻는 말 (“발주 어떻게 넣어?”) → 그 주제 사용법. 거래처·상품 이름이 들어 있으면 그걸 묻는 거라 건너뛰어요
    if (HOWTO_RE.test(said) && !/어떻게\s*(?:됐|되었|돼\s*가|되고)/.test(said)) {
      const topic = howtoTopic(said);
      if (topic && !(await this.mentionsName(said))) return this.howtoReply(topic);
    }

    if ((m = said.match(/^거래처\s*상품\s*(.+)$/))) return this.supplierProducts(m[1]);
    if ((m = said.match(/^거래처\s*(?:목록|리스트|전체|보기)?\s*(\d+)?$/))) return this.supplierList(Number(m[1] ?? 1));
    if ((m = said.match(/^거래처\s*(?:등록|추가)\s*(.*)$/))) return this.startNewSupplier(m[1]);
    if ((m = said.match(/^거래처\s*(?:수정|편집|고치기)\s*(.*)$/))) return this.startEdit(m[1]);
    if ((m = said.match(/^거래처\s*(?:삭제|지우기)\s*(.*)$/))) return this.startDelete(m[1]);
    if (/^거래처\s*(?:찾기|검색)$/.test(said)) return this.askSearch("supplier");
    if ((m = said.match(/^거래처\s*(?:찾기|검색)?\s*(.+)$/))) return this.supplierSearch(m[1]);

    if (/^발주(\s*목록|\s*리스트|\s*할\s*것)?$/.test(said)) return this.reorder();
    if (/^(오늘\s*)?(매출|판매)(\s*보기)?$/.test(said)) return this.sales();

    if ((m = said.match(/^(?:주문|예약)\s*(?:목록|리스트|보기|확인)?\s*(\d+)?$/))) return this.orderList(Number(m[1] ?? 1));
    if ((m = said.match(/^(오늘|내일)\s*픽업(?:\s*(?:목록|보기))?$/))) return this.pickups(m[1] === "오늘" ? 0 : 1);
    if (/^결과(\s*보기)?$/.test(said)) return reply([text("받아 갈 결과가 없어요. 주문은 ‘주문 목록’에서 확인할 수 있어요.")], quick("주문 목록", "메뉴"));

    if ((m = said.match(/^가격\s*(?:기록|입력|등록|적기)\s*(.*)$/))) return this.startPrice(m[1]);
    if (/^(상품|재고)\s*(찾기|검색)?$/.test(said)) return this.askSearch("product");
    if ((m = said.match(/^(?:상품|재고|찾기|검색|가격|최저가)\s*(?:찾기|검색|비교)?\s*(.+)$/))) return this.productSearch(m[1]);
    if (/^\d{8,14}$/.test(said)) return this.productSearch(said);
    if (/^\d{6}$/.test(said)) {
      // 빅솔론 상품 코드일 수도 있어요. 아니면 연결 코드를 또 보낸 거예요.
      const byCode = (await this.products()).filter((p) => p.kiosk_code === said || p.barcode === said);
      if (byCode.length) return byCode.length === 1 ? this.productCard(byCode[0]) : this.productSearch(said);
      return reply([text(`이미 ${this.user.name}님 계정과 연결돼 있어요.`)], MENU);
    }

    if (!viaAi && ORDER_RE.test(said)) return this.orderFlow(said);
    return this.understand(said, viaAi);
  }

  async continueFlow(s: BotSession, said: string): Promise<BotReply> {
    switch (s.flow) {
      case "ai_job":
        return this.jobStep(s, said);
      case "sup_new":
        return this.newSupplierStep(s, said);
      case "sup_edit":
        return this.editStep(s, said);
      case "sup_del":
        return this.deleteStep(s, said);
      case "price":
        return this.priceStep(s, said);
      case "search":
        await this.setSession(null);
        return s.step === "supplier" ? this.supplierSearch(said) : this.productSearch(said);
    }
  }

  // --- 메뉴 · 도움말 · 연결 ----------------------------------------------------

  menu(greet = false): SkillResponse {
    return reply(
      [text(greet ? `${this.user.name}님 안녕하세요 🐾 무엇을 볼까요?` : "무엇을 볼까요?")],
      MENU,
    );
  }

  help(): SkillResponse {
    return reply(
      [
        text(
          [
            "이렇게 말해 보세요 🐾",
            "• 주문 목록 / 오늘 픽업 / 내일 픽업",
            "• 주문은 그대로 보내면 등록돼요 — 11/20 금 오후 3시 픽업 김포포 꽃다발 2.5만원",
            "• 김포포 꽃다발 보냈어(완료) · 김포포 4시로 바꿔줘 · 김포포 주문 취소",
            "• 거래처 목록 / 거래처 도매꾹",
            "• 거래처 등록 / 거래처 수정 도매꾹",
            "• 거래처 상품 도매꾹 — 거기서 사는 상품·가격",
            "• 상품 곰돌이 / 바코드 숫자 — 재고·거래처별 가격",
            "• 가격 기록 곰돌이 — 거래처마다 값 적기",
            "• 발주 목록 — 품절·품절 임박을 거래처별로",
            "• 오늘 매출",
            "• 취소 — 하던 것 그만",
            this.user.role === "admin" ? "• 거래처 삭제 도매꾹 (관리자)" : "",
            "\n❓ 방법이 궁금하면: 발주 어떻게 해? · 주문 어떻게 넣어? · 가격 기록 어떻게 해?",
            this.ctx.ai ? "💡 정해진 말이 아니어도 알아들어요. 예) 도매꾹 전화번호 뭐야? · 품절된 거 뭐 있어?" : "",
          ]
            .filter(Boolean)
            .join("\n"),
        ),
        card("자세한 사용법", "예시 대화와 자주 묻는 것을 한 페이지에 모아 뒀어요.", [
          link("사용 안내 보기", this.app("/kakao-guide")),
        ]),
      ],
      MENU,
    );
  }

  howtoReply(topic: HowtoTopic): SkillResponse {
    const h = howto(topic);
    const outputs = [text(h.text)];
    if (h.app) outputs.push(card(h.app.label, "앱에서 하면 더 편해요.", [link("열기", this.app(h.app.path))]));
    return reply(outputs, quick(...h.tryIt, "도움말", "메뉴"));
  }

  /** 말 속에 거래처나 상품 이름이 들어 있나 (두 글자 이상) */
  private async mentionsName(said: string): Promise<boolean> {
    const n = norm(said);
    const [sups, prods] = await Promise.all([this.suppliers(), this.products()]);
    return [...sups.map((x) => x.name), ...prods.map((x) => x.name)].some((name) => {
      const k = norm(name);
      return k.length >= 2 && n.includes(k);
    });
  }

  async unlink(): Promise<SkillResponse> {
    await this.db.unlink(this.user.key);
    return reply([text("연결을 끊었어요. 다시 쓰려면 앱에서 새 연결 코드를 받아 주세요.")]);
  }

  askSearch(what: "product" | "supplier"): Promise<SkillResponse> {
    return this.setSession({ flow: "search", step: what, data: {} }).then(() =>
      reply([text(what === "product" ? "찾을 상품 이름이나 바코드를 보내 주세요." : "찾을 거래처 이름을 보내 주세요.")], CANCEL),
    );
  }

  // --- 찾기 -------------------------------------------------------------------

  private async findSuppliers(q: string): Promise<{ exact?: Supplier; hits: Supplier[] }> {
    const n = norm(q);
    const all = await this.suppliers();
    const exact = all.filter((s) => norm(s.name) === n);
    if (exact.length === 1) return { exact: exact[0], hits: exact };
    const hits = all.filter((s) => n && norm(s.name).includes(n));
    return { exact: hits.length === 1 ? hits[0] : undefined, hits };
  }

  private async findProducts(q: string): Promise<Product[]> {
    const all = await this.products();
    const digits = q.replace(/\D/g, "");
    if (/^\d{8,14}$/.test(q.trim())) {
      const byCode = all.filter((p) => p.barcode === digits || p.kiosk_code === digits);
      if (byCode.length) return byCode;
    }
    const n = norm(q);
    if (!n) return [];
    const exact = all.filter((p) => norm(p.name) === n);
    if (exact.length) return exact;
    const words = q.toLowerCase().split(" ").map(norm).filter(Boolean);
    return all
      .filter((p) => {
        const hay = norm([p.name, p.category, p.tags.join(" "), p.supplier_sku ?? ""].join(" "));
        return words.every((w) => hay.includes(w));
      })
      .sort((a, b) => Number(b.is_active) - Number(a.is_active) || a.name.length - b.name.length);
  }

  async anything(q: string): Promise<SkillResponse> {
    const [sup, prods] = await Promise.all([this.findSuppliers(q), this.findProducts(q)]);
    if (sup.exact && !prods.length) return this.supplierCard(sup.exact);
    if (prods.length === 1 && !sup.hits.length) return this.productCard(prods[0]);
    if (!sup.hits.length && !prods.length) {
      if (/\s/.test(q) || /[?？]$/.test(q)) {
        // 이름 하나가 아니라 문장이에요 → ‘못 찾았어요’보다 무슨 말을 할 수 있는지 알려줘요
        return reply(
          [
            text(
              [
                "무슨 말인지 잘 모르겠어요 🥲 이렇게 말해 보세요.",
                "• 발주 목록 · 주문 목록 · 오늘 매출",
                "• 상품 곰돌이 · 거래처 도매꾹",
                "• 방법이 궁금하면: 발주 어떻게 해? · 주문 어떻게 넣어?",
              ].join("\n"),
            ),
          ],
          MENU,
        );
      }
      return reply([text(`${j(`‘${q}’`, "로")} 찾은 게 없어요. 아래에서 골라 보거나 ‘도움말’을 보내 주세요.`)], MENU);
    }
    const items: ListItem[] = [
      ...sup.hits.slice(0, 3).map((s) => ({ title: `🏪 ${s.name}`, description: KIND_LABEL[s.kind], messageText: `거래처 ${s.name}` })),
      ...prods.slice(0, 5).map((p) => ({ title: `📦 ${p.name}`, description: `재고 ${num(p.stock_qty)}개 · ${won(p.sale_price)}`, messageText: `상품 ${p.name}` })),
    ];
    return reply([list(`‘${q}’ 찾은 결과`, items)], MENU);
  }

  // --- 거래처 -----------------------------------------------------------------

  async supplierList(page: number): Promise<SkillResponse> {
    const [all, products] = await Promise.all([this.suppliers(), this.products()]);
    if (!all.length) return reply([text("아직 거래처가 없어요. ‘거래처 등록’으로 추가해 보세요.")], quick("거래처 등록", "메뉴"));
    const sorted = [...all].sort((a, b) => Number(b.favorite) - Number(a.favorite) || a.name.localeCompare(b.name, "ko"));
    const pages = Math.ceil(sorted.length / PAGE);
    const p = Math.min(Math.max(page, 1), pages);
    const items = sorted.slice((p - 1) * PAGE, p * PAGE).map((s) => ({
      title: `${s.favorite ? "⭐ " : ""}${s.name}`,
      description: [KIND_LABEL[s.kind], `상품 ${products.filter((x) => x.supplier_id === s.id).length}개`, s.order_note ?? ""]
        .filter(Boolean)
        .join(" · "),
      messageText: `거래처 ${s.name}`,
    }));
    return reply(
      [list(`거래처 ${sorted.length}곳${pages > 1 ? ` (${p}/${pages})` : ""}`, items)],
      quick(p < pages && ["다음 ▶", `거래처 목록 ${p + 1}`], p > 1 && ["◀ 이전", `거래처 목록 ${p - 1}`], "거래처 등록", "메뉴"),
    );
  }

  async supplierSearch(q: string): Promise<SkillResponse> {
    const { exact, hits } = await this.findSuppliers(q);
    if (exact) return this.supplierCard(exact);
    if (!hits.length) {
      return reply([text(`‘${q}’ 거래처가 없어요. 새로 등록할까요?`)], quick(["등록하기", `거래처 등록 ${q}`], "거래처 목록", "메뉴"));
    }
    return reply([list(`‘${q}’ 거래처 ${hits.length}곳`, hits.map((s) => ({ title: s.name, description: KIND_LABEL[s.kind], messageText: `거래처 ${s.name}` })))], MENU);
  }

  async supplierCard(s: Supplier): Promise<SkillResponse> {
    const [products, sources] = await Promise.all([this.products(), this.sources()]);
    const main = products.filter((p) => p.supplier_id === s.id).length;
    const any = new Set([...products.filter((p) => p.supplier_id === s.id).map((p) => p.id), ...sources.filter((x) => x.supplier_id === s.id).map((x) => x.product_id)]).size;
    const desc = [
      `${KIND_LABEL[s.kind]}${s.favorite ? " · ⭐ 자주 쓰는 곳" : ""}`,
      s.contact && `담당: ${s.contact}`,
      s.phone && `전화: ${s.phone}`,
      s.order_note && `주문 조건: ${s.order_note}`,
      s.memo && `메모: ${s.memo}`,
      `상품 ${any}개 (주 거래처 ${main}개)`,
    ].filter(Boolean).join("\n");
    const buttons: Button[] = [];
    if (s.website) buttons.push(link("사이트 열기", s.website.startsWith("http") ? s.website : `https://${s.website}`));
    if (s.phone) buttons.push(call("전화하기", s.phone));
    buttons.push(say("상품 보기", `거래처 상품 ${s.name}`));
    return reply(
      [card(s.name, desc, buttons)],
      quick(["수정", `거래처 수정 ${s.name}`], this.user.role === "admin" && ["삭제", `거래처 삭제 ${s.name}`], "거래처 목록", "메뉴"),
    );
  }

  async supplierProducts(arg: string): Promise<SkillResponse> {
    let name = arg.trim();
    let page = 1;
    let found = await this.findSuppliers(name);
    const pm = name.match(/^(.*\S)\s+(\d+)$/);
    if (!found.exact && pm) {
      name = pm[1];
      page = Number(pm[2]);
      found = await this.findSuppliers(name);
    }
    if (!found.exact) return this.supplierSearch(name);
    const s = found.exact;
    const [products, sources, suppliers] = await Promise.all([this.products(), this.sources(), this.suppliers()]);
    const here = new Map(sources.filter((x) => x.supplier_id === s.id).map((x) => [x.product_id, x]));
    const rows = products
      .filter((p) => p.supplier_id === s.id || here.has(p.id))
      .sort((a, b) => a.stock_qty - b.stock_qty);
    if (!rows.length) {
      return reply([text(`${s.name}에서 사는 상품이 아직 없어요. 상품에서 ‘가격 기록’을 하면 여기에 모여요.`)], quick(["가격 기록", "가격 기록"], "메뉴"));
    }
    const pages = Math.ceil(rows.length / PAGE);
    const p = Math.min(Math.max(page, 1), pages);
    const supName = (id: string) => suppliers.find((x) => x.id === id)?.name ?? "";
    const items = rows.slice((p - 1) * PAGE, p * PAGE).map((prod) => {
      const mine = here.get(prod.id);
      const price = mine?.price ?? (prod.supplier_id === s.id ? prod.cost_price || null : null);
      const best = sortSources(sources.filter((x) => x.product_id === prod.id))[0];
      const cheaper = best && best.price != null && price != null && best.supplier_id !== s.id && best.price < price;
      return {
        title: prod.name,
        description: [price != null ? won(price) : "가격 미확인", `재고 ${num(prod.stock_qty)}개`, cheaper ? `${supName(best.supplier_id)} 더 쌈` : ""]
          .filter(Boolean)
          .join(" · "),
        messageText: `상품 ${prod.name}`,
      };
    });
    return reply(
      [list(`${s.name} 상품 ${rows.length}개${pages > 1 ? ` (${p}/${pages})` : ""}`, items)],
      quick(p < pages && ["다음 ▶", `거래처 상품 ${s.name} ${p + 1}`], p > 1 && ["◀ 이전", `거래처 상품 ${s.name} ${p - 1}`], ["거래처 정보", `거래처 ${s.name}`], "메뉴"),
    );
  }

  // 거래처 등록: 이름 → 종류 → 사이트 → 담당자 → 전화 → 주문 조건 → 메모 → 확인
  private static NEW_STEPS = ["name", "kind", "website", "contact", "phone", "order_note", "memo", "confirm"] as const;
  private static ASK: Record<string, string> = {
    name: "새 거래처 이름을 보내 주세요. (예: 도매꾹, 남대문 OO상가)",
    kind: "어떤 곳이에요?",
    website: "사이트 주소가 있으면 보내 주세요.",
    contact: "담당자 이름이나 카톡 ID가 있으면 보내 주세요.",
    phone: "전화번호가 있으면 보내 주세요.",
    order_note: "주문 조건을 적어 주세요. (예: 3만원 이상 무료배송 · 2일 소요)",
    memo: "메모할 게 있으면 보내 주세요. (영업시간, 결제 방법 등)",
  };

  async startNewSupplier(name: string): Promise<SkillResponse> {
    const n = clean(name);
    if (!n) {
      await this.setSession({ flow: "sup_new", step: "name", data: {} });
      return reply([text(Bot.ASK.name)], CANCEL);
    }
    return this.newSupplierStep({ flow: "sup_new", step: "name", data: {}, at: "" }, n);
  }

  private askNew(step: string, data: BotSession["data"]): Promise<SkillResponse> {
    return this.setSession({ flow: "sup_new", step, data }).then(() => {
      if (step === "kind") return reply([text(Bot.ASK.kind)], quick("온라인", "도매", "오프라인", "기타", "취소"));
      if (step === "confirm") return reply([this.supplierSummary(data)], quick("저장", "취소"));
      return reply([text(`${Bot.ASK[step]}\n(없으면 ‘건너뛰기’)`)], quick("건너뛰기", "여기까지 저장", "취소"));
    });
  }

  private supplierSummary(d: BotSession["data"]) {
    const lines = [
      `종류: ${KIND_LABEL[(d.kind as SupplierKind) ?? "online"]}`,
      d.website && `사이트: ${d.website}`,
      d.contact && `담당: ${d.contact}`,
      d.phone && `전화: ${d.phone}`,
      d.order_note && `주문 조건: ${d.order_note}`,
      d.memo && `메모: ${d.memo}`,
    ].filter(Boolean);
    return card(`이렇게 저장할까요? · ${String(d.name)}`, lines.join("\n"));
  }

  async newSupplierStep(s: BotSession, said: string): Promise<SkillResponse> {
    const data = { ...s.data };
    const steps = Bot.NEW_STEPS;
    const next = (from: string) => steps[steps.indexOf(from as (typeof steps)[number]) + 1];

    if (s.step === "confirm" || said === "여기까지 저장") {
      if (s.step === "confirm" && !/^(저장|네|응|예|ㅇㅇ|ok|좋아)/i.test(said)) {
        return reply([text("‘저장’ 또는 ‘취소’를 눌러 주세요.")], quick("저장", "취소"));
      }
      if (!data.name) return this.askNew("name", data);
      const input: SupplierInput = {
        name: String(data.name),
        kind: (data.kind as SupplierKind) ?? "online",
        website: (data.website as string) ?? null,
        contact: (data.contact as string) ?? null,
        phone: (data.phone as string) ?? null,
        order_note: (data.order_note as string) ?? null,
        memo: (data.memo as string) ?? null,
        favorite: false,
      };
      const saved = await this.db.saveSupplier(input);
      await this.setSession(null);
      this.refreshData();
      const res = await this.supplierCard(saved);
      res.template.outputs.unshift(text(`‘${saved.name}’ 거래처를 등록했어요 ✨ 앱에도 바로 보여요.`));
      return res;
    }

    if (s.step === "name") {
      if (!said) return this.askNew("name", data);
      const dup = (await this.suppliers()).find((x) => norm(x.name) === norm(said));
      if (dup) {
        await this.setSession({ flow: "sup_new", step: "name", data });
        return reply([text(`${j(`‘${dup.name}’`, "은")} 이미 있어요. 다른 이름을 보내 주세요.`)], quick(["그 거래처 보기", `거래처 ${dup.name}`], "취소"));
      }
      data.name = said.slice(0, 60);
      return this.askNew("kind", data);
    }
    if (s.step === "kind") {
      const kind = parseKind(said);
      if (!kind) return reply([text("온라인 · 도매 · 오프라인 · 기타 중에서 골라 주세요.")], quick("온라인", "도매", "오프라인", "기타", "취소"));
      data.kind = kind;
      return this.askNew(next("kind"), data);
    }
    // 고를 수 있는 칸들
    if (!isSkip(said)) {
      if (s.step === "website" && !/\./.test(said)) {
        return reply([text("주소가 맞는지 확인해 주세요. (예: domeggook.com) 없으면 ‘건너뛰기’")], quick("건너뛰기", "취소"));
      }
      data[s.step] = said.slice(0, 300);
    }
    return this.askNew(next(s.step), data);
  }

  // 거래처 수정: 거래처 → 고칠 칸 → 새 값
  private static FIELDS: Record<string, keyof SupplierInput> = {
    이름: "name",
    종류: "kind",
    사이트: "website",
    담당자: "contact",
    전화: "phone",
    "주문 조건": "order_note",
    메모: "memo",
    "자주 쓰는 곳": "favorite",
  };

  async startEdit(name: string): Promise<SkillResponse> {
    if (!clean(name)) return reply([text("어느 거래처를 고칠까요? ‘거래처 수정 도매꾹’처럼 보내 주세요.")], quick("거래처 목록", "메뉴"));
    const { exact, hits } = await this.findSuppliers(name);
    if (!exact) {
      if (!hits.length) return this.supplierSearch(name);
      return reply([list("어느 거래처를 고칠까요?", hits.map((s) => ({ title: s.name, messageText: `거래처 수정 ${s.name}` })))], CANCEL);
    }
    await this.setSession({ flow: "sup_edit", step: "field", data: { id: exact.id, name: exact.name } });
    return reply([text(`‘${exact.name}’에서 무엇을 고칠까요?`)], quick(...Object.keys(Bot.FIELDS), "취소"));
  }

  async editStep(s: BotSession, said: string): Promise<SkillResponse> {
    const sup = (await this.suppliers()).find((x) => x.id === s.data.id);
    if (!sup) {
      await this.setSession(null);
      return reply([text("그 거래처가 없어졌어요.")], MENU);
    }
    if (s.step === "field") {
      const field = Bot.FIELDS[said.replace(/\s+/g, " ")] ?? Bot.FIELDS[said.replace(/\s+/g, "")];
      if (!field) return reply([text("아래에서 고칠 칸을 골라 주세요.")], quick(...Object.keys(Bot.FIELDS), "취소"));
      if (field === "favorite") {
        const saved = await this.saveSupplierPatch(sup, { favorite: !sup.favorite });
        await this.setSession(null);
        const res = await this.supplierCard(saved);
        res.template.outputs.unshift(text(saved.favorite ? "⭐ 자주 쓰는 곳으로 표시했어요." : "자주 쓰는 곳 표시를 뺐어요."));
        return res;
      }
      await this.setSession({ flow: "sup_edit", step: "value", data: { ...s.data, field } });
      if (field === "kind") return reply([text("어떤 곳으로 바꿀까요?")], quick("온라인", "도매", "오프라인", "기타", "취소"));
      const cur = sup[field];
      return reply(
        [text(`바꿀 ${said} 내용을 보내 주세요.${cur ? `\n지금: ${String(cur)}` : ""}${field !== "name" ? "\n(비우려면 ‘지우기’)" : ""}`)],
        quick(field !== "name" && "지우기", "취소"),
      );
    }
    // value
    const field = s.data.field as keyof SupplierInput;
    let value: string | null = said.slice(0, 300);
    if (field === "kind") {
      const kind = parseKind(said);
      if (!kind) return reply([text("온라인 · 도매 · 오프라인 · 기타 중에서 골라 주세요.")], quick("온라인", "도매", "오프라인", "기타", "취소"));
      value = kind;
    } else if (isClear(said)) {
      if (field === "name") return reply([text("이름은 비울 수 없어요. 새 이름을 보내 주세요.")], CANCEL);
      value = null;
    } else if (field === "name") {
      const dup = (await this.suppliers()).find((x) => x.id !== sup.id && norm(x.name) === norm(said));
      if (dup) return reply([text(`${j(`‘${dup.name}’`, "은")} 이미 있어요. 다른 이름을 보내 주세요.`)], CANCEL);
    }
    const saved = await this.saveSupplierPatch(sup, { [field]: value } as Partial<SupplierInput>);
    await this.setSession(null);
    const res = await this.supplierCard(saved);
    res.template.outputs.unshift(text("고쳤어요 ✨"));
    return res;
  }

  private async saveSupplierPatch(sup: Supplier, patch: Partial<SupplierInput>) {
    const { id, created_at: _c, updated_at: _u, ...rest } = sup;
    const saved = await this.db.saveSupplier({ ...rest, ...patch }, id);
    this.refreshData();
    return saved;
  }

  async startDelete(name: string): Promise<SkillResponse> {
    if (this.user.role !== "admin") return reply([text("거래처 삭제는 관리자만 할 수 있어요.")], MENU);
    const { exact, hits } = await this.findSuppliers(name);
    if (!exact) {
      if (!hits.length) return reply([text(`‘${name}’ 거래처가 없어요.`)], quick("거래처 목록", "메뉴"));
      return reply([list("어느 거래처를 삭제할까요?", hits.map((s) => ({ title: s.name, messageText: `거래처 삭제 ${s.name}` })))], CANCEL);
    }
    const [products, sources] = await Promise.all([this.products(), this.sources()]);
    const main = products.filter((p) => p.supplier_id === exact.id).length;
    const prices = sources.filter((x) => x.supplier_id === exact.id).length;
    await this.setSession({ flow: "sup_del", step: "confirm", data: { id: exact.id, name: exact.name } });
    return reply(
      [
        text(
          [
            `정말 ${j(`‘${exact.name}’`, "을")} 삭제할까요?`,
            main ? `상품 ${main}개의 주 거래처가 비워져요.` : "",
            prices ? `이 거래처의 가격 ${prices}줄과 가격 기록이 지워져요.` : "",
            "상품은 그대로 남아요.",
          ].filter(Boolean).join("\n"),
        ),
      ],
      quick(["삭제할게요", "삭제"], "취소"),
    );
  }

  async deleteStep(s: BotSession, said: string): Promise<SkillResponse> {
    await this.setSession(null);
    if (this.user.role !== "admin") return reply([text("거래처 삭제는 관리자만 할 수 있어요.")], MENU);
    if (!/^삭제/.test(said)) return reply([text("삭제하지 않았어요.")], MENU);
    await this.db.deleteSupplier(String(s.data.id));
    return reply([text(`${j(`‘${String(s.data.name)}’`, "을")} 삭제했어요.`)], quick("거래처 목록", "메뉴"));
  }

  // --- 상품 -------------------------------------------------------------------

  async productSearch(q: string): Promise<SkillResponse> {
    const hits = await this.findProducts(q);
    if (hits.length === 1) return this.productCard(hits[0]);
    if (!hits.length) return reply([text(`‘${q}’ 상품을 못 찾았어요. 이름 일부나 바코드로 다시 보내 주세요.`)], quick("상품 찾기", "메뉴"));
    return reply(
      [list(`‘${q}’ 상품 ${hits.length}개`, hits.slice(0, 5).map((p) => ({ title: p.name, description: `재고 ${num(p.stock_qty)}개 · ${won(p.sale_price)}`, messageText: `상품 ${p.name}` })))],
      hits.length > 5 ? quick(["더 정확히 찾기", "상품 찾기"], "메뉴") : MENU,
    );
  }

  /** 거래처별 가격 줄들 (가격 순, 제일 싼 곳 🏆) */
  private async priceLines(p: Product): Promise<{ lines: string[]; rows: ProductSource[] }> {
    const [sources, suppliers] = await Promise.all([this.sources(), this.suppliers()]);
    const supName = (id: string) => suppliers.find((s) => s.id === id)?.name;
    const rows = sortSources(sources.filter((x) => x.product_id === p.id && supName(x.supplier_id)));
    const lines = rows.slice(0, 6).map((r, i) => {
      const top = i === 0 && rows.length > 1 && r.price != null;
      return `${top ? "🏆" : "•"} ${supName(r.supplier_id)} ${r.price != null ? won(r.price) : "가격 미확인"}${r.supplier_id === p.supplier_id ? " (주)" : ""}${r.price_at ? ` · ${relTime(r.price_at)}` : ""}${r.price != null && isStale(r.price_at, 60, this.now.getTime()) ? " · 오래됨" : ""}`;
    });
    return { lines, rows };
  }

  async productCard(p: Product): Promise<SkillResponse> {
    const suppliers = await this.suppliers();
    const { lines, rows } = await this.priceLines(p);
    const m = margin(p.cost_price, p.sale_price);
    const cheaper = cheaperThanMain(p, rows);
    const supName = (id: string) => suppliers.find((s) => s.id === id)?.name ?? "";
    const desc = [
      `재고 ${num(p.stock_qty)}개${p.safety_stock ? ` (발주 기준 ${num(p.safety_stock)}개)` : ""}${p.is_active ? "" : " · 판매 중지"}`,
      `판매가 ${won(p.sale_price)} · 원가 ${won(p.cost_price)} · 마진 ${m.rate.toFixed(0)}%`,
      lines.length ? "\n거래처별 가격" : "\n거래처 가격이 아직 없어요",
      ...lines,
      cheaper ? `\n💡 ${supName(cheaper.source.supplier_id)}에서 사면 개당 ${won(cheaper.save)} 아껴요` : "",
    ].filter(Boolean).join("\n");
    const best = rows.find((r) => r.purchase_url) ;
    const orderUrl = (cheaper?.source.purchase_url || rows.find((r) => r.supplier_id === p.supplier_id)?.purchase_url || p.purchase_url || best?.purchase_url) ?? null;
    const buttons: Button[] = [];
    if (orderUrl) buttons.push(link("다시 주문하기", orderUrl.startsWith("http") ? orderUrl : `https://${orderUrl}`));
    buttons.push(say("가격 기록", `가격 기록 ${p.name}`));
    buttons.push(link("앱에서 보기", this.app(`/products/${p.id}`)));
    return reply(
      [card(p.name, desc, buttons)],
      quick(p.supplier_id && ["주 거래처 상품", `거래처 상품 ${supName(p.supplier_id)}`], "발주 목록", "상품 찾기", "메뉴"),
    );
  }

  // 가격 기록: 상품 → 거래처 → 개당 가격 → 확인(원가도 바꿀지)
  async startPrice(arg: string): Promise<SkillResponse> {
    if (!clean(arg)) {
      await this.setSession({ flow: "price", step: "product", data: {} });
      return reply([text("어떤 상품 가격이에요? 상품 이름이나 바코드를 보내 주세요.")], CANCEL);
    }
    return this.priceStep({ flow: "price", step: "product", data: {}, at: "" }, clean(arg));
  }

  async priceStep(s: BotSession, said: string): Promise<SkillResponse> {
    const data = { ...s.data };
    const products = await this.products();
    const product = products.find((p) => p.id === data.productId);

    if (s.step === "product") {
      const hits = await this.findProducts(said);
      if (!hits.length) {
        await this.setSession({ flow: "price", step: "product", data });
        return reply([text(`‘${said}’ 상품을 못 찾았어요. 다시 보내 주세요.`)], CANCEL);
      }
      if (hits.length > 1) {
        await this.setSession({ flow: "price", step: "product", data });
        return reply([list("어느 상품이에요?", hits.slice(0, 5).map((p) => ({ title: p.name, description: `재고 ${num(p.stock_qty)}개`, messageText: p.name })))], CANCEL);
      }
      data.productId = hits[0].id;
      return this.askPriceSupplier(hits[0], data);
    }
    if (!product) {
      await this.setSession(null);
      return reply([text("그 상품이 없어졌어요. 처음부터 다시 해 주세요.")], MENU);
    }

    if (s.step === "supplier") {
      const { exact, hits } = await this.findSuppliers(said);
      if (!exact) {
        await this.setSession({ flow: "price", step: "supplier", data });
        if (!hits.length) {
          return reply([text(`‘${said}’ 거래처가 없어요. 이름을 다시 보내거나, ‘취소’ 후 ‘거래처 등록’으로 먼저 추가해 주세요.`)], CANCEL);
        }
        return reply([text("어느 거래처예요?")], quick(...hits.slice(0, 9).map((h) => h.name), "취소"));
      }
      data.supplierId = exact.id;
      data.supplierName = exact.name;
      await this.setSession({ flow: "price", step: "price", data });
      const cur = (await this.sources()).find((x) => x.product_id === product.id && x.supplier_id === exact.id);
      return reply(
        [text(`${exact.name}에서 ‘${product.name}’ 개당 얼마예요? 숫자로 보내 주세요.${cur?.price != null ? `\n지난번 ${won(cur.price)} (${relTime(cur.price_at)})` : ""}`)],
        CANCEL,
      );
    }

    if (s.step === "price") {
      const price = parsePrice(said);
      if (price == null) return reply([text("가격을 숫자로 보내 주세요. (예: 1800, 1,800원, 2만)")], CANCEL);
      data.price = price;
      await this.setSession({ flow: "price", step: "confirm", data });
      return reply(
        [text(`${String(data.supplierName)} · ${product.name}\n개당 ${won(price)}으로 기록할까요?\n(지금 원가 ${won(product.cost_price)})`)],
        quick(["기록하기", "기록"], ["원가도 바꾸기", "기록하고 원가도 바꾸기"], "취소"),
      );
    }

    // confirm
    if (!/^(기록|저장|네|응|예|ㅇㅇ|ok|좋아)/i.test(said)) {
      return reply([text("‘기록하기’ 또는 ‘취소’를 눌러 주세요.")], quick(["기록하기", "기록"], ["원가도 바꾸기", "기록하고 원가도 바꾸기"], "취소"));
    }
    const setCost = /원가/.test(said);
    await this.db.recordPrice(
      { product_id: product.id, supplier_id: String(data.supplierId), price: Number(data.price), set_cost: setCost },
      this.user.name,
    );
    await this.setSession(null);
    this.refreshData();
    const fresh = (await this.products()).find((p) => p.id === product.id) ?? product;
    const { lines } = await this.priceLines(fresh);
    return reply(
      [text(`기록했어요 ✨${setCost ? " 원가도 바꿨어요." : ""}\n\n${fresh.name} 거래처별 가격\n${lines.join("\n")}`)],
      quick(["다른 거래처 가격", `가격 기록 ${fresh.name}`], ["상품 보기", `상품 ${fresh.name}`], "메뉴"),
    );
  }

  private async askPriceSupplier(p: Product, data: BotSession["data"]): Promise<SkillResponse> {
    await this.setSession({ flow: "price", step: "supplier", data });
    const [{ lines, rows }, suppliers] = await Promise.all([this.priceLines(p), this.suppliers()]);
    const names = [
      ...rows.map((r) => suppliers.find((s) => s.id === r.supplier_id)?.name).filter((x): x is string => Boolean(x)),
      ...suppliers.filter((s) => s.favorite).map((s) => s.name),
    ];
    const unique = [...new Set(names)].slice(0, 9);
    return reply(
      [text(`‘${p.name}’ 어느 거래처 가격이에요? 이름을 보내거나 골라 주세요.${lines.length ? `\n\n지금 기록\n${lines.join("\n")}` : ""}`)],
      quick(...unique, "취소"),
    );
  }

  // --- 발주 · 매출 ------------------------------------------------------------

  async reorder(): Promise<SkillResponse> {
    const [products, sources, suppliers] = await Promise.all([this.products(), this.sources(), this.suppliers()]);
    const need = products.filter((p) => p.is_active && (p.stock_qty <= 0 || (p.safety_stock > 0 && p.stock_qty <= p.safety_stock)));
    if (!need.length) return reply([text("지금 발주할 상품이 없어요 🎉 재고가 넉넉해요.")], MENU);

    const groups = new Map<string, Product[]>();
    for (const p of need) groups.set(p.supplier_id ?? "", [...(groups.get(p.supplier_id ?? "") ?? []), p]);
    const supOf = (id: string) => suppliers.find((s) => s.id === id);
    const cards = [...groups.entries()]
      .sort((a, b) => b[1].length - a[1].length)
      .map(([sid, items]) => {
        const sup = supOf(sid);
        let total = 0;
        const lines = items
          .sort((a, b) => a.stock_qty - b.stock_qty)
          .map((p) => {
            const rows = sources.filter((x) => x.product_id === p.id);
            const here = rows.find((x) => x.supplier_id === sid)?.price ?? (p.cost_price || null);
            const qty = suggestQty(p);
            if (here) total += here * qty;
            const alt = cheaperThanMain(p, rows);
            return `• ${p.name} ${num(p.stock_qty)}/${num(p.safety_stock)} → ${num(qty)}개${here ? ` · ${won(here)}` : ""}${alt ? `\n  ↳ ${supOf(alt.source.supplier_id)?.name ?? ""} ${won(alt.source.price)} 더 쌈` : ""}`;
          });
        const shown = lines.slice(0, 6);
        const buttons: Button[] = [];
        const url = sup?.website || items.map((p) => sources.find((x) => x.product_id === p.id && x.supplier_id === sid)?.purchase_url || p.purchase_url).find(Boolean);
        if (url) buttons.push(link("주문하러 가기", url.startsWith("http") ? url : `https://${url}`));
        if (sup?.phone) buttons.push(call("전화하기", sup.phone));
        buttons.push(link("앱 발주 화면", this.app("/reorder")));
        return {
          title: `${sup?.name ?? "거래처 미지정"} · ${items.length}개`,
          description: [...shown, lines.length > shown.length ? `+ ${lines.length - shown.length}개 더` : "", total ? `예상 ${won(total)}` : "", sup?.order_note ? `🚚 ${sup.order_note}` : ""]
            .filter(Boolean)
            .join("\n"),
          buttons,
        };
      });
    const outputs = [text(`발주할 상품 ${need.length}개 · 거래처 ${groups.size}곳\n(재고/발주 기준 → 추천 수량 · 개당 가격)`), carousel(cards)];
    if (cards.length > 10) outputs.push(text(`거래처가 많아서 10곳만 보여드렸어요. 나머지는 앱 발주 화면에서 봐 주세요.`));
    return reply(outputs, MENU);
  }

  async sales(): Promise<SkillResponse> {
    const day = kstDay(this.now);
    const s = await this.db.todaySales(day);
    if (s.source === "none") {
      return reply([text(s.note ?? "빅솔론 매출이 아직 연결되지 않았어요. 앱의 매출 화면에서 연결 상태를 확인해 주세요.")], MENU);
    }
    const [, mm, dd] = day.split("-");
    const top = [...s.items].sort((a, b) => b.qty - a.qty || b.amount - a.amount).slice(0, 5);
    const desc = [
      `${won(s.amount)} · ${num(s.qty)}개 팔렸어요`,
      top.length ? "\n많이 팔린 상품" : "아직 판매가 없어요",
      ...top.map((it, i) => `${i + 1}. ${it.name} ${num(it.qty)}개 · ${won(it.amount)}`),
      s.note ? `\n${s.note}` : "",
    ].filter(Boolean).join("\n");
    return reply([card(`오늘 매출 · ${Number(mm)}월 ${Number(dd)}일`, desc, [link("앱 매출 화면", this.app("/sales"))])], MENU);
  }

  // --- AI: 정해진 말이 아닐 때 ------------------------------------------------

  private timeLeft() {
    return (this.ctx.deadline ?? Date.now() + 60_000) - Date.now();
  }

  /**
   * 정해진 말이 아니면: 이름 하나로 바로 찾아지면 찾기 결과, 아니면 AI가 뜻을 알아내서
   * 챗봇의 정해진 명령으로 실행해요. AI가 없거나 늦거나 모르면 낱말(발주·매출…)로 한 번 더, 그래도 없으면 이름 찾기.
   */
  async understand(said: string, viaAi: boolean): Promise<BotReply> {
    if (!viaAi && said) {
      const [sup, prods] = await Promise.all([this.findSuppliers(said), this.findProducts(said)]);
      const clearHit = Boolean(sup.exact) || (said.length <= 15 && prods.length > 0 && prods.length <= 5);
      if (!clearHit) {
        if (this.ctx.ai) {
          const routed = await this.aiRoute(said);
          if (routed) return routed;
        }
        const kw = await this.keywordRoute(said);
        if (kw) return kw;
      }
    }
    return this.anything(said);
  }

  /** AI 없이 낱말로 고르기 (AI가 늦거나 모를 때의 안전망) */
  private async keywordRoute(said: string): Promise<SkillResponse | null> {
    const sups = await this.suppliers();
    const n = norm(said);
    const named = sups.filter((x) => norm(x.name).length >= 2 && n.includes(norm(x.name)));
    if (named.length === 1) return this.supplierCard(named[0]);
    if (/발주|품절|재주문|채워\s*(?:넣|야)|부족/.test(said)) return this.reorder();
    if (/매출|팔린|팔렸|판매\s*(?:얼마|금액|현황)/.test(said)) return this.sales();
    if (/(?:주문|예약)\s*(?:목록|뭐|몇|있)/.test(said)) return this.orderList(1);
    if (/거래처\s*(?:목록|뭐|몇|전체)/.test(said)) return this.supplierList(1);
    if (/도움|뭐\s*할\s*수|기능/.test(said)) return this.help();
    const topic = HOWTO_RE.test(said) ? howtoTopic(said) : null;
    return topic ? this.howtoReply(topic) : null;
  }

  private async aiRoute(said: string): Promise<BotReply | null> {
    const ai = this.ctx.ai;
    // DB를 읽고 답을 만들 시간(약 1초)은 남겨 둬요
    const budget = this.timeLeft() - 1000;
    // 콜백을 켰으면 늦어도 괜찮아요: ‘알아보고 있어요’라고 먼저 답하고 결과는 나중에 보내요
    const callback = this.ctx.callback;
    if (!ai || (budget < 800 && !callback)) return null;
    const suppliers = (await this.suppliers()).map((x) => x.name).slice(0, 80);
    const t0 = Date.now();
    const routing = ai.route(said, { suppliers }, { timeoutMs: callback ? 9000 : 2600 }).catch(() => null);
    const r = await Promise.race([routing, sleep(Math.max(budget, 0)).then((): typeof SLOW => SLOW)]);
    if (r === SLOW) {
      console.warn(`[kakao ai] route: no answer in ${Date.now() - t0}ms${callback ? " → callback" : " → fallback"}`);
      if (!callback) return null;
      callback(
        routing.then(async (late) => {
          const out = late ? await this.dispatch(late, said, true) : null;
          return out && !isCallbackAck(out) ? out : (await this.keywordRoute(said)) ?? (await this.anything(said));
        }),
      );
      return callbackAck("무슨 말인지 알아보고 있어요 ⏳");
    }
    console.info(`[kakao ai] route: ${r ? r.intent : "failed"} in ${Date.now() - t0}ms`);
    return r ? this.dispatch(r, said, false) : null;
  }

  /** AI가 고른 뜻 → 챗봇의 정해진 명령. late = 콜백으로 나중에 보내는 중(주문 정리를 끝까지 기다려요) */
  private async dispatch(r: AiRoute, said: string, late: boolean): Promise<BotReply | null> {
    const q = clean(r.query ?? "");
    switch (r.intent) {
      case "orders":
        if (late && this.ctx.ai) {
          return this.ctx.ai.orderChat(said, [], this.user.profileId).then(
            (res) => this.orderResult(res),
            (e) => reply([text(`주문을 정리하지 못했어요 😢 ${errMsg(e)}\n다시 보내 주세요.`)], quick("주문 목록", "메뉴")),
          );
        }
        return this.orderFlow(said);
      case "order_list":
        return this.orderList(1);
      case "supplier":
        return q ? this.supplierSearch(q) : this.supplierList(1);
      case "supplier_list":
        return this.supplierList(1);
      case "supplier_products":
        return q ? this.supplierProducts(q) : this.supplierList(1);
      case "supplier_new":
        return this.startNewSupplier(q);
      case "supplier_edit":
        return this.startEdit(q);
      case "product":
        return q ? this.productSearch(q) : this.askSearch("product");
      case "price_record":
        return this.startPrice(q);
      case "reorder":
        return this.reorder();
      case "sales":
        return this.sales();
      case "howto": {
        const topic = topicFromQuery(r.query, said);
        return topic ? this.howtoReply(topic) : this.help();
      }
      case "help":
        return this.help();
      default:
        return null;
    }
  }

  // --- 주문 (꽃다발 등 예약) ----------------------------------------------------

  /**
   * 주문 비서(앱과 같은 두뇌)에게 맡겨요. 정해진 모양은 AI 없이 바로, 아니면 AI.
   * 5초 안에 못 끝나면: 콜백을 켰으면 자동으로 이어서 보내고, 아니면 ‘결과 보기’로 받아 가게 해서 두 번 등록되지 않아요.
   */
  async orderFlow(said: string, history: OrderChatTurn[] = []): Promise<BotReply> {
    const ai = this.ctx.ai;
    if (!ai) {
      return reply(
        [text("주문 비서를 쓰려면 서버에 OPENAI_API_KEY가 필요해요. 지금은 앱의 주문 화면에서 직접 넣어 주세요.")],
        quick("주문 목록", "메뉴"),
      );
    }
    const work = ai.orderChat(said, history, this.user.profileId).then((r) => this.orderResult(r));
    const failed = (e: unknown) => reply([text(`주문을 정리하지 못했어요 😢 ${errMsg(e)}\n다시 보내 주세요.`)], quick("주문 목록", "메뉴"));

    // 정해진 모양의 주문은 AI 없이 바로 끝나요 → 기다릴 수 있는 만큼 기다렸다가 바로 답해요
    let first: SkillResponse | typeof SLOW;
    try {
      first = await Promise.race([work, sleep(this.timeLeft() - 300).then((): typeof SLOW => SLOW)]);
    } catch (e) {
      return failed(e);
    }
    if (first !== SLOW) return first;

    // 블록에서 콜백을 켰으면: ‘정리 중’이라고 먼저 답하고, 다 되면 카카오가 알아서 보여줘요 (누를 것 없음)
    if (this.ctx.callback) {
      this.ctx.callback(work.catch(failed));
      return callbackAck("주문을 정리하고 있어요 ⏳ 잠시만요!");
    }

    // 늦어요: ‘정리 중’을 저장해 두고, 끝나면 결과를 저장 → ‘결과 보기’ 또는 같은 말을 다시 보내면 그걸 보여줘요
    await this.setSession({ flow: "ai_job", step: "running", data: { said } });
    this.ctx.defer?.(
      work.then(
        (res) => this.finishJob(said, "done", JSON.stringify(res)),
        (e) => this.finishJob(said, "error", errMsg(e)),
      ),
    );
    return reply([text("주문을 정리하고 있어요 ⏳\n몇 초 뒤에 ‘결과 보기’를 눌러 주세요.")], quick(["결과 보기", "결과"], "주문 목록"));
  }

  /** 늦게 끝난 주문 정리 결과를 저장해요 (그새 다른 걸 시작했으면 덮어쓰지 않아요) */
  private async finishJob(said: string, step: "done" | "error", payload: string) {
    const cur = await this.db.getSession(this.user.key);
    if (!cur || cur.flow !== "ai_job" || cur.data.said !== said) return;
    await this.db.setSession(this.user.key, {
      flow: "ai_job",
      step,
      data: step === "done" ? { said, reply: payload } : { said, error: payload },
      at: new Date().toISOString(),
    });
  }

  async jobStep(s: BotSession, said: string): Promise<BotReply> {
    const asking = /^(결과|결과\s*보기|됐어\??|다\s*됐어\??|어떻게\s*됐어\??)$/.test(said) || said === s.data.said;
    if (!asking) {
      // 다른 말이면 기다리던 결과는 놔두고 새 말을 처리해요 (주문은 앱 ‘주문 목록’에서 확인)
      await this.setSession(null);
      return this.command(said);
    }
    if (s.step === "running") {
      if (this.now.getTime() - new Date(s.at).getTime() > JOB_STALE_MS) {
        await this.setSession(null);
        return reply(
          [text("정리가 너무 오래 걸려서 멈췄어요 😢 ‘주문 목록’에서 들어갔는지 확인하고, 없으면 다시 보내 주세요.")],
          quick("주문 목록", "메뉴"),
        );
      }
      return reply([text("아직 정리하고 있어요 ⏳ 조금만 더 있다가 ‘결과 보기’를 눌러 주세요.")], quick(["결과 보기", "결과"], "주문 목록"));
    }
    await this.setSession(null);
    if (s.step === "error") {
      return reply([text(`주문을 정리하지 못했어요 😢 ${String(s.data.error ?? "")}\n다시 보내 주세요.`)], quick("주문 목록", "메뉴"));
    }
    try {
      return JSON.parse(String(s.data.reply)) as SkillResponse;
    } catch {
      return reply([text("결과를 읽지 못했어요. ‘주문 목록’에서 확인해 주세요.")], quick("주문 목록", "메뉴"));
    }
  }

  private orderLine(o: Order, today: string) {
    const t = timeLabel(normTime(o.due_time));
    return {
      title: `${md(o.due_date)}${t ? ` ${t}` : ""} ${o.method === "delivery" ? "📦" : "🛍"} ${o.customer || "-"}`,
      description: [o.item, o.price ? won(o.price) : "", o.status === "open" ? dLabel(daysUntil(o.due_date, today)) : ""]
        .filter(Boolean)
        .join(" · "),
    };
  }

  private orderResult(r: OrderChatResult): SkillResponse {
    const today = kstDay(this.now);
    const lines = r.changes.map((c) => {
      const l = this.orderLine(c.order, today);
      return `✅ ${OP_LABEL[c.op]} ${l.title} · ${l.description}`;
    });
    const body = [r.reply, ...(lines.length ? ["", ...lines] : []), ...r.skipped.map((x) => `⚠️ ${x}`)].join("\n");
    return reply([text(body)], quick("주문 목록", "오늘 픽업", "메뉴"));
  }

  private async openOrders(): Promise<Order[]> {
    const all = await this.db.listOrders();
    const when = (o: Order) => `${o.due_date} ${normTime(o.due_time) ?? "99:99"}`;
    return all.filter((o) => o.status === "open").sort((a, b) => when(a).localeCompare(when(b)));
  }

  async orderList(page: number): Promise<SkillResponse> {
    const today = kstDay(this.now);
    const all = await this.openOrders();
    if (!all.length) {
      return reply(
        [text("진행 중인 주문이 없어요.\n주문을 그대로 보내면 등록해요.\n예) 11/20 금 오후 3시 픽업 김포포 꽃다발 2.5만원")],
        quick("메뉴"),
      );
    }
    const pages = Math.ceil(all.length / PAGE);
    const p = Math.min(Math.max(page, 1), pages);
    const items: ListItem[] = all.slice((p - 1) * PAGE, p * PAGE).map((o) => this.orderLine(o, today));
    const ship = all.filter((o) => o.method === "delivery" && daysUntil(o.due_date, today) <= 7).length;
    return reply(
      [
        list(`진행 중인 주문 ${num(all.length)}건${pages > 1 ? ` (${p}/${pages})` : ""}`, items, [link("앱에서 보기", this.app("/orders"))]),
        ...(ship ? [text(`📦 7일 안에 보낼 택배가 ${num(ship)}건 있어요.`)] : []),
      ],
      quick(p < pages && ["다음 ▶", `주문 목록 ${p + 1}`], p > 1 && ["◀ 이전", `주문 목록 ${p - 1}`], "오늘 픽업", "내일 픽업", "메뉴"),
    );
  }

  async pickups(offset: 0 | 1): Promise<SkillResponse> {
    const today = kstDay(this.now);
    const day = new Date(`${today}T00:00:00Z`);
    day.setUTCDate(day.getUTCDate() + offset);
    const target = day.toISOString().slice(0, 10);
    const label = offset === 0 ? "오늘" : "내일";
    const list_ = (await this.openOrders()).filter((o) => o.method === "pickup" && o.due_date === target);
    if (!list_.length) return reply([text(`${label}(${md(target)}) 픽업은 없어요.`)], quick("주문 목록", "메뉴"));
    return reply(
      [list(`${label} 픽업 ${num(list_.length)}건 · ${md(target)}`, list_.slice(0, PAGE).map((o) => this.orderLine(o, today)), [link("앱에서 보기", this.app("/orders"))])],
      quick("주문 목록", offset === 0 ? "내일 픽업" : "오늘 픽업", "메뉴"),
    );
  }
}
