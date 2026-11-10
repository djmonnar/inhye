import { json, requireMember } from "@/lib/server/admin";
import { cronReady, kakaoConfigured, loadBriefHour, loadTokens } from "@/lib/server/kakao";

export const dynamic = "force-dynamic";

/** 카카오 알림 준비 상태 (값은 돌려주지 않고 있음/없음만) */
export async function GET(req: Request) {
  const caller = await requireMember(req);
  if (caller instanceof Response) return caller;
  const row = kakaoConfigured() ? await loadTokens() : null;
  return json({
    configured: kakaoConfigured(),
    connected: Boolean(row),
    cronReady: cronReady(),
    lastBriefOn: row?.last_brief_on ?? null,
    briefHour: await loadBriefHour(),
  });
}
