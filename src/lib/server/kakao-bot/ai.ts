import { askJson, hasOpenAI, objectSchema } from "../openai";
import { orderChat } from "../orders";
import type { AiIntent, AiRoute, BotAi } from "./types";

/**
 * 카카오 챗봇의 AI (서버 전용, OpenAI).
 * - route: 정해진 말이 아닐 때 ‘무슨 뜻인지’만 빠르게(2.6초 안) 골라요 → 챗봇의 정해진 명령으로 실행.
 *   OPENAI_FAST_MODEL을 주면 그 모델로(더 빠르고 싸게), 없으면 OPENAI_MODEL.
 * - orderChat: 앱의 주문 비서와 같은 두뇌 (src/lib/server/orders.ts).
 */

const INTENTS: AiIntent[] = [
  "orders",
  "order_list",
  "supplier",
  "supplier_list",
  "supplier_products",
  "supplier_new",
  "supplier_edit",
  "product",
  "price_record",
  "reorder",
  "sales",
  "howto",
  "help",
  "unknown",
];

const SCHEMA = objectSchema({
  intent: { type: "string", enum: INTENTS },
  query: { type: ["string", "null"] },
});

function instructions(suppliers: string[]) {
  return `너는 무인 소품샵 ‘포포하우스’ 카카오톡 관리 챗봇의 ‘말 해석기’야. 사장님·직원이 보낸 말을 아래 뜻(intent) 하나로 고르고, 찾을 말(query)을 뽑아.

- orders: 예약 주문(꽃다발 등) 등록·수정·완료·취소. 예) "다음 주 화요일 3시 김포포 꽃다발 2만원", "김포포 꽃다발 보냈어", "이토끼 주문 취소"
- order_list: 주문 목록, 이번 주 주문·픽업 뭐 있어
- supplier: 특정 거래처 정보(전화·사이트·담당자·주문 조건). query = 거래처 이름
- supplier_list: 거래처 전체 목록
- supplier_products: 그 거래처에서 사는 상품. query = 거래처 이름
- supplier_new: 거래처 새로 등록. query = 새 거래처 이름(있으면)
- supplier_edit: 거래처 정보 고치기. query = 거래처 이름
- product: 상품 재고·판매가·원가·어디서 샀는지·최저가. query = 상품 이름 (질문·조사 빼고 핵심 이름만)
- price_record: 상품의 매입가(거래처 가격) 적기. query = 상품 이름
- reorder: 발주할 것 보여 줘, 품절·채워야 할 것, 뭐 주문해야 해 (목록을 달라는 말)
- sales: 오늘 매출·판매
- howto: 어떤 일을 ‘어떻게 하는지’ 방법을 묻는 말. query = 주제 하나(reorder 발주·입고 / orders 예약 주문 / supplier 거래처 / price 가격 기록 / product 상품·재고 / sales 매출 / label 라벨 인쇄). 예) "발주 어떻게 넣어?" → howto, reorder
- help: 챗봇 전체 사용법, 뭐 할 수 있어
- unknown: 위에 없음 (인사·잡담 포함)

거래처 이름 목록: ${suppliers.join(", ") || "(없음)"}
query는 원문에 나온 이름 그대로 쓰되, 거래처는 목록에 있으면 목록의 정확한 이름으로. 없으면 null.`;
}

export function makeBotAi(): BotAi | undefined {
  if (!hasOpenAI()) return undefined;
  const fast = (process.env.OPENAI_FAST_MODEL ?? "").trim() || undefined;
  return {
    async route(said, hints, opts): Promise<AiRoute | null> {
      const t0 = Date.now();
      try {
        const out = await askJson<{ intent: AiIntent; query: string | null }>({
          label: "kakao_route",
          instructions: instructions(hints.suppliers),
          content: [{ type: "input_text", text: said.slice(0, 500) }],
          schema: SCHEMA,
          maxOutputTokens: 600,
          timeoutMs: opts?.timeoutMs ?? 2600,
          model: fast,
          effort: "low",
        });
        if (!INTENTS.includes(out.intent)) return null;
        return { intent: out.intent, query: out.query?.trim() || null };
      } catch (e) {
        // 왜 못 골랐는지 로그에만 (말 내용은 안 남겨요)
        console.warn(`[kakao ai] route error after ${Date.now() - t0}ms:`, e instanceof Error ? e.message : e);
        return null;
      }
    },
    orderChat: (message, history, userId) => orderChat(message, history, userId),
  };
}
