/**
 * 한국어 조사 붙이기 — "1688가 1,100원로"처럼 어색하지 않게 (앱 화면·카카오 챗봇 공용).
 * 끝 글자에 받침이 있는지 봐요. 숫자는 읽는 소리로(1·7·8은 ㄹ받침), 영어는 받침 없음으로 쳐요.
 */
function batchim(word: string): "none" | "l" | "other" {
  const last = [...word.trim()].pop() ?? "";
  const digit: Record<string, "none" | "l" | "other"> = {
    "0": "other", "1": "l", "2": "none", "3": "other", "4": "none", "5": "none", "6": "other", "7": "l", "8": "l", "9": "none",
  };
  if (last in digit) return digit[last];
  const code = last.charCodeAt(0) - 0xac00;
  if (code < 0 || code > 11171) return "none";
  const jong = code % 28;
  return jong === 0 ? "none" : jong === 8 ? "l" : "other";
}

/** j("도매꾹", "을") → "도매꾹을" · j("1688", "이") → "1688이" · j("1,100원", "로") → "1,100원으로" */
export function j(word: string, kind: "을" | "은" | "이" | "로"): string {
  const b = batchim(word.replace(/[’'"」)]+$/, ""));
  const pick = {
    을: b === "none" ? "를" : "을",
    은: b === "none" ? "는" : "은",
    이: b === "none" ? "가" : "이",
    로: b === "other" ? "으로" : "로",
  }[kind];
  return `${word}${pick}`;
}
