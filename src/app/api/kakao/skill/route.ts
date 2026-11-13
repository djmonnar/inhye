import { timingSafeEqual } from "node:crypto";
import { hasServiceKey } from "@/lib/server/admin";
import { appUrl } from "@/lib/server/kakao";
import { handleSkill } from "@/lib/server/kakao-bot/bot";
import { reply, text, type SkillRequest } from "@/lib/server/kakao-bot/kakao";
import { supabaseBotDb } from "@/lib/server/kakao-bot/supabase-db";

export const dynamic = "force-dynamic";

/**
 * 카카오 i 오픈빌더 스킬 서버. 오픈빌더 → 스킬 → URL에 https://<사이트>/api/kakao/skill,
 * 헤더값에 X-Popo-Key = (Vercel 환경변수 KAKAO_SKILL_SECRET 과 같은 값)을 넣어요.
 * 카카오는 5초 안에 답을 못 받으면 오류를 보여주니, 4.3초가 넘으면 ‘다시 보내 달라’고 먼저 답해요.
 */
const HEADER = "x-popo-key";
const LIMIT_MS = 4300;

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
  const work = handleSkill(body, { db: supabaseBotDb(), appUrl: appUrl(origin) });
  const slow = new Promise<"slow">((resolve) => setTimeout(() => resolve("slow"), LIMIT_MS));
  try {
    const res = await Promise.race([work, slow]);
    if (res === "slow") {
      // 늦게 끝나도 저장은 마무리돼요. 화면에는 다시 보내 달라고만 해요.
      work.catch(() => undefined);
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
