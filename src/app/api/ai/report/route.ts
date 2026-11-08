import { handleAi } from "@/lib/server/ai-route";
import { writeReport } from "@/lib/server/ai-report";
import { AiError } from "@/lib/server/openai";
import type { ReportFacts } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Facts are computed in the app (already capped per list); this only guards the size and shape. */
function readFacts(v: unknown): ReportFacts {
  const f = v as ReportFacts | undefined;
  const lists = [f?.top_movers, f?.reorder, f?.slow_movers, f?.low_margin, f?.new_products];
  if (!f || typeof f !== "object" || !f.totals || !lists.every(Array.isArray)) {
    throw new AiError("리포트 데이터가 올바르지 않아요. 새로고침 후 다시 해 주세요.", 400);
  }
  if (JSON.stringify(f).length > 60_000) throw new AiError("리포트 데이터가 너무 커요.", 413);
  return f;
}

export function POST(req: Request) {
  return handleAi(req, "report", async (body) => ({ report: await writeReport(readFacts(body.facts)) }));
}
