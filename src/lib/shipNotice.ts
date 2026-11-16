/**
 * 손님께 보내는 택배 송장 안내문 (사장님 예시 그대로, 개인 정보만 비움 — 2026-11-16).
 * 카톡 챗봇·주문 비서에 “송장안내문”이라고 하면 이 글을 줘요.
 * “송장안내문 김포포 로젠 12345678901”처럼 이름·택배사·송장번호를 같이 주면 채우고,
 * 이름으로 주문을 찾으면 상품명도 채워요. 문구를 바꾸려면 이 파일만 고치면 돼요.
 */
import { actDay } from "./day";
import type { Order } from "./types";

/** 비어 있는 칸 — 보내기 전에 채워야 해요 */
export const BLANK = "○○○";

export interface ShipNoticeFill {
  customer?: string | null;
  item?: string | null;
  /** 우체국 · 로젠 · CJ대한통운 … */
  carrier?: string | null;
  tracking?: string | null;
}

export function shipNoticeText(f: ShipNoticeFill = {}): string {
  return [
    "안녕하세요, 포포하우스입니다!",
    "택배 송장 안내드립니다. ♡",
    "",
    `* 주문자 : ${f.customer || BLANK}님`,
    `* 상품명 : ${f.item || BLANK}`,
    `* ${f.carrier || "○○"} 택배 : ${f.tracking || BLANK}`,
    "",
    "꽃다발을 담으실 수 있도록 투명 쇼핑백도 서비스로 함께 보내드렸습니다. 예쁘게 사용해 주세요!",
    "",
    "[제품 수령 시 유의사항]",
    "",
    "* 은색 고깔은 배송 중 꽃다발을 보호하기 위한 포장재로, 제거 후 안에 있는 꽃다발을 사용하시면 됩니다.",
    "* 꽃다발을 꺼내실 때에는 포장지가 구겨지지 않도록 뒤집지 말고 천천히 꺼내주세요.",
    "* 인형과 꽃은 포장지에 별도로 고정되어 있지 않아 꽃다발을 뒤집을 경우 빠질 수 있으니 주의 부탁드립니다.",
    "",
    "포포하우스를 찾아주셔서 감사합니다.",
    "예쁜 꽃다발과 함께 행복한 하루 보내세요! 🎀",
  ].join("\n");
}

/** 송장 안내문을 달라는 말 (“송장안내문”, “송장 안내 줘”, “택배 안내 문자”) */
const ASK_RE = /송장\s*(?:번호\s*)?안내|송장\s*(?:문자|문구)|(?:택배|배송|발송)\s*안내\s*(?:문자|문구|메시지|문|글)/;

export function isShipNoticeAsk(said: string): boolean {
  return ASK_RE.test(said);
}

const CARRIERS: [RegExp, string][] = [
  [/우체국/, "우체국"],
  [/로젠/, "로젠"],
  [/CJ|씨제이|대한\s*통운/i, "CJ대한통운"],
  [/한진/, "한진"],
  [/롯데/, "롯데"],
  [/경동/, "경동"],
];

/** 숫자 10~14자리(사이에 - 나 띄어쓰기 가능) = 송장번호 */
const TRACK_RE = /(?<!\d)\d[\d\s-]{8,22}\d(?!\d)/g;

export interface ShipNoticeAsk {
  name: string | null;
  /** 이름 뒤에 쓴 상품명 (없으면 주문에서) */
  item: string | null;
  carrier: string | null;
  tracking: string | null;
}

/** “송장안내문 김포포 로젠 123-4567-8901” → 이름·택배사·송장번호 */
export function parseShipNoticeAsk(said: string): ShipNoticeAsk {
  let rest = ` ${said} `;
  let tracking: string | null = null;
  for (const m of said.matchAll(TRACK_RE)) {
    const digits = m[0].replace(/\D/g, "");
    if (digits.length >= 10 && digits.length <= 14) {
      tracking = m[0].trim().replace(/\s+/g, "-");
      rest = rest.replace(m[0], " ");
      break;
    }
  }
  let carrier: string | null = null;
  for (const [re, label] of CARRIERS) {
    if (re.test(rest)) {
      carrier = label;
      break;
    }
  }
  rest = rest
    .replace(/송장\s*(?:번호\s*)?안내\s*(?:문자|문구|메시지|문|글)?|송장\s*(?:문자|문구)|(?:택배|배송|발송)\s*안내\s*(?:문자|문구|메시지|문|글)/g, " ")
    .replace(/우체국|로젠|CJ|씨제이|대한\s*통운|한진|롯데|경동/gi, " ")
    .replace(/택배(?:사)?|송장\s*번호|송장|주문자|고객|손님/g, " ")
    .replace(/양식|틀|예시|템플릿|좀|부탁해요?|(?:보내|써|만들어|알려|뽑아)?\s*(?:줘요|줘|주세요|줄래)|[.,!?~:]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const words = rest ? rest.split(" ") : [];
  const first = words[0]?.replace(/님$/, "") ?? "";
  const name = /^[가-힣A-Za-z]{2,10}$/.test(first) ? first : null;
  const item = name && words.length > 1 ? words.slice(1).join(" ").slice(0, 60) : null;
  return { name, item, carrier, tracking };
}

const key = (s: string) => s.replace(/\s+/g, "").replace(/님$/, "");
const gap = (day: string, today: string) => Math.abs(Date.parse(`${day}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`));

/** 이름에 맞는 주문 — 택배 > 진행 중 > 오늘과 가까운 날 순서 (취소한 주문은 빼요) */
export function pickShipOrder(name: string, orders: Order[], today: string): { order: Order | null; count: number } {
  const live = orders.filter((o) => o.status !== "canceled" && key(o.customer).length >= 2);
  let hits = live.filter((o) => key(o.customer) === name);
  if (!hits.length) hits = live.filter((o) => key(o.customer).includes(name) || name.includes(key(o.customer)));
  const rank = (o: Order) => (o.method === "delivery" ? 0 : 2) + (o.status === "open" ? 0 : 1);
  hits.sort((a, b) => rank(a) - rank(b) || gap(actDay(a), today) - gap(actDay(b), today));
  return { order: hits[0] ?? null, count: hits.length };
}

export interface ShipNotice {
  /** 손님께 그대로 보낼 글 */
  text: string;
  fill: ShipNoticeFill;
  /** 이름으로 찾은 주문 */
  order: Order | null;
  /** 그 이름 주문 수 (2건 이상이면 가장 가까운 걸로 채웠어요) */
  count: number;
  /** 아직 비어 있는 칸 이름 */
  missing: string[];
  /** 이름을 줬는데 주문은 못 찾았어요 */
  notFound: string | null;
}

export function buildShipNotice(said: string, orders: Order[], today: string): ShipNotice {
  const ask = parseShipNoticeAsk(said);
  const { order, count } = ask.name ? pickShipOrder(ask.name, orders, today) : { order: null, count: 0 };
  const fill: ShipNoticeFill = {
    customer: order?.customer ?? ask.name,
    item: ask.item ?? order?.item ?? null,
    carrier: ask.carrier,
    tracking: ask.tracking,
  };
  const missing = [
    !fill.customer && "주문자",
    !fill.item && "상품명",
    !fill.carrier && "택배사",
    !fill.tracking && "송장번호",
  ].filter((x): x is string => Boolean(x));
  return { text: shipNoticeText(fill), fill, order, count, missing, notFound: ask.name && !order ? ask.name : null };
}

/** 안내문 아래 붙이는 짧은 메모 (어느 주문으로 채웠는지 · 빈칸) */
const WEEK = ["일", "월", "화", "수", "목", "금", "토"];
const md = (day: string) => `${Number(day.slice(5, 7))}/${Number(day.slice(8, 10))}(${WEEK[new Date(`${day}T00:00:00Z`).getUTCDay()]})`;

export function shipNoticeNote(n: ShipNotice): string {
  const lines: string[] = [];
  if (n.order) {
    lines.push(
      `📦 ${n.order.customer}님 주문(${md(actDay(n.order))} · ${n.order.item})으로 채웠어요${n.count > 1 ? ` — 같은 이름 주문이 ${n.count}건이라 가장 가까운 걸로 골랐어요` : ""}.`,
    );
  } else if (n.notFound) {
    lines.push(`‘${n.notFound}’님 주문은 못 찾아서 이름만 넣었어요.`);
  }
  if (n.missing.length) {
    lines.push(`${BLANK} 칸(${n.missing.join(" · ")})은 채워서 보내 주세요.`);
    lines.push("예) 송장안내문 김포포 로젠 12345678901");
  }
  return lines.join("\n");
}
