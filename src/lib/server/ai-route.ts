import { json, requireMember } from "./admin";
import { AiError, hasOpenAI } from "./openai";

export type AiBody = Record<string, unknown>;

/** Shared shell for /api/ai/* routes: approved members only, key check, friendly errors. */
export async function handleAi(req: Request, label: string, run: (body: AiBody) => Promise<unknown>) {
  const caller = await requireMember(req);
  if (caller instanceof Response) return caller;
  if (!hasOpenAI()) {
    return json({ error: "서버에 OPENAI_API_KEY가 설정되지 않았어요. Vercel 환경변수에 추가해 주세요." }, 501);
  }
  const body = (await req.json().catch(() => ({}))) as AiBody;
  try {
    return json(await run(body));
  } catch (e) {
    if (e instanceof AiError) return json({ error: e.message }, e.status);
    console.error(`[ai/${label}]`, e);
    return json({ error: "AI가 처리하지 못했어요." }, 500);
  }
}

const IMAGE_RE = /^data:image\/(jpeg|png|webp|gif);base64,[A-Za-z0-9+/=]+$/;
/** Phones send ~0.5MB after compression; Vercel rejects bodies over 4.5MB anyway. */
const MAX_IMAGE_CHARS = 4_000_000;

/** Returns a validated data-URL image, or "" when absent (throws when `required`). */
export function readImage(v: unknown, required: boolean): string {
  if (v === undefined || v === null || v === "") {
    if (required) throw new AiError("사진을 다시 넣어 주세요.", 400);
    return "";
  }
  if (typeof v !== "string" || !IMAGE_RE.test(v)) throw new AiError("사진을 다시 넣어 주세요.", 400);
  if (v.length > MAX_IMAGE_CHARS) throw new AiError("사진이 너무 커요. 다시 찍어 주세요.", 413);
  return v;
}

export const readText = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export const readCategories = (v: unknown) =>
  Array.isArray(v) ? v.filter((c): c is string => typeof c === "string").map((c) => c.slice(0, 20)).slice(0, 60) : [];
