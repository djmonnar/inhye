import { json, requireMember } from "@/lib/server/admin";
import { AiError, describeProductPhoto, hasOpenAI } from "@/lib/server/openai";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const IMAGE_RE = /^data:image\/(jpeg|png|webp|gif);base64,[A-Za-z0-9+/=]+$/;
/** Phones send ~0.5MB after compression; Vercel rejects bodies over 4.5MB anyway. */
const MAX_IMAGE_CHARS = 4_000_000;

type Body = { image?: unknown; categories?: unknown; hint?: unknown };

export async function POST(req: Request) {
  const caller = await requireMember(req);
  if (caller instanceof Response) return caller;
  if (!hasOpenAI()) {
    return json({ error: "서버에 OPENAI_API_KEY가 설정되지 않았어요. Vercel 환경변수에 추가해 주세요." }, 501);
  }

  const body = (await req.json().catch(() => ({}))) as Body;
  const image = typeof body.image === "string" ? body.image : "";
  if (!IMAGE_RE.test(image)) return json({ error: "사진을 다시 넣어 주세요." }, 400);
  if (image.length > MAX_IMAGE_CHARS) return json({ error: "사진이 너무 커요. 다시 찍어 주세요." }, 413);
  const categories = Array.isArray(body.categories)
    ? body.categories.filter((c): c is string => typeof c === "string").map((c) => c.slice(0, 20)).slice(0, 60)
    : [];
  const hint = typeof body.hint === "string" ? body.hint.trim().slice(0, 100) : "";

  try {
    return json({ draft: await describeProductPhoto(image, categories, hint) });
  } catch (e) {
    if (e instanceof AiError) return json({ error: e.message }, e.status);
    console.error("[ai/product]", e);
    return json({ error: "AI가 사진을 읽지 못했어요." }, 500);
  }
}
