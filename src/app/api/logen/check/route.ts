import { json, requireAdmin } from "@/lib/server/admin";
import { LogenError, logenCheck } from "@/lib/server/logen";

export const dynamic = "force-dynamic";

/** 관리자: 로젠 연결 확인 (계약 운임 조회 — 아무것도 바꾸지 않아요) */
export async function POST(req: Request) {
  const caller = await requireAdmin(req);
  if (caller instanceof Response) return caller;
  try {
    return json(await logenCheck());
  } catch (e) {
    if (e instanceof LogenError) return json({ error: e.message }, e.status);
    console.error("[logen/check]", e);
    return json({ error: "로젠 연결을 확인하지 못했어요." }, 500);
  }
}
