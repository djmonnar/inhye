import { json, requireMember } from "@/lib/server/admin";
import { AiError, hasOpenAI } from "@/lib/server/openai";
import { orderChat } from "@/lib/server/orders";
import type { OrderChatTurn } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** 주문 비서: 채팅 한 번 → AI가 정리한 할 일을 서버가 검사해서 주문 표에 반영해요. */
export async function POST(req: Request) {
  const caller = await requireMember(req);
  if (caller instanceof Response) return caller;
  if (!hasOpenAI()) {
    return json({ error: "서버에 OPENAI_API_KEY가 설정되지 않았어요. Vercel 환경변수에 추가해 주세요." }, 501);
  }
  const body = (await req.json().catch(() => ({}))) as { message?: unknown; history?: unknown };
  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!message) return json({ error: "메시지를 써 주세요." }, 400);
  const history: OrderChatTurn[] = (Array.isArray(body.history) ? body.history : [])
    .filter(
      (t): t is OrderChatTurn =>
        !!t && typeof t === "object" && ((t as OrderChatTurn).role === "user" || (t as OrderChatTurn).role === "assistant") &&
        typeof (t as OrderChatTurn).text === "string",
    )
    .slice(-6);
  try {
    return json(await orderChat(message, history, caller));
  } catch (e) {
    if (e instanceof AiError) return json({ error: e.message }, e.status);
    console.error("[orders/chat]", e);
    return json({ error: e instanceof Error ? e.message : "처리하지 못했어요." }, 500);
  }
}
