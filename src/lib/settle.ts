import type { PosSettleItem } from "./types";

/**
 * A/B 정산: 빅솔론 상품 분류명 앞글자로 묶어요.
 *   "A 포포하우스" · "A 실크플라워" → A,  "B 인형" · "B TY 베어" · "B피규어" → B
 *   앞글자가 영문 한 글자가 아니면(“EVENT”, 분류 없음) → 기타 (빅솔론에서 분류명을 고치면 들어가요)
 */

export const OTHER = "기타";

export function groupOf(category: string): string {
  const m = /^\s*([A-Za-z])(?![A-Za-z])/.exec(category ?? "");
  return m ? m[1].toUpperCase() : OTHER;
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
