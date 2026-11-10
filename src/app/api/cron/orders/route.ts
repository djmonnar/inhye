import { adminClient, json } from "@/lib/server/admin";
import { appUrl, cronReady, kakaoConfigured, kstHourNow, loadBriefHour, loadTokens, markBriefSent, sendMemo } from "@/lib/server/kakao";
import { buildBrief, kstDate } from "@/lib/server/orders";
import type { Order } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * Vercel이 매시 정각쯤 불러요(vercel.json crons 24개 — 무료 플랜 규칙대로 각각 하루 한 번).
 * 사장님이 고른 한국 시각(app_settings.brief_hour)이 되면 그날 한 번만 보내요. 그 시간에 못 보냈으면 다음 시간에 다시 시도.
 * CRON_SECRET이 맞아야만 동작해요. 택배는 D-7부터, 픽업은 오늘·내일 주문을 카카오톡 ‘나에게 보내기’로 알려요.
 */
export async function GET(req: Request) {
  if (!cronReady() || req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return json({ error: "unauthorized" }, 401);
  }
  if (!kakaoConfigured()) return json({ skipped: "kakao not configured" });
  const tokens = await loadTokens();
  if (!tokens) return json({ skipped: "kakao not connected" });
  const today = kstDate();
  if (tokens.last_brief_on === today) return json({ skipped: "already sent today" });
  const hour = await loadBriefHour();
  if (kstHourNow() < hour) return json({ skipped: `waiting for ${hour}:00 KST` });

  const { data, error } = await adminClient().from("orders").select("*").eq("status", "open");
  if (error) return json({ error: error.message }, 500);
  const text = buildBrief((data ?? []) as Order[], today);
  if (!text) return json({ skipped: "nothing to remind" });
  try {
    await sendMemo(text, `${appUrl()}/orders`);
    await markBriefSent(today);
    return json({ sent: true });
  } catch (e) {
    console.error("[cron/orders]", e);
    return json({ error: e instanceof Error ? e.message : "send failed" }, 502);
  }
}
