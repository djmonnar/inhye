import { tidyOrder } from "../day";
import type { LogenCheck, LogenInfo, LogenRun, Order } from "../types";
import { adminClient } from "./admin";

/**
 * 로젠택배 Open API — 서버 전용.
 *
 *   1) 주문등록(registerOrderData): 우리 주문을 로젠 ‘주문등록출력(복수건)’ 화면으로 보내요.
 *   2) 송장은 로젠 쪽(iLOGEN·대리점 프로그램)에서 출력해요. 출력해야 송장번호가 생겨요.
 *   3) 송장번호 조회(inquirySlipNoMulti): 출력한 뒤 송장번호를 받아 주문에 적어요.
 *
 * 로젠은 ‘호출한 IP(화이트리스트) + secretKey’로 확인해요. Vercel은 나가는 IP가 고정이 아니라서
 * 궁중수라간 서버(Firebase, 고정 IP 34.50.34.252)에 연 중계 창구를 거쳐 불러요(LOGEN_RELAY_URL).
 * 중계는 정해진 로젠 주소 4개만 대신 불러 주고, 키는 우리 쪽(Vercel 환경변수)에만 있어요.
 * 필드 이름·타입은 궁중수라간 연동(functions/logenClient.js, 로젠 명세표 기준)과 같아요.
 */

const ENDPOINTS = {
  test: "https://topenapi.ilogen.com/lrm02b-edi/edi",
  prod: "https://openapi.ilogen.com/lrm02b-edi/edi",
} as const;

export type LogenPath = "/registerOrderData" | "/inquirySlipNoMulti" | "/inquiryCargoTrackingMulti" | "/contPickFares";

export class LogenError extends Error {
  constructor(
    message: string,
    readonly status = 502,
  ) {
    super(message);
  }
}

const envText = (k: string) => (process.env[k] ?? "").trim();
const digits = (v: string | null | undefined) => String(v ?? "").replace(/\D/g, "");

export function logenConfig() {
  const custCd = envText("LOGEN_CUST_CD");
  return {
    env: (envText("LOGEN_ENV").toLowerCase() === "prod" ? "prod" : "test") as "test" | "prod",
    secretKey: envText("LOGEN_SECRET_KEY"),
    /** 거래처코드 (대리점에서 받는 코드) */
    custCd,
    /** 연동업체코드 — 따로 없으면 거래처코드 (로젠 명세) */
    userId: envText("LOGEN_USER_ID") || custCd,
    senderName: envText("LOGEN_SENDER_NAME") || "포포하우스",
    senderAddress: envText("LOGEN_SENDER_ADDRESS"),
    senderPhone: digits(envText("LOGEN_SENDER_PHONE")),
    senderCell: digits(envText("LOGEN_SENDER_CELL_PHONE")),
    /** 운임 구분: 030 신용(월 정산) */
    fareTy: envText("LOGEN_FARE_TY") || "030",
    boxTyCd: envText("LOGEN_BOX_TY_CD") || null,
    /** 박스 1개 계약 운임 — 이보다 낮게 보내면 로젠이 반려해요 */
    dlvFare: Number(envText("LOGEN_DLV_FARE")) || 0,
    dryRun: envText("LOGEN_DRY_RUN").toLowerCase() === "true",
    relayUrl: envText("LOGEN_RELAY_URL"),
    relayToken: envText("LOGEN_RELAY_TOKEN"),
    /** 고정 IP가 생겨 직접 부를 때만 true */
    direct: envText("LOGEN_DIRECT").toLowerCase() === "true",
  };
}
type Cfg = ReturnType<typeof logenConfig>;

export function logenInfo(cfg: Cfg = logenConfig()): LogenInfo {
  const need: [string, unknown][] = [
    ["LOGEN_SECRET_KEY", cfg.secretKey],
    ["LOGEN_CUST_CD", cfg.custCd],
    ["LOGEN_SENDER_ADDRESS", cfg.senderAddress],
    ["LOGEN_SENDER_PHONE", cfg.senderPhone],
    ["LOGEN_DLV_FARE", cfg.dlvFare],
    ...(cfg.direct ? [] : ([["LOGEN_RELAY_URL", cfg.relayUrl], ["LOGEN_RELAY_TOKEN", cfg.relayToken]] as [string, unknown][])),
  ];
  const missing = cfg.dryRun ? [] : need.filter(([, v]) => !v).map(([k]) => k);
  return { configured: missing.length === 0, missing, env: cfg.env, relay: !cfg.direct && Boolean(cfg.relayUrl), dryRun: cfg.dryRun };
}

interface LogenResponse {
  sttsCd?: string;
  sttsMsg?: string;
  data?: LogenRow[];
}
interface LogenRow {
  fixTakeNo?: string;
  slipNo?: string;
  resultCd?: string;
  resultMsg?: string;
  data1?: Record<string, unknown>[];
}

const why401 =
  "로젠이 거절했어요(401). ① secretKey가 맞는지 ② 궁중수라간 서버 IP(34.50.34.252)가 포포하우스 키에도 등록됐는지 ③ 궁중수라간 로젠 통로(VPC 커넥터)가 켜져 있는지 확인해 주세요.";

/** 로젠 한 번 부르기 — 중계(기본) 또는 직접 */
async function post(path: LogenPath, body: unknown, cfg: Cfg = logenConfig()): Promise<LogenResponse> {
  const info = logenInfo(cfg);
  if (!info.configured) throw new LogenError(`로젠 설정이 아직 없어요: ${info.missing.join(", ")} (Vercel 환경변수)`, 501);
  const ctrl = AbortSignal.timeout(25_000);
  let res: Response;
  try {
    res = cfg.direct
      ? await fetch(`${ENDPOINTS[cfg.env]}${path}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", secretKey: cfg.secretKey },
          body: JSON.stringify(body),
          signal: ctrl,
        })
      : await fetch(cfg.relayUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-logen-relay-token": cfg.relayToken,
            "x-logen-secret-key": cfg.secretKey,
          },
          body: JSON.stringify({ env: cfg.env, path, body }),
          signal: ctrl,
        });
  } catch (e) {
    console.warn("[logen] request failed", path, e instanceof Error ? e.message : e);
    throw new LogenError(cfg.direct ? "로젠 서버에 연결하지 못했어요. 잠시 뒤 다시 해 주세요." : "궁중수라간 서버(로젠 중계)에 연결하지 못했어요. 잠시 뒤 다시 해 주세요.");
  }
  const text = await res.text();
  let j: unknown = null;
  try {
    j = JSON.parse(text);
  } catch {
    /* 아래에서 처리 */
  }

  if (cfg.direct) {
    if (res.status === 401) throw new LogenError(why401);
    if (!res.ok || !j) throw new LogenError(`로젠 응답 오류 (HTTP ${res.status})`);
    return j as LogenResponse;
  }
  // 중계 답: { ok, status(로젠 HTTP), data(로젠 JSON) } 또는 { ok:false, error }
  const r = (j ?? {}) as { ok?: boolean; status?: number; data?: LogenResponse; error?: string };
  if (res.status === 403) throw new LogenError("중계 창구가 거절했어요. Vercel의 LOGEN_RELAY_TOKEN과 궁중수라간 서버의 토큰이 같은지 확인해 주세요.");
  if (res.status === 404) throw new LogenError("궁중수라간 서버에 로젠 중계 창구가 아직 없어요. 중계 코드를 배포해 주세요.");
  if (!res.ok || !r.ok) throw new LogenError(`로젠 중계 오류 (HTTP ${res.status})${r.error ? `: ${String(r.error).slice(0, 200)}` : ""}`);
  if (r.status === 401) throw new LogenError(why401);
  if ((r.status ?? 200) >= 400) throw new LogenError(`로젠 응답 오류 (HTTP ${r.status})`);
  return r.data ?? {};
}

const okRow = (row: LogenRow) => {
  const cd = String(row.resultCd ?? "").toUpperCase();
  return cd === "TRUE" || cd === "SUCCESS";
};
const rowsOf = (r: LogenResponse) => (Array.isArray(r.data) ? r.data : []);
/** 출력한 송장번호 — data1 안에 여러 장이 올 수 있고 delYn=Y는 취소된 송장 */
function slipOf(row: LogenRow): string {
  if (row.slipNo) return String(row.slipNo);
  const live = (Array.isArray(row.data1) ? row.data1 : []).filter((x) => x && x.slipNo && String(x.delYn ?? "").toUpperCase() !== "Y");
  return live.length ? String(live[0].slipNo) : "";
}

const ymd = (day: string) => day.replace(/\D/g, "").slice(0, 8);
/** 로젠에 보내는 우리 주문번호 — 주문마다 늘 같아요(같은 주문을 두 번 보내도 로젠이 겹친 걸 알아요) */
export const takeNoOf = (o: Pick<Order, "id">) => `PP${o.id.replace(/-/g, "").slice(0, 12).toUpperCase()}`;

/** 로젠에 보내기 전에 빠진 것 (있으면 접수 안 해요) */
export function logenProblems(o: Order): string[] {
  const p: string[] = [];
  if (o.status !== "open") p.push("진행 중인 주문이 아니에요");
  if (o.method !== "delivery") p.push("픽업 주문이에요");
  if (!o.customer.trim()) p.push("받는 분 이름이 없어요");
  if (!o.address?.trim()) p.push("주소가 없어요");
  if (digits(o.contact).length < 9) p.push("연락처가 없어요");
  if (o.logen_status === "registered" || o.logen_status === "slip_ready") p.push("이미 로젠에 접수했어요");
  return p;
}

/** 주문 → 로젠 주문등록 한 줄 (필드명·타입은 로젠 명세표: inQty·goodsAmt는 정수) */
export function registerRow(o: Order, today: string, cfg: Cfg = logenConfig()) {
  const day = o.ship_date && o.ship_date > today ? o.ship_date : today;
  const phone = digits(o.contact);
  return {
    custCd: cfg.custCd,
    takeDt: ymd(day),
    slipNo: "", // 빈 값 = 로젠이 송장번호를 매겨요(출력할 때)
    fixTakeNo: takeNoOf(o),
    sndCustNm: cfg.senderName,
    sndZipCd: "",
    sndCustAddr: cfg.senderAddress,
    sndTelNo: cfg.senderPhone,
    sndCellNo: cfg.senderCell || cfg.senderPhone,
    rcvCustNm: o.customer.trim().slice(0, 30),
    rcvZipCd: "",
    rcvCustAddr: (o.address ?? "").trim().slice(0, 200),
    rcvTelNo: phone,
    rcvCellNo: phone,
    fareTy: cfg.fareTy,
    boxTyCd: cfg.boxTyCd,
    qty: 1,
    // 이번 접수 건 전체 운임 (박스 1개 × 계약 운임)
    dlvFare: cfg.dlvFare,
    extraFare: 0,
    goodsNm: (o.item || "포포하우스 상품").slice(0, 50),
    goodsAmt: Math.max(0, Math.round(o.price || 0)),
    inQty: 1,
    goodsOpt: null,
    addOpt: "",
    // 메모는 가게 안 메모(꽃 변경 등)라 기사님께 보내지 않아요
    sndMsg: "",
    mrgInQty: "",
    mrgItemCd: "",
    mrgItemNm: "",
    mrgItemOpt: "",
    mrgGoodsAmt: "",
    mrgAddOpt: "",
    mrgYn: "",
  };
}

// --- 주문 표와 함께 ----------------------------------------------------------

const NEEDS_V8 = "로젠 칸이 없어요. 설정 화면(/setup)에서 ‘앱에서 바로 실행’을 눌러 DB를 업데이트해 주세요.";

async function loadOrders(ids: string[] | null): Promise<Order[]> {
  let q = adminClient().from("orders").select("*");
  q = ids ? q.in("id", ids.slice(0, 50)) : q.eq("status", "open").eq("logen_status", "registered");
  const { data, error } = await q.limit(100);
  if (error) throw new LogenError(error.code === "PGRST204" || error.code === "42703" ? NEEDS_V8 : error.message, 500);
  return ((data ?? []) as Order[]).map(tidyOrder);
}

async function patchOrder(id: string, patch: Record<string, unknown>) {
  const { error } = await adminClient().from("orders").update(patch).eq("id", id);
  if (error) throw new LogenError(error.code === "PGRST204" || error.code === "42703" ? NEEDS_V8 : error.message, 500);
}

const kstToday = () => new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);

/** 고른 택배 주문을 로젠에 접수 (빠진 게 있는 주문은 이유와 함께 건너뛰어요) */
export async function logenRegister(ids: string[]): Promise<LogenRun> {
  const cfg = logenConfig();
  const out: LogenRun = { done: [], waiting: [], failed: [] };
  const orders = await loadOrders(ids);
  const ready: Order[] = [];
  for (const o of orders) {
    const p = logenProblems(o);
    if (p.length) out.failed.push({ id: o.id, customer: o.customer, message: p.join(" · ") });
    else ready.push(o);
  }
  if (!ready.length) return out;

  const today = kstToday();
  let rows: LogenRow[];
  if (cfg.dryRun) {
    rows = ready.map((o) => ({ fixTakeNo: takeNoOf(o), resultCd: "TRUE", resultMsg: "LOGEN_DRY_RUN" }));
  } else {
    const res = await post("/registerOrderData", { userId: cfg.userId, data: ready.map((o) => registerRow(o, today, cfg)) }, cfg);
    rows = rowsOf(res);
    if (!rows.length && res.sttsCd && res.sttsCd.toUpperCase() !== "SUCCESS") {
      throw new LogenError(`로젠이 접수를 거절했어요: ${res.sttsMsg ?? res.sttsCd}`);
    }
  }
  const byNo = new Map(rows.map((r) => [String(r.fixTakeNo ?? ""), r]));
  const now = new Date().toISOString();
  for (const o of ready) {
    const row = byNo.get(takeNoOf(o)) ?? {};
    if (okRow(row)) {
      const slip = slipOf(row);
      await patchOrder(o.id, {
        logen_take_no: takeNoOf(o),
        logen_status: slip ? "slip_ready" : "registered",
        logen_at: now,
        logen_msg: null,
        carrier: "로젠",
        ...(slip ? { tracking_no: slip } : {}),
      });
      if (slip) out.done.push({ id: o.id, customer: o.customer, tracking_no: slip });
      else out.waiting.push({ id: o.id, customer: o.customer });
    } else {
      const msg = String(row.resultMsg ?? "로젠 답이 없어요").slice(0, 200);
      await patchOrder(o.id, { logen_take_no: takeNoOf(o), logen_status: "failed", logen_at: now, logen_msg: msg });
      out.failed.push({ id: o.id, customer: o.customer, message: msg });
    }
  }
  return out;
}

/** 접수한 주문의 송장번호 받아 오기 (ids 없으면 ‘접수됨’ 전부) — 송장을 출력해야 번호가 나와요 */
export async function logenSlips(ids: string[] | null): Promise<LogenRun> {
  const cfg = logenConfig();
  const out: LogenRun = { done: [], waiting: [], failed: [] };
  const orders = (await loadOrders(ids)).filter((o) => o.logen_take_no && o.logen_status === "registered");
  if (!orders.length) return out;
  let rows: LogenRow[];
  if (cfg.dryRun) {
    rows = orders.map((o) => ({ fixTakeNo: o.logen_take_no!, resultCd: "TRUE", slipNo: `9${digits(o.id).padEnd(10, "0").slice(0, 10)}` }));
  } else {
    const res = await post("/inquirySlipNoMulti", { userId: cfg.userId, data: orders.map((o) => ({ custCd: cfg.custCd, fixTakeNo: o.logen_take_no })) }, cfg);
    rows = rowsOf(res);
  }
  const byNo = new Map(rows.map((r) => [String(r.fixTakeNo ?? ""), r]));
  for (const o of orders) {
    const row = byNo.get(o.logen_take_no!) ?? {};
    const slip = okRow(row) ? slipOf(row) : "";
    if (slip) {
      await patchOrder(o.id, { tracking_no: slip, carrier: "로젠", logen_status: "slip_ready", logen_msg: null });
      out.done.push({ id: o.id, customer: o.customer, tracking_no: slip });
    } else if (okRow(row) || !row.resultCd) {
      out.waiting.push({ id: o.id, customer: o.customer });
    } else {
      const msg = String(row.resultMsg ?? "").slice(0, 200);
      await patchOrder(o.id, { logen_msg: msg || null });
      out.failed.push({ id: o.id, customer: o.customer, message: msg || "송장번호를 받지 못했어요" });
    }
  }
  return out;
}

/** 연결 확인 — 계약 운임 조회 (아무것도 바꾸지 않아요) */
export async function logenCheck(): Promise<LogenCheck> {
  const cfg = logenConfig();
  if (cfg.dryRun) return { ok: true, env: cfg.env, message: "시험 모드(LOGEN_DRY_RUN)라 로젠에 보내지 않았어요.", fares: [] };
  const res = await post("/contPickFares", { userId: cfg.userId, data: [{ custCd: cfg.custCd, fareTy: cfg.fareTy }] }, cfg);
  const rows = rowsOf(res);
  const fares = rows
    .flatMap((r) => (Array.isArray(r.data1) ? r.data1 : []))
    .slice(0, 10)
    .map((f) => ({ box: String(f.boxTyNm ?? f.boxTyCd ?? ""), fare: Number(f.dlvFare ?? 0) }));
  const ok = String(res.sttsCd ?? "").toUpperCase() === "SUCCESS" || fares.length > 0;
  return { ok, env: cfg.env, message: ok ? "로젠에 연결됐어요." : `로젠 답: ${res.sttsMsg ?? rows[0]?.resultMsg ?? "알 수 없음"}`, fares };
}
