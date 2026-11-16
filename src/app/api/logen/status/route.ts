import { json, requireMember } from "@/lib/server/admin";
import { logenInfo } from "@/lib/server/logen";

export const dynamic = "force-dynamic";

/** 로젠 연동 준비 상태 (값은 돌려주지 않고 있음/없음만) */
export async function GET(req: Request) {
  const caller = await requireMember(req);
  if (caller instanceof Response) return caller;
  return json(logenInfo());
}
