import { exchangeCode, KakaoError, verifyState } from "@/lib/server/kakao";

export const dynamic = "force-dynamic";

/** 카카오 로그인 후 돌아오는 곳: 토큰을 저장하고 주문 화면으로 보내요. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const back = (status: string, msg?: string) =>
    Response.redirect(`${url.origin}/orders?kakao=${status}${msg ? `&msg=${encodeURIComponent(msg)}` : ""}`, 302);

  if (url.searchParams.get("error")) return back("fail", "카카오에서 동의를 취소했어요.");
  const uid = verifyState(url.searchParams.get("state"));
  const code = url.searchParams.get("code");
  if (!uid || !code) return back("fail", "연결 요청이 만료됐어요. 다시 눌러 주세요.");
  try {
    await exchangeCode(code, url.origin, uid);
    return back("ok");
  } catch (e) {
    return back("fail", e instanceof KakaoError ? e.message : "카카오 연결에 실패했어요.");
  }
}
