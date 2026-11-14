/**
 * 챗봇 ‘사용법’ 답 (AI 없이 바로). "발주 어떻게 넣어?"처럼 방법을 묻는 말에
 * 그 주제의 짧은 안내 + 바로 해 볼 버튼을 줘요. AI 해석기도 howto로 골라서 여기로 와요.
 */

export type HowtoTopic = "reorder" | "orders" | "supplier" | "price" | "product" | "sales" | "settle" | "label";

export interface Howto {
  text: string;
  /** 바로 보낼 수 있는 말 (빠른 답 버튼) */
  tryIt: string[];
  /** 앱에서 하는 게 편할 때 */
  app?: { label: string; path: string };
}

/** 방법을 묻는 말인지 ("품절된 거 뭐 있어?"처럼 목록을 달라는 말은 아니에요) */
export const HOWTO_RE = /어떻게|어케|어떡해|방법|하는\s*법|쓰는\s*법|사용법|하려면|알려\s*줘|알려\s*주세요|가르쳐/;

/** 말 속 주제 — 앞에 있을수록 먼저 봐요 (‘거래처에 주문’은 발주, ‘주문’만은 예약 주문) */
const TOPICS: [HowtoTopic, RegExp][] = [
  ["reorder", /발주|품절|재주문|다시\s*주문|사입|입고|채워|거래처에\s*주문|물건\s*주문/],
  ["settle", /정산|인혜|경령/],
  ["label", /라벨|프린터|인쇄|출력|스티커/],
  ["price", /가격\s*기록|매입가|원가|최저가|거래처별\s*가격|가격\s*비교|더\s*싼/],
  ["orders", /주문|예약|꽃다발|픽업|택배|손님/],
  ["supplier", /거래처|구매처|도매/],
  ["sales", /매출|판매|팔린|팔렸/],
  ["product", /상품|재고|바코드|찾/],
];

export function howtoTopic(said: string): HowtoTopic | null {
  for (const [topic, re] of TOPICS) if (re.test(said)) return topic;
  return null;
}

/** AI가 고른 주제 이름(한국어·영어 아무거나) → 주제 */
export function topicFromQuery(q: string | null | undefined, said: string): HowtoTopic | null {
  if (q) {
    const t = q.trim().toLowerCase();
    if ((TOPICS.map(([k]) => k) as string[]).includes(t)) return t as HowtoTopic;
    const fromQ = howtoTopic(q);
    if (fromQ) return fromQ;
  }
  return howtoTopic(said);
}

export function howto(topic: HowtoTopic): Howto {
  switch (topic) {
    case "reorder":
      return {
        text: [
          "발주는 이렇게 해요 📦",
          "1) ‘발주 목록’을 보내면 재고가 발주 기준 아래인 상품이 거래처별로 나와요 (추천 수량 · 개당 가격 · 더 싼 곳)",
          "2) 카드의 ‘주문하러 가기’·‘전화하기’로 거래처에 주문해요. 앱 발주 화면에선 수량을 고치고 주문 목록을 복사해서 거래처 카톡에 붙여 넣을 수 있어요",
          "3) 물건이 오면 앱에서 ‘입고’를 눌러 재고를 더해요. 산 곳 · 매입가를 같이 적으면 거래처별 가격도 저장돼요",
          "",
          "💡 발주 기준(이만큼 남으면 알려 줘)은 앱 상품 화면에서 정해요.",
        ].join("\n"),
        tryIt: ["발주 목록"],
        app: { label: "앱 발주 화면", path: "/reorder" },
      };
    case "orders":
      return {
        text: [
          "예약 주문(꽃다발 등)은 이렇게 보내요 🌸",
          "• 등록: 11/20 금 오후 3시 픽업 김포포 꽃다발 2.5만원 (메모)",
          "  날짜 · 시간 · 픽업/택배 · 이름 · 상품 · 가격 순서면 바로 등록돼요. 여러 줄도 한 번에!",
          "• 택배 출고일: 11/23 택배 박고양 꽃다발 3만원 11/21 출고",
          "• 이어서 고치기: 방금 넣은 주문이면 ‘가격은 3만원이야’, ‘연핑크로 변경’처럼 바로 말해도 돼요",
          "• 완료: 김포포 보냈어 · 취소: 김포포 주문 취소",
          "• 고치기: 김포포 4시로 바꿔줘",
          "• 보기: 주문 목록 · 오늘 픽업 · 내일 픽업",
          "",
          "💡 택배는 7일 전부터, 픽업은 전날 · 당일에 ‘나와의 채팅’으로 알려줘요.",
        ].join("\n"),
        tryIt: ["주문 목록", "오늘 픽업"],
        app: { label: "앱 주문 화면", path: "/orders" },
      };
    case "supplier":
      return {
        text: [
          "거래처는 이렇게 다뤄요 🏪",
          "• 거래처 등록 — 이름 · 전화 · 사이트 · 주문 조건을 차례로 물어봐요",
          "• 거래처 도매꾹 — 전화 · 사이트 · 담당자 보기",
          "• 거래처 수정 도매꾹 — 고칠 칸을 골라서 바꿔요",
          "• 거래처 상품 도매꾹 — 거기서 사는 상품과 가격",
        ].join("\n"),
        tryIt: ["거래처 목록", "거래처 등록"],
        app: { label: "앱 거래처 화면", path: "/suppliers" },
      };
    case "price":
      return {
        text: [
          "거래처별 가격은 이렇게 적어요 💰",
          "• 가격 기록 곰돌이 — 어느 거래처에서 개당 얼마인지 차례로 물어봐요",
          "• 상품 곰돌이 — 거래처별 가격 · 최저가 · 오래된 가격을 보여줘요",
          "• 앱에서 입고할 때 산 곳 · 매입가를 적어도 자동으로 기록돼요",
        ].join("\n"),
        tryIt: ["가격 기록", "상품 찾기"],
      };
    case "product":
      return {
        text: [
          "상품 · 재고는 이렇게 봐요 🔎",
          "• 상품 곰돌이 — 이름 일부만 써도 돼요",
          "• 바코드 숫자를 그대로 보내도 찾아요",
          "• 재고를 더하거나 빼는 것(입고 · 폐기 · 실사)과 새 상품 등록은 앱에서 해요 (바코드 찍기 화면이 편해요)",
        ].join("\n"),
        tryIt: ["상품 찾기", "발주 목록"],
        app: { label: "앱 바코드 찍기", path: "/scan" },
      };
    case "sales":
      return {
        text: [
          "매출은 이렇게 봐요 📈",
          "• 오늘 매출 — 빅솔론 키오스크 판매를 바로 보여줘요 (합계는 10분쯤 늦을 수 있어요)",
          "• 날짜별 · 영수증별 매출과 재고 반영은 앱 매출 화면에서 해요",
        ].join("\n"),
        tryIt: ["오늘 매출"],
        app: { label: "앱 매출 화면", path: "/sales" },
      };
    case "settle":
      return {
        text: [
          "정산은 이렇게 봐요 🧾",
          "• A 분류 = 인혜 매출, B 분류 = 경령 매출 (빅솔론 분류명 앞이나 뒤의 A·B로 나눠요)",
          "• 이번 달 정산 · 지난달 정산 · 10월 정산",
          "• 인혜 매출 얼마야? · 경령 지난달 정산 · 이번 주 a 매출",
          "• 분류별 · 상품별 자세히, 엑셀은 앱 A/B 정산 화면에서",
        ].join("\n"),
        tryIt: ["이번 달 정산", "지난달 정산"],
        app: { label: "앱 A/B 정산", path: "/sales/settle" },
      };
    case "label":
      return {
        text: [
          "라벨은 앱에서 인쇄해요 🏷️",
          "• 앱 라벨 화면에서 상품을 골라 인쇄해요 (Xprinter)",
          "• 폰에서 고르고 노트북으로 보내 인쇄할 수도 있어요 (인쇄 스테이션)",
        ].join("\n"),
        tryIt: [],
        app: { label: "앱 라벨 화면", path: "/labels" },
      };
  }
}
