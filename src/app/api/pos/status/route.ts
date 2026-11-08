import { hasServiceKey, json, requireMember } from "@/lib/server/admin";
import { bixolonStatus } from "@/lib/server/bixolon";

export const dynamic = "force-dynamic";

/** 연동 준비 상태 (값은 절대 돌려주지 않고 있음/없음만). */
export async function GET(req: Request) {
  if (!hasServiceKey()) {
    return json({ serviceKey: false, storeId: false, apiKey: false, apiBase: false, adapterReady: false });
  }
  const caller = await requireMember(req);
  if (caller instanceof Response) return caller;
  return json({ serviceKey: true, ...bixolonStatus() });
}
