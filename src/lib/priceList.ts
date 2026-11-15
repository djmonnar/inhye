/**
 * 포포하우스 주문 가격표 (사장님 가격표 이미지 그대로, 2026-11-15).
 * 카톡 챗봇 “꽃다발 M 얼마야?”·“가격표”, 주문 비서의 가격 질문, 주문 화면 ‘가격표’가 이걸 써요.
 * 가격이 바뀌면 이 파일만 고치면 돼요.
 */

export interface PriceItem {
  /** 크기·종류 (S, M, 치이카와, 부토니에 …) */
  name: string;
  /** 보여줄 가격 ("30,000원", "2만~3만원대", "별도 문의") */
  price: string;
}

export interface PriceSection {
  key: string;
  emoji: string;
  title: string;
  sub?: string;
  items: PriceItem[];
  notes: string[];
  /** 이 말이 있으면 이 칸 */
  words: RegExp;
}

export const PRICE_LIST: PriceSection[] = [
  {
    key: "doll",
    emoji: "🧸",
    title: "인형 꽃다발",
    items: [
      { name: "치이카와", price: "30,000원" },
      { name: "가나디", price: "35,000원" },
    ],
    notes: ["가나디 꽃 추가금은 구성에 따라 달라져요"],
    words: /인형\s*꽃다발|치이카와\s*꽃다발|가나디/,
  },
  {
    key: "bouquet",
    emoji: "💐",
    title: "꽃다발",
    items: [
      { name: "S", price: "30,000원" },
      { name: "M", price: "50,000원" },
    ],
    notes: ["쇼핑백 +2,000원 (꽃다발 50,000원 이상 구매 시 무료)"],
    words: /꽃다발|쇼핑\s*백/,
  },
  {
    key: "basket",
    emoji: "🧺",
    title: "꽃바구니",
    items: [
      { name: "S", price: "80,000원" },
      { name: "M", price: "110,000원" },
      { name: "L", price: "140,000원" },
      { name: "XL", price: "180,000원" },
    ],
    notes: ["원하시는 금액대에 맞춰 주문 가능해요"],
    words: /꽃\s*바구니|바구니/,
  },
  {
    key: "vase",
    emoji: "🏺",
    title: "화병꽂이 · 달항아리",
    items: [
      { name: "화병꽂이", price: "별도 문의" },
      { name: "달항아리", price: "별도 문의" },
    ],
    notes: [],
    words: /화병\s*꽂이|화병|달\s*항아리/,
  },
  {
    key: "acrylic",
    emoji: "👜",
    title: "아크릴백",
    items: [
      { name: "S", price: "90,000원" },
      { name: "M", price: "120,000원" },
    ],
    notes: ["원하는 인형으로 구성 가능해요", "추가 옵션은 ‘아크릴백 옵션’을 물어보세요"],
    words: /아크릴\s*백|아크릴/,
  },
  {
    key: "clear",
    emoji: "🛍",
    title: "클리어백",
    sub: "PVC 캐리어",
    items: [
      { name: "S", price: "50,000원" },
      { name: "M", price: "70,000원" },
      { name: "L", price: "90,000원" },
    ],
    notes: ["추가 옵션은 ‘클리어백 옵션’을 물어보세요"],
    words: /클리어\s*백|PVC|피브이씨|캐리어/i,
  },
  {
    key: "bridal",
    emoji: "👰",
    title: "부케",
    items: [
      { name: "Mini", price: "2만~3만원대" },
      { name: "S", price: "50,000~60,000원" },
      { name: "M", price: "70,000~90,000원" },
      { name: "L", price: "90,000~120,000원" },
      { name: "XL", price: "150,000원부터" },
      { name: "부토니에", price: "5,000원" },
      { name: "혼주 / 사회자 코사지", price: "7,000원" },
    ],
    notes: [],
    words: /부케|부토니에|코사지/,
  },
  {
    key: "options",
    emoji: "✨",
    title: "아크릴백 · 클리어백 추가 옵션",
    sub: "기본 가격에 따로 더해요",
    items: [
      { name: "인형 추가", price: "산리오 +8,000원 / 치이카와 +10,000원" },
      { name: "레터링 문구", price: "+3,000원" },
      { name: "달력 레터링", price: "+5,000원" },
      { name: "꽃 추가", price: "+20,000원 / +30,000원" },
    ],
    notes: ["추가 옵션을 포함한 최종 금액은 상담 후 안내드려요"],
    words: /인형\s*추가|레터링|꽃\s*추가|옵션/,
  },
];

export const PRICE_FOOTER = "주문제작 · 대여 문의: 포포하우스 카카오톡 채널 · ☎ 0507-1458-0096 · 매장 픽업 · 진주 내 배달 가능";

const SIZE_WORDS: [RegExp, string][] = [
  [/엑스\s*라지|(?<![A-Za-z])xl(?![A-Za-z])/i, "XL"],
  [/미니|(?<![A-Za-z])mini(?![A-Za-z])/i, "Mini"],
  [/라지|(?<![A-Za-z])l(?![A-Za-z])/i, "L"],
  [/미디움|미디엄|(?<![A-Za-z])m(?![A-Za-z])/i, "M"],
  [/스몰|(?<![A-Za-z])s(?![A-Za-z])/i, "S"],
];

export function findPriceSection(said: string): PriceSection | null {
  // 옵션을 묻는 말(“아크릴백 옵션”, “인형 추가 얼마”)은 옵션 칸이 먼저
  const opt = PRICE_LIST.find((s) => s.key === "options")!;
  if (opt.words.test(said)) return opt;
  return PRICE_LIST.find((s) => s.words.test(said)) ?? null;
}

/** 칸 안에서 물은 크기·종류 (없으면 null) */
export function findPriceItem(section: PriceSection, said: string): PriceItem | null {
  const flat = (x: string) => x.replace(/\s+/g, "");
  // 이름 전체가 있으면 그것 (“꽃 추가”, “달력 레터링”)
  const full = section.items.find((it) => it.name.length > 1 && flat(said).includes(flat(it.name)));
  if (full) return full;
  // 아니면 이름 속 낱말이 가장 많이 맞는 것 (“코사지” → 혼주 / 사회자 코사지)
  let best: PriceItem | null = null;
  let bestScore = 0;
  for (const it of section.items) {
    const score = it.name.split(/[\s/]+/).filter((w) => w.length >= 2 && said.includes(w)).length;
    if (score > bestScore) {
      best = it;
      bestScore = score;
    }
  }
  if (best) return best;
  for (const [re, size] of SIZE_WORDS) {
    if (re.test(said)) return section.items.find((it) => it.name === size) ?? null;
  }
  return null;
}

/** 가게 가격표를 묻는 말인지 — 정산·매출·주문 수정(“꽃다발 3만원으로 바꿔줘”)은 아니에요 */
export function isPriceListAsk(said: string): boolean {
  if (/정산|매출|팔렸|팔린|벌었|가격\s*기록|\d{1,2}\s*[/.]\s*\d{1,2}/.test(said)) return false;
  if (/바꿔|바꾸|변경|수정|고쳐|등록|추가해|빼\s*줘|\d+(?:\.\d+)?\s*만\s*원?|\d{1,3}(?:,\d{3})+|\d{4,}\s*원/.test(said)) return false;
  if (/가격표|메뉴판|주문\s*가격|가격\s*알려/.test(said)) return true;
  return Boolean(findPriceSection(said)) && /얼마|가격|금액|비용|몇\s*원|추가금/.test(said);
}

export function sectionText(s: PriceSection): string {
  return [
    `${s.emoji} ${s.title}${s.sub ? ` (${s.sub})` : ""}`,
    ...s.items.map((it) => `• ${it.name} ${it.price}`),
    ...s.notes.map((n) => `  ${n}`),
  ].join("\n");
}

/** 전체 가격표 글 (챗봇·주문 비서 참고용) */
export function priceListText(): string {
  return [...PRICE_LIST.map(sectionText), "", PRICE_FOOTER].join("\n");
}

/** “꽃다발 M 얼마야?” → 답 글. 칸을 못 찾으면 전체 가격표 */
export function priceAnswer(said: string): { text: string; section: PriceSection | null } {
  const section = findPriceSection(said);
  if (!section) return { text: `📋 포포하우스 주문 가격표\n\n${priceListText()}`, section: null };
  const item = findPriceItem(section, said);
  if (item) {
    const head = `${section.emoji} ${section.title} ${item.name} · ${item.price}`;
    return { text: [head, ...section.notes.map((n) => `  ${n}`), "", sectionText(section)].join("\n"), section };
  }
  return { text: sectionText(section), section };
}
