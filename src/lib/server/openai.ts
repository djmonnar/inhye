import type { AiProductDraft } from "../types";

/**
 * OpenAI is called only from the server so the API key never reaches the phone.
 * OPENAI_MODEL can override the default (e.g. gpt-6-luna is cheaper, gpt-6.1-sol smarter).
 */
const API_KEY = process.env.OPENAI_API_KEY ?? "";
const MODEL = process.env.OPENAI_MODEL || "gpt-6.1-terra";

export const hasOpenAI = () => Boolean(API_KEY);

export class AiError extends Error {
  status: number;
  constructor(message: string, status = 502) {
    super(message);
    this.status = status;
  }
}

const FIELDS = [
  "name",
  "category",
  "tags",
  "description",
  "name_en",
  "name_zh",
  "name_ja",
  "description_en",
  "description_zh",
  "description_ja",
  "note",
] as const;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: FIELDS,
  properties: Object.fromEntries(
    FIELDS.map((k) => [k, k === "tags" ? { type: "array", items: { type: "string" } } : { type: "string" }]),
  ),
};

const INSTRUCTIONS = `You help the owner of 포포하우스, a small unmanned gift & accessories shop (소품샵) in Korea, register products from one photo.
Look at the product (packaging text, shape, material, color, character) and fill the fields.

Rules
- name: Korean, the way a shelf label would say it, short (about 4–20 characters). Lead with the character or theme if any, then the item type. e.g. "곰돌이 털 키링", "체크 패턴 집게핀", "레트로 꽃 손거울". Include a brand or character name only when it is clearly printed or unmistakable. No marketing words (예쁜, 인기, 신상) and no price.
- category: one short Korean category (1–2 words). Use one of the shop's existing categories when it fits; otherwise make a natural new one such as 키링, 문구, 헤어, 파우치, 인형, 생활소품.
- tags: 2–5 short Korean words staff or customers would search for (color, character, material, season, use). No "#".
- description: one friendly Korean sentence for the kiosk, under 50 characters. Describe only what you can see; never invent materials or features you can't confirm.
- name_en / name_ja / name_zh: natural product names for foreign tourists. Chinese is Simplified (zh-CN). Keep character or brand names in their official spelling.
- description_en / description_ja / description_zh: natural translations of the Korean description.
- note: one short Korean sentence about anything the owner should double-check (e.g. "색상 옵션이 더 있을 수 있어요", "글자가 흐려 브랜드를 확인하지 못했어요"). Empty string if nothing.
- Never guess price, cost, barcode or stock.
- If the photo doesn't show a sellable product or is too blurry, leave every field empty except note, and say in note what to retake.`;

type OpenAIError = { error?: { message?: string; code?: string | null; type?: string } };
type OpenAIResponse = {
  status?: string;
  incomplete_details?: { reason?: string } | null;
  output?: { type: string; content?: { type: string; text?: string; refusal?: string }[] }[];
};

function friendlyError(status: number, body: OpenAIError): AiError {
  const code = body.error?.code ?? body.error?.type ?? "";
  if (status === 401) return new AiError("OpenAI API 키가 맞지 않아요. Vercel의 OPENAI_API_KEY를 확인해 주세요.");
  if (code === "insufficient_quota")
    return new AiError("OpenAI 크레딧이 없어요. platform.openai.com → Billing에서 잔액을 확인해 주세요.");
  if (status === 429) return new AiError("AI 요청이 몰렸어요. 잠시 후 다시 해 주세요.", 429);
  if (code === "model_not_found" || status === 404)
    return new AiError(`AI 모델 ‘${MODEL}’을 쓸 수 없어요. OPENAI_MODEL 환경변수를 확인해 주세요.`);
  return new AiError(`AI가 사진을 읽지 못했어요. (${body.error?.message ?? status})`);
}

const clip = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

function clean(raw: Partial<Record<(typeof FIELDS)[number], unknown>>): AiProductDraft {
  const tags = Array.isArray(raw.tags) ? raw.tags : [];
  return {
    name: clip(raw.name, 40),
    category: clip(raw.category, 20),
    tags: [...new Set(tags.map((t) => clip(t, 15).replace(/^#+/, "")).filter(Boolean))].slice(0, 6),
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

/** `image` is a data URL (data:image/jpeg;base64,...). */
export async function describeProductPhoto(image: string, categories: string[], hint: string): Promise<AiProductDraft> {
  const context = [
    `가게에 이미 있는 카테고리: ${categories.length ? categories.join(", ") : "(아직 없음)"}`,
    hint ? `직원이 적어 둔 상품명 힌트: ${hint}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  let res: Response;
  try {
    res = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        model: MODEL,
        instructions: INSTRUCTIONS,
        input: [
          {
            role: "user",
            content: [
              { type: "input_text", text: context },
              { type: "input_image", image_url: image, detail: "auto" },
            ],
          },
        ],
        text: { format: { type: "json_schema", name: "product_draft", strict: true, schema: SCHEMA } },
        reasoning: { effort: "low" },
        max_output_tokens: 4000,
        store: false,
      }),
      signal: AbortSignal.timeout(50_000),
    });
  } catch (e) {
    if (e instanceof Error && e.name === "TimeoutError")
      throw new AiError("AI 응답이 너무 오래 걸려요. 다시 해 주세요.", 504);
    throw new AiError("AI 서버에 연결하지 못했어요. 잠시 후 다시 해 주세요.");
  }

  const body = (await res.json().catch(() => ({}))) as OpenAIResponse & OpenAIError;
  if (!res.ok) {
    console.error("[ai/product] OpenAI error", res.status, body.error?.code, body.error?.message);
    throw friendlyError(res.status, body);
  }
  if (body.status === "incomplete") {
    console.error("[ai/product] incomplete", body.incomplete_details?.reason);
    throw new AiError("AI 답이 중간에 끊겼어요. 다시 해 주세요.");
  }

  const parts = (body.output ?? []).filter((o) => o.type === "message").flatMap((o) => o.content ?? []);
  if (parts.some((p) => p.type === "refusal")) throw new AiError("AI가 이 사진은 처리하지 못했어요.", 422);
  const text = parts.find((p) => p.type === "output_text")?.text;
  try {
    return clean(JSON.parse(text ?? ""));
  } catch {
    console.error("[ai/product] unparsable output", text?.slice(0, 200));
    throw new AiError("AI 답을 읽지 못했어요. 다시 해 주세요.");
  }
}
