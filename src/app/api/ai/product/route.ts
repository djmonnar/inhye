import { describeProductPhoto } from "@/lib/server/ai-product";
import { handleAi, readCategories, readImage, readText } from "@/lib/server/ai-route";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export function POST(req: Request) {
  return handleAi(req, "product", async (body) => ({
    draft: await describeProductPhoto(
      readImage(body.image, true),
      readCategories(body.categories),
      readText(body.hint, 100),
    ),
  }));
}
