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

export type AiContent =
  | { type: "input_text"; text: string }
  | { type: "input_image"; image_url: string; detail: "auto" | "low" | "high" };

/** Strict-mode JSON schema object: every property required, nothing extra. */
export function objectSchema(properties: Record<string, object>) {
  return { type: "object", additionalProperties: false, required: Object.keys(properties), properties };
}

export const STRING = { type: "string" } as const;
export const STRINGS = { type: "array", items: STRING } as const;

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
  return new AiError(`AI가 처리하지 못했어요. (${body.error?.message ?? status})`);
}

/** One Responses API call with a strict JSON schema; returns the parsed object. */
export async function askJson<T>(opts: {
  label: string;
  instructions: string;
  content: AiContent[];
  schema: object;
  maxOutputTokens?: number;
}): Promise<T> {
  let res: Response;
  try {
    res = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        model: MODEL,
        instructions: opts.instructions,
        input: [{ role: "user", content: opts.content }],
        text: { format: { type: "json_schema", name: opts.label.replace(/\W/g, "_"), strict: true, schema: opts.schema } },
        reasoning: { effort: "low" },
        max_output_tokens: opts.maxOutputTokens ?? 4000,
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
    console.error(`[ai/${opts.label}] OpenAI error`, res.status, body.error?.code, body.error?.message);
    throw friendlyError(res.status, body);
  }
  if (body.status === "incomplete") {
    console.error(`[ai/${opts.label}] incomplete`, body.incomplete_details?.reason);
    throw new AiError("AI 답이 중간에 끊겼어요. 다시 해 주세요.");
  }

  const parts = (body.output ?? []).filter((o) => o.type === "message").flatMap((o) => o.content ?? []);
  if (parts.some((p) => p.type === "refusal")) throw new AiError("AI가 이 요청은 처리하지 못했어요.", 422);
  const text = parts.find((p) => p.type === "output_text")?.text;
  try {
    return JSON.parse(text ?? "") as T;
  } catch {
    console.error(`[ai/${opts.label}] unparsable output`, text?.slice(0, 200));
    throw new AiError("AI 답을 읽지 못했어요. 다시 해 주세요.");
  }
}

export const clip = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** Trims, normalizes, drops empties and duplicates (after normalizing), then caps the list. */
export const clipList = (v: unknown, max: number, each: number, normalize = (s: string) => s) =>
  [...new Set((Array.isArray(v) ? v : []).map((t) => normalize(clip(t, each))).filter(Boolean))].slice(0, max);

export const hashtag = (s: string) => s.replace(/^#+/, "").replace(/\s+/g, "");
