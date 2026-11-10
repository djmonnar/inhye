import { adminClient, json, requireAdmin } from "@/lib/server/admin";
import { appUrl, KakaoError, sendMemo } from "@/lib/server/kakao";
import { buildBrief } from "@/lib/server/orders";
import type { Order } from "@/lib/types";

export const dynamic = "force-dynamic";

/** 관리자: 지금 알림을 한 번 보내 봐요 (보낼 주문이 없으면 연결 확인 글). */
export async function POST(req: Request) {
  const caller = await requireAdmin(req);
  if (caller instanceof Response) return caller;
  try {
    const { data } = await adminClient().from("orders").select("*").eq("status", "open");
    const text =
      buildBrief((data ?? []) as Order[]) ?? "🌸 포포하우스 카카오톡 알림이 연결됐어요!\n지금은 알려 드릴 주문이 없어요.";
    await sendMemo(text, `${appUrl(new URL(req.url).origin)}/orders`);
    return json({ sent: true, text });
  } catch (e) {
    return json({ error: e instanceof KakaoError ? e.message : "보내지 못했어요." }, 502);
  }
}
