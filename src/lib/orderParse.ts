/**
 * 주문 한 줄을 AI 없이 바로 읽어요 (빠르게 — 카카오 5초 안, 앱에서도 즉시).
 * 정해진 모양만 읽고, 조금이라도 애매하면 null → 주문 비서(AI)가 맡아요.
 *
 *   "11/20 금 오후 3시 픽업 김포포 하치와레 꽃다발 2.5만원 (라넌으로 변경)"
 *   → 2026-11-20 15:00 픽업, 김포포, 하치와레 꽃다발, 25000원, 메모 ‘라넌으로 변경’
 *
 *   "내일 4시 픽업 이토끼 꽃다발 3만원" (오늘·내일·모레도 돼요)
 *
 *   "김포포 꽃다발 보냈어" / "김포포 완료" → 완료,  "김포포 주문 취소" → 취소
 */

const WEEK = ["일", "월", "화", "수", "목", "금", "토"];

export interface ParsedOrder {
  due_date: string;
  due_time: string | null;
  method: "pickup" | "delivery";
  customer: string;
  item: string;
  price: number;
  memo: string | null;
  /** 요일이 날짜와 다를 때 알려줄 말 */
  note?: string;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** 연도 없는 월/일 → 오늘 이후 가장 가까운 날 (두 달 넘게 지난 날짜면 내년) */
function pickYear(month: number, day: number, today: string): string | null {
  const y = Number(today.slice(0, 4));
  for (const year of [y, y + 1]) {
    const iso = `${year}-${pad(month)}-${pad(day)}`;
    const d = new Date(`${iso}T00:00:00Z`);
    if (d.getUTCMonth() + 1 !== month || d.getUTCDate() !== day) return null; // 2/30 같은 없는 날
    const diffDays = (d.getTime() - Date.parse(`${today}T00:00:00Z`)) / 86400000;
    if (diffDays >= -60) return iso;
  }
  return null;
}

function addDays(day: string, n: number) {
  return new Date(Date.parse(`${day}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
}

/** "오후 3시 반", "3시 30분", "15:30", "4시"(가게 시간이라 1~8시는 오후) → "HH:MM" */
function takeTime(s: string): { time: string | null; rest: string } {
  let m = s.match(/(^|\s)(오전|오후|낮|저녁|밤|아침)?\s*(\d{1,2})\s*시\s*(?:(반)|(\d{1,2})\s*분)?(?=\s|$)/);
  if (m) {
    let h = Number(m[3]);
    const min = m[4] ? 30 : m[5] ? Number(m[5]) : 0;
    const ap = m[2];
    if (h > 24 || min > 59) return { time: null, rest: s };
    if ((ap === "오후" || ap === "저녁" || ap === "밤") && h < 12) h += 12;
    else if (ap === "낮" && h < 6) h += 12;
    else if (!ap && h >= 1 && h <= 8) h += 12;
    if (h === 24) h = 0;
    return { time: `${pad(h)}:${pad(min)}`, rest: s.replace(m[0], " ") };
  }
  m = s.match(/(^|\s)(\d{1,2}):(\d{2})(?=\s|$)/);
  if (m && Number(m[2]) < 24 && Number(m[3]) < 60) return { time: `${pad(Number(m[2]))}:${m[3]}`, rest: s.replace(m[0], " ") };
  return { time: null, rest: s };
}

/** "2.5만원" "3만" "1만5천" "25,000원" "25000" → 원 */
function takePrice(s: string): { price: number; rest: string } {
  let m = s.match(/(^|\s)(\d+(?:\.\d+)?)\s*만\s*(?:(\d)\s*천)?\s*원?(?=\s|$)/);
  if (m) return { price: Math.round(parseFloat(m[2]) * 10000 + (m[3] ? Number(m[3]) * 1000 : 0)), rest: s.replace(m[0], " ") };
  m = s.match(/(^|\s)(\d{1,3}(?:,\d{3})+|\d{4,7})\s*원?(?=\s|$)/);
  if (m) return { price: Number(m[2].replace(/,/g, "")), rest: s.replace(m[0], " ") };
  return { price: 0, rest: s };
}

export function parseOrderLine(raw: string, today: string): ParsedOrder | null {
  let s = ` ${raw.trim()} `;
  if (!raw.trim()) return null;

  // 괄호 안 말 → 메모
  const memos: string[] = [];
  s = s.replace(/[(（]([^)）]*)[)）]/g, (_, m: string) => {
    if (m.trim()) memos.push(m.trim());
    return " ";
  });

  // 날짜 (필수): 11/20 · 11.20 · 11월 20일 · 오늘/내일/모레
  let due: string | null;
  const dm = s.match(/(^|\s)(\d{1,2})\s*[/.월]\s*(\d{1,2})\s*일?(?=\s|$)/);
  const rm = dm ? null : s.match(/(^|\s)(오늘|내일|모레)(?=\s|$)/);
  if (dm) due = pickYear(Number(dm[2]), Number(dm[3]), today);
  else if (rm) due = addDays(today, ["오늘", "내일", "모레"].indexOf(rm[2]));
  else return null;
  if (!due) return null;
  s = s.replace((dm ?? rm)![0], " ");

  // 요일 (있으면 확인만)
  let weekday: string | null = null;
  s = s.replace(/(^|\s)([월화수목금토일])(?:요일)?(?=\s|$)/, (_, sp: string, w: string) => {
    weekday = w;
    return " ";
  });

  const t = takeTime(s);
  s = t.rest;

  // 받는 방법
  let method: "pickup" | "delivery" = "pickup";
  const mm = s.match(/(^|\s)(택배|배송|퀵|픽업|방문|수령)(?=\s|$)/);
  if (mm) {
    method = /택배|배송|퀵/.test(mm[2]) ? "delivery" : "pickup";
    s = s.replace(mm[0], " ");
  }

  const p = takePrice(s);
  s = p.rest;

  // 남은 말: 첫 단어 = 주문한 분, 나머지 = 상품
  const words = s.split(/\s+/).filter(Boolean);
  if (words.length < 2) return null;
  const customer = words[0].replace(/님$/, "");
  if (!/^[가-힣A-Za-z]{2,10}$/.test(customer)) return null;
  const item = words.slice(1).join(" ");
  if (!/[가-힣A-Za-z]/.test(item)) return null;
  if (/\d/.test(item.replace(/\d+(cm|mm|호|개|종|송이)/g, ""))) return null; // 숫자가 남으면 애매해요 → AI

  const real = WEEK[new Date(`${due}T00:00:00Z`).getUTCDay()];
  return {
    due_date: due,
    due_time: t.time,
    method,
    customer,
    item,
    price: p.price,
    memo: memos.length ? memos.join(", ") : null,
    ...(weekday && weekday !== real
      ? { note: `${Number(due.slice(5, 7))}/${Number(due.slice(8, 10))}은 ${real}요일이에요 (${weekday}요일이라고 쓰셨어요). 날짜 기준으로 넣었어요.` }
      : {}),
  };
}

/** "김포포 꽃다발 보냈어" → 완료, "김포포 주문 취소" → 취소 (이름은 첫 단어) */
export function parseQuickAction(raw: string): { kind: "complete" | "cancel"; name: string } | null {
  const s = raw.trim().replace(/[.!~?]+$/, "").replace(/\s+/g, " ");
  const words = s.split(" ");
  if (words.length < 2 || words.length > 5) return null;
  const name = words[0].replace(/님$/, "");
  if (!/^[가-힣A-Za-z]{2,10}$/.test(name)) return null;
  const tail = words.slice(1).join(" ");
  if (/(보냈어요?|보냈음|보냄|발송\s*완료|완료(?:했어요?|함|요)?|찾아\s*갔어요?|가져\s*갔어요?|픽업\s*(?:완료|했어요?))$/.test(tail)) {
    return { kind: "complete", name };
  }
  if (/(?:주문\s*)?취소(?:해\s*줘|해주세요|할게요?|요|함)?$/.test(tail)) return { kind: "cancel", name };
  return null;
}
