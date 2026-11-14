import { timingSafeEqual } from "node:crypto";
import { after } from "next/server";
import { hasServiceKey } from "@/lib/server/admin";
import { appUrl } from "@/lib/server/kakao";
import { makeBotAi } from "@/lib/server/kakao-bot/ai";
import { handleSkill, type BotContext } from "@/lib/server/kakao-bot/bot";
import { callbackAck, reply, text, type SkillRequest, type SkillResponse } from "@/lib/server/kakao-bot/kakao";
import { supabaseBotDb } from "@/lib/server/kakao-bot/supabase-db";

export const dynamic = "force-dynamic";
// 답을 보낸 뒤에도 주문 정리(AI)를 끝까지 마무리하고, 콜백이면 카카오에 보내요
export const maxDuration = 60;

/**
 * 카카오 i 오픈빌더 스킬 서버. 오픈빌더 → 스킬 → URL에 https://<사이트>/api/kakao/skill,
 * 헤더값에 X-Popo-Key = (Vercel 환경변수 KAKAO_SKILL_SECRET 과 같은 값)을 넣어요.
 *
 * - 콜백을 안 켠 블록: 카카오는 5초 안에 답을 못 받으면 오류를 보여주니, 4.3초가 넘으면 ‘다시 보내 달라’고 먼저 답해요.
 *   주문 비서는 정해진 모양이면 AI 없이 바로, AI가 3.8초 안에 못 끝나면 ‘결과 보기’(bot.ts).
 * - 콜백을 켠 블록(요청에 userRequest.callbackUrl): 카카오는 **매번** useCallback:true 답을 기대해요
 *   (일반 답을 주면 ‘스킬 서버 연결 오류’ — 2026-11-14 확인). 그래서 바로 ‘잠깐만요’로 답하고,
 *   진짜 답은 넉넉한 마감(40초)으로 만든 뒤 콜백 주소로 보내요(주소는 1분 안에 한 번만 쓸 수 있어요).
 */
const HEADER = "x-popo-key";
const LIMIT_MS = 4300;
/** 콜백일 때 답을 만드는 마감 — 콜백 주소 유효 시간(1분) 안에 보내기까지 넉넉히 */
const CALLBACK_WORK_MS = 40_000;

/**
 * 카카오가 준 콜백 주소 (https만). 이 요청은 X-Popo-Key 비밀값으로 카카오 것임을 이미 확인했어요.
 * 주소의 도메인은 카카오가 바꿀 수 있어서 따로 막지 않고 기록만 남겨요.
 */
function kakaoCallbackUrl(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw) return null;
  try {
    const u = new URL(raw);
    if (u.protocol === "https:") {
      console.info("[kakao skill] callback host:", u.hostname);
      return u.toString();
    }
  } catch {
    /* 이상한 주소는 무시 */
  }
  console.warn("[kakao skill] callback url ignored (not https)");
  return null;
}

async function sendCallback(url: string, res: SkillResponse) {
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(res),
      signal: AbortSignal.timeout(10_000),
    });
    if (!r.ok) console.error("[kakao skill] callback failed", r.status);
  } catch (e) {
    console.error("[kakao skill] callback error", e);
  }
}

function sameSecret(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export async function POST(req: Request) {
  const secret = (process.env.KAKAO_SKILL_SECRET ?? "").trim();
  if (!secret) {
    return Response.json(
      reply([text("챗봇 서버 설정이 아직 안 됐어요. Vercel 환경변수에 KAKAO_SKILL_SECRET을 넣고 다시 배포해 주세요.")]),
    );
  }
  if (!sameSecret((req.headers.get(HEADER) ?? "").trim(), secret)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!hasServiceKey()) {
    return Response.json(reply([text("서버에 Supabase 서비스 키가 없어요. Vercel 환경변수를 확인해 주세요.")]));
  }

  let body: SkillRequest;
  try {
    body = (await req.json()) as SkillRequest;
  } catch {
    return Response.json({ error: "bad request" }, { status: 400 });
  }

  const origin = new URL(req.url).origin;
  const callbackUrl = kakaoCallbackUrl(body.userRequest?.callbackUrl);
  const ctx: BotContext = {
    db: supabaseBotDb(),
    appUrl: appUrl(origin),
    ai: makeBotAi(),
    deadline: Date.now() + (callbackUrl ? CALLBACK_WORK_MS : 3800),
    defer: (job) =>
      after(async () => {
        await job.catch((e) => console.error("[kakao skill] deferred", e));
      }),
  };

  if (callbackUrl) {
    after(async () => {
      let res: SkillResponse;
      try {
        res = await handleSkill(body, ctx);
      } catch (e) {
        console.error("[kakao skill]", e);
        const msg = e instanceof Error ? e.message : "";
        res = reply([text(`문제가 생겼어요 😢 ${msg.slice(0, 200)}\n잠시 뒤에 다시 해 보거나 ‘취소’를 보내 주세요.`)]);
      }
      await sendCallback(callbackUrl, res);
    });
    return Response.json(callbackAck("잠깐만요 ⏳"));
  }

  const work = handleSkill(body, ctx);
  const slow = new Promise<"slow">((resolve) => setTimeout(() => resolve("slow"), LIMIT_MS));
  try {
    const res = await Promise.race([work, slow]);
    if (res === "slow") {
      // 늦게 끝나도 저장은 마무리돼요(after가 함수를 끝까지 살려 둬요). 화면에는 다시 보내 달라고만 해요.
      after(async () => {
        await work.catch(() => undefined);
      });
      return Response.json(reply([text("조금 오래 걸리고 있어요 ⏳ 잠시 뒤에 같은 말을 한 번 더 보내 주세요.")]));
    }
    return Response.json(res);
  } catch (e) {
    console.error("[kakao skill]", e);
    const msg = e instanceof Error ? e.message : "";
    return Response.json(reply([text(`문제가 생겼어요 😢 ${msg.slice(0, 200)}\n잠시 뒤에 다시 해 보거나 ‘취소’를 보내 주세요.`)]));
  }
}

/** 연결 확인용 (데이터는 안 보여줘요) */
export async function GET() {
  return Response.json({ ok: true, ready: Boolean((process.env.KAKAO_SKILL_SECRET ?? "").trim()) && hasServiceKey() });
}
