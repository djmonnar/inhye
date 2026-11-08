import { describeProductPage } from "@/lib/server/ai-product";
import { handleAi, readCategories, readText } from "@/lib/server/ai-route";
import { fetchProductPage } from "@/lib/server/fetch-page";
import { AiError } from "@/lib/server/openai";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export function POST(req: Request) {
  return handleAi(req, "link", async (body) => {
    const url = readText(body.url, 2000);
    if (!url) throw new AiError("구매 링크를 먼저 넣어 주세요.", 400);
    const page = await fetchProductPage(url);
    return { draft: await describeProductPage(page, readCategories(body.categories)) };
  });
}
