import { json, requireAdmin } from "@/lib/server/admin";
import { authorizeUrl, KakaoError } from "@/lib/server/kakao";

export const dynamic = "force-dynamic";

/** 관리자: 카카오 로그인 주소를 받아 그리로 이동하면 ‘나에게 보내기’가 연결돼요. */
export async function POST(req: Request) {
  const caller = await requireAdmin(req);
  if (caller instanceof Response) return caller;
  try {
    return json({ url: authorizeUrl(new URL(req.url).origin, caller) });
  } catch (e) {
    return json({ error: e instanceof KakaoError ? e.message : "카카오 연결을 시작하지 못했어요." }, 400);
  }
}
