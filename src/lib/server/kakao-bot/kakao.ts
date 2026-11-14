/**
 * 카카오 i 오픈빌더 스킬 응답(버전 2.0) 만들기 — 길이 제한을 여기서 한 번에 지켜요.
 * https://kakaobusiness.gitbook.io/main/tool/chatbot/skill_guide/answer_json_format
 *   simpleText 1000자 · textCard 제목 50자/설명 400자/버튼 3개 · listCard 항목 5개/버튼 2개
 *   carousel 카드 10장 · outputs 3개 · quickReplies 10개 · 버튼·바로가기 이름 14자
 */

export interface SkillRequest {
  intent?: { id?: string; name?: string };
  userRequest?: {
    utterance?: string;
    user?: { id?: string; type?: string; properties?: Record<string, unknown> };
    block?: { id?: string; name?: string };
    /** 블록에서 콜백을 켜면 와요 — 5분 안에 한 번, 이 주소로 답을 보내요 */
    callbackUrl?: string;
  };
  action?: { name?: string; params?: Record<string, unknown>; clientExtra?: Record<string, unknown> };
}

export type Button =
  | { label: string; action: "webLink"; webLinkUrl: string }
  | { label: string; action: "message"; messageText: string }
  | { label: string; action: "phone"; phoneNumber: string };

export interface QuickReply {
  label: string;
  action: "message";
  messageText: string;
}

export interface ListItem {
  title: string;
  description?: string;
  /** 누르면 이 말을 챗봇에 보내요 */
  messageText?: string;
  /** 누르면 이 주소를 열어요 */
  webUrl?: string;
}

type TextCard = { title?: string; description?: string; buttons?: Button[] };

export type Output =
  | { simpleText: { text: string } }
  | { textCard: TextCard }
  | {
      listCard: {
        header: { title: string };
        items: { title: string; description?: string; action?: "message"; messageText?: string; link?: { web: string } }[];
        buttons?: Button[];
      };
    }
  | { carousel: { type: "textCard"; items: TextCard[] } };

export interface SkillResponse {
  version: "2.0";
  template: { outputs: Output[]; quickReplies?: QuickReply[] };
}

/**
 * 콜백 모드의 첫 답 — 진짜 답은 나중에 callbackUrl로 보내요 (template 없이).
 * data.text를 주면 ‘기다려 주세요’ 말풍선이 하나 더 생겨요. 빼면 대기 문구 없이 답만 와요(공식 가이드: data는 쓸 때만).
 */
export interface CallbackAck {
  version: "2.0";
  useCallback: true;
  data?: { text: string };
}

export const callbackAck = (t?: string): CallbackAck =>
  t ? { version: "2.0", useCallback: true, data: { text: cut(t, 400) } } : { version: "2.0", useCallback: true };

export const cut = (s: string, n: number) => {
  const chars = [...(s ?? "")];
  return chars.length <= n ? s : `${chars.slice(0, n - 1).join("")}…`;
};

const label = (s: string) => cut(s, 14);

function fixButton(b: Button): Button {
  return { ...b, label: label(b.label) };
}

export const text = (t: string): Output => ({ simpleText: { text: cut(t, 1000) } });

export const card = (title: string, description: string, buttons: Button[] = []): Output => ({
  textCard: {
    title: cut(title, 50),
    description: cut(description, 400),
    ...(buttons.length ? { buttons: buttons.slice(0, 3).map(fixButton) } : {}),
  },
});

export const list = (header: string, items: ListItem[], buttons: Button[] = []): Output => ({
  listCard: {
    header: { title: cut(header, 40) },
    items: items.slice(0, 5).map((it) => ({
      title: cut(it.title, 36),
      ...(it.description ? { description: cut(it.description, 40) } : {}),
      ...(it.webUrl ? { link: { web: it.webUrl } } : {}),
      ...(it.messageText ? { action: "message" as const, messageText: it.messageText } : {}),
    })),
    ...(buttons.length ? { buttons: buttons.slice(0, 2).map(fixButton) } : {}),
  },
});

export const carousel = (cards: { title: string; description: string; buttons?: Button[] }[]): Output => ({
  carousel: {
    type: "textCard",
    items: cards.slice(0, 10).map((c) => ({
      title: cut(c.title, 50),
      description: cut(c.description, 400),
      ...(c.buttons?.length ? { buttons: c.buttons.slice(0, 3).map(fixButton) } : {}),
    })),
  },
});

export const link = (lbl: string, url: string): Button => ({ label: lbl, action: "webLink", webLinkUrl: url });
export const say = (lbl: string, messageText: string): Button => ({ label: lbl, action: "message", messageText });
export const call = (lbl: string, phoneNumber: string): Button => ({ label: lbl, action: "phone", phoneNumber });

/** 바로가기 버튼: 글자만 주면 그 말을 그대로 보내요. [이름, 보낼 말]로 다르게 줄 수도 있어요 */
export const quick = (...items: (string | [string, string] | false | null | undefined)[]): QuickReply[] =>
  items
    .filter((x): x is string | [string, string] => Boolean(x))
    .slice(0, 10)
    .map((x) => (typeof x === "string" ? [x, x] : x))
    .map(([l, m]) => ({ label: label(l), action: "message", messageText: m }));

export function reply(outputs: Output[], quickReplies: QuickReply[] = []): SkillResponse {
  return {
    version: "2.0",
    template: {
      outputs: outputs.slice(0, 3),
      ...(quickReplies.length ? { quickReplies: quickReplies.slice(0, 10) } : {}),
    },
  };
}
