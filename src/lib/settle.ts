import type { PosSettleItem } from "./types";

/**
 * A/B 정산: 빅솔론 상품 분류명의 앞이나 뒤에 붙은 영문 한 글자로 묶어요.
 *   앞: "A 포포하우스" · "B TY 베어" · "B피규어" → A / B
 *   뒤: "인형 B" · "실크플라워 A" · "피규어S B" · "인형B" → B / A
 *   둘 다 없으면(“EVENT”, “피규어S”, 분류 없음) → 기타 (빅솔론에서 분류명을 고치면 들어가요)
 */

export const OTHER = "기타";

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
  for (const g of s.groups) lines.push(`${g.key === OTHER ? "기타" : `${g.key}`}: ${won(g.amount)} (${num(g.qty)}개)`);
  lines.push(`합계: ${won(s.amount)} (${num(s.qty)}개)`);
  return lines.join("\n");
}
