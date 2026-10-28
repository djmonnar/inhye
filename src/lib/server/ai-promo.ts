import { SHOP_NAME } from "../config";
import { won } from "../format";
import type { PromoDraft, PromoRequest } from "../types";
import { askJson, clip, clipList, hashtag, objectSchema, STRING, STRINGS } from "./openai";

const INSTRUCTIONS = `You write social posts for ${SHOP_NAME}, a small unmanned gift & accessories shop (무인 소품샵) in Korea.
Write three Korean posts about ONE product for different channels.

Rules for all
- Warm, cute 소품샵 tone. Natural Korean, not translated-sounding. No exaggeration.
- Use only the facts given (name, category, price, tags, description, the owner's focus, the photo). Never invent materials, discounts, events, stock counts, opening hours or location.
- Mention the price exactly as given when it is provided; otherwise don't mention price.
- If the owner gave a focus (e.g. 오늘 입고, 1+1), make it the hook.

instagram.text: 3–6 short lines, a few emoji, line breaks, ends with a soft call to visit. No hashtags inside text.
instagram.hashtags: 8–15 Korean or common English tags without "#", including 소품샵 and 무인소품샵, plus item/character/color/season words.
daangn.title: 당근 비즈프로필 소식 title, under 30 characters, friendly neighbor tone.
daangn.text: 3–5 sentences, neighbor tone (동네 이웃에게), no hashtags, at most 2 emoji.
kakao.text: 카카오톡 채널 message under 250 characters, short lines, 1–3 emoji, ends with an invitation to stop by.`;

const SCHEMA = objectSchema({
  instagram: objectSchema({ text: STRING, hashtags: STRINGS }),
  daangn: objectSchema({ title: STRING, text: STRING }),
  kakao: objectSchema({ text: STRING }),
});

export async function writePromo(p: PromoRequest, image: string): Promise<PromoDraft> {
  const facts = [
    `상품명: ${p.name}`,
    `카테고리: ${p.category}`,
    p.sale_price > 0 ? `판매가: ${won(p.sale_price)}` : "판매가: (적지 않음)",
    p.tags.length ? `태그: ${p.tags.join(", ")}` : "",
    p.description ? `설명: ${p.description}` : "",
    p.focus ? `사장님이 강조하고 싶은 점: ${p.focus}` : "",
  ]
    .filter(Boolean)
    .join("\n");
  const raw = await askJson<{
    instagram?: { text?: unknown; hashtags?: unknown };
    daangn?: { title?: unknown; text?: unknown };
    kakao?: { text?: unknown };
  }>({
    label: "promo",
    instructions: INSTRUCTIONS,
    content: [
      { type: "input_text", text: facts },
      ...(image ? [{ type: "input_image" as const, image_url: image, detail: "low" as const }] : []),
    ],
    schema: SCHEMA,
    maxOutputTokens: 3000,
  });
  return {
    instagram: {
      text: clip(raw.instagram?.text, 1500),
      hashtags: clipList(raw.instagram?.hashtags, 20, 30, hashtag),
    },
    daangn: { title: clip(raw.daangn?.title, 60), text: clip(raw.daangn?.text, 1500) },
    kakao: { text: clip(raw.kakao?.text, 600) },
  };
}
