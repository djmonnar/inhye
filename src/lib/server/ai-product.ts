import type { AiProductDraft } from "../types";
import type { PageInfo } from "./fetch-page";
import { askJson, clip, clipList, objectSchema, STRING, STRINGS } from "./openai";

const DRAFT_FIELDS = {
  name: STRING,
  category: STRING,
  tags: STRINGS,
  description: STRING,
  name_en: STRING,
  name_zh: STRING,
  name_ja: STRING,
  description_en: STRING,
  description_zh: STRING,
  description_ja: STRING,
  note: STRING,
};

const FIELD_RULES = `- name: Korean, the way a shelf label would say it, short (about 4–20 characters). Lead with the character or theme if any, then the item type. e.g. "곰돌이 털 키링", "체크 패턴 집게핀", "레트로 꽃 손거울". Include a brand or character name only when it is clearly printed or unmistakable. No marketing words (예쁜, 인기, 신상) and no price.
- category: one short Korean category (1–2 words). Use one of the shop's existing categories when it fits; otherwise make a natural new one such as 키링, 문구, 헤어, 파우치, 인형, 생활소품.
- tags: 2–5 short Korean words staff or customers would search for (color, character, material, season, use). No "#".
- description: one friendly Korean sentence for the kiosk, under 50 characters. Describe only what you can confirm; never invent materials or features.
- name_en / name_ja / name_zh: natural product names for foreign tourists. Chinese is Simplified (zh-CN). Keep character or brand names in their official spelling.
- description_en / description_ja / description_zh: natural translations of the Korean description.
- note: one short Korean sentence about anything the owner should double-check. Empty string if nothing.`;

const PHOTO_INSTRUCTIONS = `You help the owner of 포포하우스, a small unmanned gift & accessories shop (소품샵) in Korea, register products from one photo.
Look at the product (packaging text, shape, material, color, character) and fill the fields.

Rules
${FIELD_RULES}
- Never guess price, cost, barcode or stock.
- If the photo doesn't show a sellable product or is too blurry, leave every field empty except note, and say in note what to retake.`;

const LINK_INSTRUCTIONS = `You help the owner of 포포하우스, a small unmanned gift & accessories shop (소품샵) in Korea, register a product they buy from a wholesale or online supplier page.
You get the page's title, meta tags, JSON-LD and visible text. Fill the fields for how the shop will sell it.

Rules
${FIELD_RULES}
- cost_price: the unit price the shop pays as shown on the page, as an integer in Korean won. If the page shows several prices (quantity tiers, options), use the price for the smallest order and say so in note. If the price is not in KRW (e.g. 1688 in CNY, AliExpress in USD) or is hidden behind a login, use 0 and put the shown price and currency in note.
- supplier_sku: the seller's own product name with option or product number as shown on the page (e.g. "[A-123] 곰돌이 키링 브라운"), max 60 characters. Empty if not shown.
- Only use what the page says. If the page is a login wall, an error, a bot check or not a single product, leave every field empty (cost_price 0) except note, and say in note that the page couldn't be read.`;

function cleanDraft(raw: Record<string, unknown>): AiProductDraft {
  return {
    name: clip(raw.name, 40),
    category: clip(raw.category, 20),
    tags: clipList(raw.tags, 6, 15, (t) => t.replace(/^#+/, "").trim()),
    description: clip(raw.description, 200),
    name_en: clip(raw.name_en, 80),
    name_zh: clip(raw.name_zh, 80),
    name_ja: clip(raw.name_ja, 80),
    description_en: clip(raw.description_en, 300),
    description_zh: clip(raw.description_zh, 300),
    description_ja: clip(raw.description_ja, 300),
    note: clip(raw.note, 200),
  };
}

const categoryLine = (categories: string[]) =>
  `가게에 이미 있는 카테고리: ${categories.length ? categories.join(", ") : "(아직 없음)"}`;

/** `image` is a data URL (data:image/jpeg;base64,...). */
export async function describeProductPhoto(image: string, categories: string[], hint: string): Promise<AiProductDraft> {
  const context = [categoryLine(categories), hint ? `직원이 적어 둔 상품명 힌트: ${hint}` : ""].filter(Boolean).join("\n");
  const raw = await askJson<Record<string, unknown>>({
    label: "product",
    instructions: PHOTO_INSTRUCTIONS,
    content: [
      { type: "input_text", text: context },
      { type: "input_image", image_url: image, detail: "auto" },
    ],
    schema: objectSchema(DRAFT_FIELDS),
  });
  return cleanDraft(raw);
}

export async function describeProductPage(page: PageInfo, categories: string[]): Promise<AiProductDraft> {
  const metaLines = Object.entries(page.meta).map(([k, v]) => `${k}: ${v}`);
  const context = [
    categoryLine(categories),
    `사이트: ${page.site}`,
    `주소: ${page.url}`,
    `제목: ${page.title}`,
    metaLines.length ? `메타 태그:\n${metaLines.join("\n")}` : "",
    page.jsonld ? `JSON-LD:\n${page.jsonld}` : "",
    `본문:\n${page.text}`,
  ]
    .filter(Boolean)
    .join("\n\n");
  const raw = await askJson<Record<string, unknown>>({
    label: "link",
    instructions: LINK_INSTRUCTIONS,
    content: [{ type: "input_text", text: context }],
    schema: objectSchema({ ...DRAFT_FIELDS, cost_price: { type: "integer" }, supplier_sku: STRING }),
  });
  const cost = typeof raw.cost_price === "number" && Number.isFinite(raw.cost_price) ? Math.round(raw.cost_price) : 0;
  return {
    ...cleanDraft(raw),
    cost_price: cost > 0 && cost < 100_000_000 ? cost : 0,
    supplier_sku: clip(raw.supplier_sku, 60),
  };
}
