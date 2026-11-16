/**
 * 입금 확인 (스키마 v9) — 카톡 챗봇 · 주문 비서 공용.
 *
 *   처리: "김포포 입금 완료" · "김포포 입금했어" · "김포포 입금 확인" · "김포포 돈 들어왔어" → 입금 완료
 *         "김포포 입금 취소" · "김포포 입금 전으로" → 입금 전
 *   묻기: "김포포 입금했어?" · "김포포 입금 여부" → 그 손님 주문의 입금 상태
 *         "입금 안 한 사람" · "미입금" · "입금 전 주문" · "누가 입금 안 했어?" → 입금 전 목록
 *
 * 물음표나 ‘했나·여부’ 같은 말이 있으면 묻는 말, 없으면 처리하는 말로 봐요.
 */
import { actDay, unpaid } from "./day";
import type { Order } from "./types";

const NAME = "([가-힣A-Za-z]{2,10}?)(?:님)?";
const NOT_NAME = /입금|미입금|주문|누가|아직|돈|이체|송장|택배/;
const ASK_WORDS = /\?|했나|했는지|됐나|됐는지|여부|확인\s*(?:해\s*줘|해\s*주세요|됐어|됐나|해\s*봐)|어떻게\s*됐|했어요\?|들어왔나|받았나/;
const HOWTO = /어떻게\s*(?:해|하|넣|체크|표시|확인하)|방법|하는\s*법/;
const MONEY = "(?:선?입금|돈|계좌\\s*이체|이체)";

/** 입금 전 목록을 묻는 말 */
const LIST_RE =
  /미입금|입금\s*(?:전|대기)\s*(?:인\s*)?(?:사람|주문|목록|리스트|손님|건|거|분|있어|뭐)|입금\s*(?:안|못)\s*(?:한|된|들어온|받은)|누가\s*(?:아직\s*)?(?:입금|돈)|^(?:전체\s*)?입금\s*(?:목록|현황|상태|여부)\s*\??$|^입금\s*(?:확인\s*)?(?:안\s*된\s*거|전)\s*\??$/;

export type PaidAsk = { kind: "list" } | { kind: "one"; name: string };

/** 입금 상태를 묻는 말인지 (처리하는 말은 null) */
export function parsePaidAsk(raw: string): PaidAsk | null {
  const s = raw.trim().replace(/\s+/g, " ");
  if (!/입금|이체|돈\s*(?:들어|받)/.test(s) || HOWTO.test(s)) return null;
  if (LIST_RE.test(s)) return { kind: "list" };
  if (!ASK_WORDS.test(s)) return null;
  const m = new RegExp(`^${NAME}\\s*(?:은|는|이|가)?\\s*(?:주문\\s*)?${MONEY}`).exec(s);
  if (m && !NOT_NAME.test(m[1])) return { kind: "one", name: m[1] };
  return null;
}

const PAID_RE = new RegExp(
  `^${NAME}\\s+(?:주문\\s*)?${MONEY}\\s*(?:완료(?:했어요?|됨|요|했음)?|했어요?|했음|함|됐어요?|됨|확인(?:했어요?|함|됨|완료)?|들어왔어요?|들어옴|받았어요?|받음|체크)\\s*(?:해\\s*줘|해주세요|로\\s*해\\s*줘)?$`,
);
const UNPAID_RE = new RegExp(`^${NAME}\\s+(?:주문\\s*)?입금\\s*(?:취소|전으로|안\\s*됐어요?|아직이야|아직)\\s*(?:해\\s*줘|해주세요|바꿔\\s*줘|로\\s*바꿔\\s*줘)?$`);

/** “김포포 입금 완료” → 입금 처리 (묻는 말이면 null) */
export function parsePaidAction(raw: string): { kind: "paid" | "unpaid"; name: string } | null {
  const s = raw.trim().replace(/[.!~]+$/, "").replace(/\s+/g, " ");
  if (ASK_WORDS.test(s) || HOWTO.test(s)) return null;
  let m = PAID_RE.exec(s);
  if (m && !NOT_NAME.test(m[1])) return { kind: "paid", name: m[1] };
  m = UNPAID_RE.exec(s);
  if (m && !NOT_NAME.test(m[1])) return { kind: "unpaid", name: m[1] };
  return null;
}

/** 주문 줄 메모에 “선입금 완료”처럼 입금했다는 말이 있으면 */
export const memoSaysPaid = (memo: string | null | undefined) => Boolean(memo && /입금\s*(?:완료|됨|확인|했)/.test(memo));

const key = (s: string) => s.replace(/\s+/g, "").replace(/님$/, "");
const gap = (day: string, today: string) => Math.abs(Date.parse(`${day}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`));

/** 이름으로 입금 처리할 주문 — 진행 중인 게 하나면 그것, 없으면 취소 안 된 게 하나일 때 (여럿이면 null → AI가 물어요) */
export function pickPaidTarget(name: string, orders: Order[]): Order | null {
  const same = orders.filter((o) => o.status !== "canceled" && key(o.customer) === key(name));
  const open = same.filter((o) => o.status === "open");
  if (open.length === 1) return open[0];
  if (!open.length && same.length === 1) return same[0];
  return null;
}

const WEEK = ["일", "월", "화", "수", "목", "금", "토"];
const md = (day: string) => `${Number(day.slice(5, 7))}/${Number(day.slice(8, 10))}(${WEEK[new Date(`${day}T00:00:00Z`).getUTCDay()]})`;
const wonText = (n: number) => `${n.toLocaleString("ko-KR")}원`;
const paidAtText = (iso: string) => {
  const k = new Date(new Date(iso).getTime() + 9 * 3600_000).toISOString();
  return `${Number(k.slice(5, 7))}/${Number(k.slice(8, 10))} ${k.slice(11, 16)}`;
};

/** 주문 한 줄 + 입금 상태 */
export function paidLine(o: Order): string {
  const state = o.paid === true ? `💰 입금 완료${o.paid_at ? ` (${paidAtText(o.paid_at)})` : ""}` : o.paid === false || o.status === "open" ? "⏳ 입금 전" : "입금 기록 없음";
  return `${md(actDay(o))} ${o.method === "delivery" ? "📦" : "🛍"} ${o.customer || "-"} · ${o.item || "-"} · ${wonText(o.price)} — ${state}`;
}

export interface PaidAnswer {
  text: string;
  /** 입금 전인 손님 이름 (바로 처리 버튼용) */
  unpaidNames: string[];
}

/** 입금 물음에 답 (DB 없이 — 주문 목록만 받아요) */
export function paidAnswer(ask: PaidAsk, orders: Order[], today: string): PaidAnswer {
  if (ask.kind === "list") {
    const list = orders
      .filter(unpaid)
      .sort((a, b) => actDay(a).localeCompare(actDay(b)));
    if (!list.length) return { text: "💰 진행 중인 주문은 모두 입금 확인했어요!", unpaidNames: [] };
    const sum = list.reduce((n, o) => n + (o.price || 0), 0);
    const lines = list.slice(0, 15).map((o) => `• ${md(actDay(o))} ${o.customer || "-"} · ${o.item || "-"} · ${wonText(o.price)}`);
    return {
      text: [`⏳ 입금 전 주문 ${list.length}건 · ${wonText(sum)}`, ...lines, ...(list.length > 15 ? [`외 ${list.length - 15}건`] : []), "", "입금되면 ‘김포포 입금 완료’처럼 보내 주세요."].join("\n"),
      unpaidNames: [...new Set(list.map((o) => o.customer).filter(Boolean))],
    };
  }
  const hits = orders
    .filter((o) => o.status !== "canceled" && (key(o.customer) === key(ask.name) || key(o.customer).includes(key(ask.name))))
    .sort((a, b) => (a.status === "open" ? 0 : 1) - (b.status === "open" ? 0 : 1) || gap(actDay(a), today) - gap(actDay(b), today))
    .slice(0, 5);
  if (!hits.length) return { text: `‘${ask.name}’님 주문을 못 찾았어요. 이름을 확인해 주세요.`, unpaidNames: [] };
  const names = hits.filter((o) => o.status === "open" && o.paid !== true).map((o) => o.customer);
  const head =
    hits.length === 1
      ? hits[0].paid === true
        ? `💰 ${hits[0].customer}님 입금 확인됐어요.`
        : hits[0].status === "open" || hits[0].paid === false
          ? `⏳ ${hits[0].customer}님은 아직 입금 전이에요.`
          : `${hits[0].customer}님 주문은 입금 기록이 없어요 (입금 체크 전에 끝난 주문).`
      : `${ask.name}님 주문 ${hits.length}건이에요.`;
  return { text: [head, ...hits.map((o) => `• ${paidLine(o)}`)].join("\n"), unpaidNames: [...new Set(names)] };
}
