import type { PosSettleItem } from "./types";

/**
 * A/B 정산: 빅솔론 상품 분류명의 앞이나 뒤에 붙은 영문 한 글자로 묶어요.
 *   앞: "A 포포하우스" · "B TY 베어" · "B피규어" → A / B
 *   뒤: "인형 B" · "실크플라워 A" · "피규어S B" · "인형B" → B / A
 *   둘 다 없으면(“EVENT”, “피규어S”, 분류 없음) → 기타 (빅솔론에서 분류명을 고치면 들어가요)
 */

export const OTHER = "기타";

/** 묶음 주인 — A는 인혜 매출, B는 경령 매출 (사장님이 정한 것, 2026-11-14) */
export const GROUP_OWNER: Record<string, string> = { A: "인혜", B: "경령" };

/** "A · 인혜" / "B · 경령" / "기타" / "C 묶음" */
export function groupLabel(key: string): string {
  if (key === OTHER) return "기타";
  return GROUP_OWNER[key] ? `${key} · ${GROUP_OWNER[key]}` : `${key} 묶음`;
}

export function groupOf(category: string): string {
  const c = category ?? "";
  // 앞: 영문 한 글자 + (띄어쓰기·한글·끝) — "BTS 굿즈"처럼 단어면 아니에요
  const head = /^\s*([A-Za-z])(?![A-Za-z])/.exec(c);
  if (head) return head[1].toUpperCase();
  // 뒤: 띄어 쓴 영문 한 글자("인형 B"), 또는 한글 바로 뒤의 A·B("인형B") — "피규어S"의 S는 아니에요
  const tail = /[\s_\-./(\[]([A-Za-z])[\s)\]]*$/.exec(c) ?? /[가-힣]([AaBb])\s*$/.exec(c);
  return tail ? tail[1].toUpperCase() : OTHER;
}

export interface SettleCategory {
  name: string;
  qty: number;
  amount: number;
  items: PosSettleItem[];
}

export interface SettleGroup {
  key: string;
  qty: number;
  amount: number;
  categories: SettleCategory[];
}

export interface Settlement {
  groups: SettleGroup[];
  qty: number;
  amount: number;
}

const byAmount = <T extends { amount: number; name?: string }>(a: T, b: T) =>
  b.amount - a.amount || (a.name ?? "").localeCompare(b.name ?? "", "ko");

export function settle(items: PosSettleItem[]): Settlement {
  const groups = new Map<string, Map<string, PosSettleItem[]>>();
  for (const it of items) {
    if (!it.qty && !it.amount) continue;
    const g = groupOf(it.category);
    const cat = it.category || "분류 없음";
    const cats = groups.get(g) ?? new Map<string, PosSettleItem[]>();
    cats.set(cat, [...(cats.get(cat) ?? []), it]);
    groups.set(g, cats);
  }
  const sum = (list: { qty: number; amount: number }[]) =>
    list.reduce((acc, x) => ({ qty: acc.qty + x.qty, amount: acc.amount + x.amount }), { qty: 0, amount: 0 });

  const out: SettleGroup[] = [...groups.entries()].map(([key, cats]) => {
    const categories = [...cats.entries()]
      .map(([name, list]) => ({ name, ...sum(list), items: [...list].sort(byAmount) }))
      .sort(byAmount);
    return { key, ...sum(categories), categories };
  });
  // A, B, C… 순서, 기타는 맨 뒤
  out.sort((a, b) => (a.key === OTHER ? 1 : 0) - (b.key === OTHER ? 1 : 0) || a.key.localeCompare(b.key));
  return { groups: out, ...sum(out) };
}

/** 카톡에 붙여 넣을 정산 요약 */
export function settleText(s: Settlement, start: string, end: string, won: (n: number) => string, num: (n: number) => string) {
  const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;
  const lines = [`🌸 포포하우스 정산 ${md(start)}~${md(end)}`];
  for (const g of s.groups) lines.push(`${groupLabel(g.key)}: ${won(g.amount)} (${num(g.qty)}개)`);
  lines.push(`합계: ${won(s.amount)} (${num(s.qty)}개)`);
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// 말로 묻는 정산 (카톡 챗봇): "이번달 a 분류 정산금액 얼마야?", "인혜 매출", "경령 지난달 정산"
// ---------------------------------------------------------------------------

const pad = (n: number) => String(n).padStart(2, "0");
const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const lastDayOf = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

export interface SettlePeriod {
  start: string;
  end: string;
  /** "11월", "지난달(10월)", "오늘", "이번 주" … */
  label: string;
  /** 다시 물을 때 붙일 말 ("지난달", "11월", "") */
  word: string;
}

/** 말에서 기간 찾기 (없으면 이번 달). today = 한국 날짜 YYYY-MM-DD */
export function settlePeriod(said: string, today: string): SettlePeriod {
  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7));
  const month = (yy: number, mm: number, word: string, label: string): SettlePeriod => {
    const start = `${yy}-${pad(mm)}-01`;
    const endOfMonth = `${yy}-${pad(mm)}-${pad(lastDayOf(yy, mm))}`;
    return { start, end: endOfMonth < today ? endOfMonth : today, label, word };
  };
  if (/지난\s*달|저번\s*달|전\s*달|지난\s*월/.test(said)) {
    const [yy, mm] = m === 1 ? [y - 1, 12] : [y, m - 1];
    return month(yy, mm, "지난달", `지난달(${mm}월)`);
  }
  if (/어제/.test(said)) {
    const d = addDays(today, -1);
    return { start: d, end: d, label: "어제", word: "어제" };
  }
  if (/오늘/.test(said)) return { start: today, end: today, label: "오늘", word: "오늘" };
  const dow = (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7; // 월요일 = 0
  if (/지난\s*주|저번\s*주/.test(said)) {
    const start = addDays(today, -dow - 7);
    return { start, end: addDays(start, 6), label: "지난주", word: "지난주" };
  }
  if (/이번\s*주/.test(said)) return { start: addDays(today, -dow), end: today, label: "이번 주", word: "이번 주" };
  const mm = said.match(/(\d{1,2})\s*월/);
  if (mm && Number(mm[1]) >= 1 && Number(mm[1]) <= 12) {
    const n = Number(mm[1]);
    const yy = n > m ? y - 1 : y; // 아직 안 온 달이면 작년
    return month(yy, n, `${n}월`, `${n}월`);
  }
  return month(y, m, "", `${m}월`);
}

/** 누구 정산인지: A(인혜) / B(경령) / 둘 다(null) */
export function settleWho(said: string): string | null {
  const owners = Object.entries(GROUP_OWNER);
  const hit = new Set<string>();
  for (const [key, name] of owners) if (said.includes(name)) hit.add(key);
  for (const m of said.matchAll(/(?<![A-Za-z])([ABab])(?![A-Za-z])/g)) hit.add(m[1].toUpperCase());
  return hit.size === 1 ? [...hit][0] : null;
}

/** 정산을 묻는 말인지 (주문 줄·숫자 날짜는 아니에요) */
export function isSettleAsk(said: string): boolean {
  if (/\d{1,2}\s*[/.]\s*\d{1,2}|픽업|택배|꽃다발|출고/.test(said)) return false;
  if (/정산/.test(said)) return true;
  const names = Object.values(GROUP_OWNER).join("|");
  if (new RegExp(`(?:${names})`).test(said) && /매출|판매|얼마|금액|팔|벌/.test(said)) return true;
  return /(?<![A-Za-z])[ABab](?![A-Za-z])\s*(?:분류|묶음|쪽)?\s*(?:매출|판매|금액|얼마)|(?:분류|묶음)\s*[ABab](?![A-Za-z])/.test(said);
}

// ---------------------------------------------------------------------------
// 말로 묻는 매출 날짜: "어제 매출 얼마야", "11/13 매출", "그저께 몇 개 팔렸어", "금요일 매출"
// 기간(이번 주·지난달·11월)이면 정산(A/B 합계)으로 답해요.
// ---------------------------------------------------------------------------

export type SalesWhen = { kind: "day"; day: string; label: string } | { kind: "period" } | { kind: "future"; day: string };

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

/** 매출을 물은 날 (없으면 오늘). today = 한국 날짜 YYYY-MM-DD */
export function salesWhen(said: string, today: string): SalesWhen {
  if (/이번\s*주|지난\s*주|저번\s*주|이번\s*달|이달|지난\s*달|저번\s*달|전\s*달|(?<![\d/.]\s*)\d{1,2}\s*월(?!\s*\d)/.test(said)) return { kind: "period" };
  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7));
  const d = Number(today.slice(8, 10));
  const label = (day: string) => {
    const diff = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${day}T00:00:00Z`)) / 86400000);
    if (diff === 0) return "오늘";
    if (diff === 1) return "어제";
    if (diff === 2) return "그저께";
    return `${Number(day.slice(5, 7))}월 ${Number(day.slice(8, 10))}일(${WEEKDAYS[new Date(`${day}T00:00:00Z`).getUTCDay()]})`;
  };
  const real = (yy: number, mm: number, dd: number) => {
    const iso = `${yy}-${pad(mm)}-${pad(dd)}`;
    const t = new Date(`${iso}T00:00:00Z`);
    return t.getUTCMonth() + 1 === mm && t.getUTCDate() === dd ? iso : null;
  };
  const pick = (day: string | null): SalesWhen | null => (day ? (day > today ? { kind: "future", day } : { kind: "day", day, label: label(day) }) : null);

  if (/모레/.test(said) && !/그저께|그제/.test(said)) return { kind: "future", day: addDays(today, 2) };
  if (/내일/.test(said)) return { kind: "future", day: addDays(today, 1) };
  if (/그저께|그제|엊그제/.test(said)) return pick(addDays(today, -2))!;
  if (/어제/.test(said)) return pick(addDays(today, -1))!;
  if (/오늘/.test(said)) return pick(today)!;
  const md = said.match(/(\d{1,2})\s*[/.월]\s*(\d{1,2})\s*일?/);
  if (md) {
    const mm = Number(md[1]);
    const dd = Number(md[2]);
    const day = real(y, mm, dd);
    // 아직 안 온 날이면 작년 같은 날로 (12/31을 1월에 물을 때)
    const fixed = day && day > today ? real(y - 1, mm, dd) : day;
    const out = pick(fixed);
    if (out) return out;
  }
  const dOnly = said.match(/(?<![\d/.월]\s*)(\d{1,2})\s*일/);
  if (dOnly) {
    const dd = Number(dOnly[1]);
    const [yy, mm] = dd > d ? (m === 1 ? [y - 1, 12] : [y, m - 1]) : [y, m];
    const out = pick(real(yy, mm, dd));
    if (out) return out;
  }
  const wd = said.match(/(지난\s*)?([월화수목금토일])요일/);
  if (wd) {
    const want = WEEKDAYS.indexOf(wd[2]);
    const now = new Date(`${today}T00:00:00Z`).getUTCDay();
    let back = (now - want + 7) % 7;
    if (wd[1] && back === 0) back = 7;
    return pick(addDays(today, -back))!;
  }
  return pick(today)!;
}

/** 매출을 묻는 말인지 (“판매가”처럼 가격을 묻는 말은 아니에요) */
export function isSalesAsk(said: string): boolean {
  return /매출|팔린|팔렸|판매(?!\s*가)|얼마\s*(?:팔|벌)|몇\s*개\s*팔/.test(said);
}
