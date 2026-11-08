import { SHOP_NAME } from "../config";
import type { AiReport, ReportFacts } from "../types";
import { askJson, clip, clipList, objectSchema, STRING, STRINGS } from "./openai";

const INSTRUCTIONS = `You are a practical helper for the owner of ${SHOP_NAME}, a small unmanned gift & accessories shop (무인 소품샵) in Korea.
You get FACTS (JSON) computed by the shop app for one period. Write a short report in friendly, plain Korean (존댓말, 해요체).

Ground rules
- Use ONLY numbers and product names that appear in FACTS. Never invent sales, customers, trends or causes. If you guess a reason, say it as a possibility ("~일 수 있어요").
- Sales are not connected yet: "out_qty" is stock the staff took out (출고/판매 기록). Call money figures "출고 기준 예상 매출/이익", never "매출" alone.
- If has_outflow is false, say plainly that no 출고 was recorded so sales-based advice isn't possible yet, and focus on stock, margins and new products.
- Money in won with commas, e.g. 12,000원.

Fields
- headline: one short line (under 30 characters) that sums up the period.
- summary: 2–3 sentences.
- good: 1–3 things that went well (empty list if nothing).
- watch: 1–4 things to keep an eye on (품절, 오래 안 나간 재고, 낮은 마진 …).
- reorder: from FACTS.reorder only, at most 8, keep each suggest_qty as qty; reason under 30 characters.
- todo: 3–5 concrete actions for this week (e.g. 발주, 진열 위치 바꾸기, 가격 점검, 빅솔론 반영, 신상 홍보).
- new_arrivals_post: if FACTS.new_products is not empty, an Instagram post introducing them (3–6 lines, emoji, prices as given, 6–12 hashtags at the end including #소품샵 #무인소품샵). Otherwise "".`;

const SCHEMA = objectSchema({
  headline: STRING,
  summary: STRING,
  good: STRINGS,
  watch: STRINGS,
  reorder: { type: "array", items: objectSchema({ name: STRING, qty: { type: "integer" }, reason: STRING }) },
  todo: STRINGS,
  new_arrivals_post: STRING,
});

export async function writeReport(facts: ReportFacts): Promise<AiReport> {
  const raw = await askJson<Record<string, unknown>>({
    label: "report",
    instructions: INSTRUCTIONS,
    content: [{ type: "input_text", text: `FACTS\n${JSON.stringify(facts)}` }],
    schema: SCHEMA,
    maxOutputTokens: 5000,
  });
  const known = new Map(facts.reorder.map((r) => [r.name, r.suggest_qty]));
  const reorder = (Array.isArray(raw.reorder) ? raw.reorder : [])
    .map((r: { name?: unknown; qty?: unknown; reason?: unknown }) => ({
      name: clip(r.name, 60),
      qty: known.get(clip(r.name, 60)) ?? 0,
      reason: clip(r.reason, 80),
    }))
    // Only items the app itself flagged, with the app's own quantity.
    .filter((r) => known.has(r.name))
    .slice(0, 8);
  return {
    headline: clip(raw.headline, 60),
    summary: clip(raw.summary, 600),
    good: clipList(raw.good, 3, 200),
    watch: clipList(raw.watch, 4, 200),
    reorder,
    todo: clipList(raw.todo, 5, 200),
    new_arrivals_post: facts.new_products.length ? clip(raw.new_arrivals_post, 2000) : "",
  };
}
