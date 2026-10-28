import { writePromo } from "@/lib/server/ai-promo";
import { handleAi, readImage, readText } from "@/lib/server/ai-route";
import { AiError } from "@/lib/server/openai";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export function POST(req: Request) {
  return handleAi(req, "promo", async (body) => {
    const name = readText(body.name, 80);
    if (!name) throw new AiError("상품명이 없어요.", 400);
    const price = Number(body.sale_price);
    const promo = await writePromo(
      {
        name,
        category: readText(body.category, 30),
        sale_price: Number.isFinite(price) && price > 0 ? Math.round(price) : 0,
        tags: (Array.isArray(body.tags) ? body.tags : []).map((t) => readText(t, 20)).filter(Boolean).slice(0, 10),
        description: readText(body.description, 300) || null,
        focus: readText(body.focus, 100),
      },
      readImage(body.image, false),
    );
    return { promo };
  });
}
