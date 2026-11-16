/**
 * 택배사 이름 · 송장번호 읽기 · 배송 조회 링크 (앱 주문 화면 · 주문 비서 · 카톡 챗봇 · 송장 안내문 공용).
 */

/** 화면에서 고르는 택배사 (계약한 로젠을 맨 앞에) */
export const CARRIER_NAMES = ["로젠", "우체국", "CJ대한통운", "한진", "롯데", "경동"] as const;

const CARRIER_RE: [RegExp, string][] = [
  [/로젠/, "로젠"],
  [/우체국/, "우체국"],
  [/CJ|씨제이|대한\s*통운/i, "CJ대한통운"],
  [/한진/, "한진"],
  [/롯데/, "롯데"],
  [/경동/, "경동"],
];

/** 말에 나온 택배사 이름 지우기용 */
export const CARRIER_WORDS = /로젠|우체국|CJ|씨제이|대한\s*통운|한진|롯데|경동/gi;

/** “로젠택배로 보냈어” → 로젠 */
export function carrierOf(text: string): string | null {
  for (const [re, label] of CARRIER_RE) if (re.test(text)) return label;
  return null;
}

/** 숫자 10~14자리(사이에 - 나 띄어쓰기 가능) = 송장번호 */
const TRACK_RE = /(?<!\d)\d[\d\s-]{8,22}\d(?!\d)/g;

/** 말에서 송장번호 찾기 → 원래 글자(지울 때)와 고른 모양("123-4567-8901") */
export function findTracking(text: string): { raw: string; value: string } | null {
  for (const m of text.matchAll(TRACK_RE)) {
    const digits = m[0].replace(/\D/g, "");
    if (digits.length >= 10 && digits.length <= 14) return { raw: m[0], value: m[0].trim().replace(/\s+/g, "-") };
  }
  return null;
}

/** 입력 칸 송장번호 정리 — 숫자·- 만, 너무 짧으면 null */
export function normTracking(v: string | null | undefined): string | null {
  const s = (v ?? "").trim().replace(/\s+/g, "-").replace(/[^\d-]/g, "").slice(0, 30);
  return s.replace(/\D/g, "").length >= 8 ? s : null;
}

/** 배송 조회 링크 — 네이버 검색이 택배사·번호로 바로 조회해 줘요 (택배사마다 주소가 바뀌어도 그대로) */
export function trackingUrl(carrier: string | null, no: string): string {
  const name = carrier ? (carrier.endsWith("택배") || carrier === "CJ대한통운" ? carrier : `${carrier}택배`) : "택배";
  return `https://search.naver.com/search.naver?query=${encodeURIComponent(`${name} ${no.replace(/\D/g, "")}`)}`;
}
