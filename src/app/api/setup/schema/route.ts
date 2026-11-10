import { json, requireAdmin } from "@/lib/server/admin";
import { adminExists, applySchema, hasDbUrl, schemaErrorMessage } from "@/lib/server/schema";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * 저장소의 public/schema.sql 을 DB에 적용해요 (여러 번 해도 안전).
 * 관리자가 있으면 관리자만, 처음 설치(관리자 없음)일 때는 로그인 없이도 돼요 —
 * 정해진 SQL 파일만 실행하고 데이터를 지우지 않아서 괜찮아요.
 */
export async function POST(req: Request) {
  if (!hasDbUrl()) {
    return json({ error: schemaErrorMessage(new Error("NO_DB_URL")) }, 501);
  }
  try {
    if (await adminExists()) {
      const caller = await requireAdmin(req);
      if (caller instanceof Response) return caller;
    }
    await applySchema();
    return json({ ok: true });
  } catch (e) {
    return json({ error: schemaErrorMessage(e) }, 502);
  }
}
