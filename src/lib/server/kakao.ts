import { createHmac, timingSafeEqual } from "node:crypto";
import { adminClient, serverSecret } from "./admin";

/**
 * 카카오톡 ‘나에게 보내기’(나와의 채팅방) 알림.
 * 카카오 디벨로퍼스 앱의 REST API 키로 사장님 카카오 계정을 한 번 연결하면(talk_message 동의),
 * 서버가 토큰을 DB(kakao_tokens, 서비스 키만)에 두고 매일 아침 알림을 보내요. 토큰은 알아서 갱신해요.
 *
 * 환경변수 (Vercel, 서버 전용):
 *   KAKAO_REST_API_KEY   카카오 디벨로퍼스 → 내 애플리케이션 → 앱 키 → REST API 키
 *   KAKAO_CLIENT_SECRET  (선택) 보안 → Client Secret 을 ‘사용함’으로 했다면
 *   KAKAO_REDIRECT_URI   (선택) 기본 https://<사이트>/api/kakao/callback
 *   CRON_SECRET          매일 알림(Vercel Cron)이 우리 서버를 부를 때 쓰는 비밀 문자열
 */

const env = (n: string) => (process.env[n] ?? "").trim();
export const kakaoConfigured = () => Boolean(env("KAKAO_REST_API_KEY"));
export const cronReady = () => Boolean(env("CRON_SECRET"));

export class KakaoError extends Error {}

/** 알림 버튼이 열 앱 주소 */
export function appUrl(fallbackOrigin?: string) {
  const prod = env("VERCEL_PROJECT_PRODUCTION_URL");
  return env("APP_URL") || (prod ? `https://${prod}` : fallbackOrigin || "https://inhye.vercel.app");
}

const redirectUri = (origin: string) => env("KAKAO_REDIRECT_URI") || `${origin}/api/kakao/callback`;

// --- 연결 (OAuth) -----------------------------------------------------------

function sign(payload: string) {
  const secret = serverSecret();
  if (!secret) throw new KakaoError("서버 키가 없어 카카오 연결을 시작할 수 없어요.");
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function authorizeUrl(origin: string, userId: string) {
  if (!kakaoConfigured()) throw new KakaoError("Vercel 환경변수에 KAKAO_REST_API_KEY를 먼저 넣어 주세요.");
  const payload = `${userId}.${Date.now()}`;
  const q = new URLSearchParams({
    client_id: env("KAKAO_REST_API_KEY"),
    redirect_uri: redirectUri(origin),
    response_type: "code",
    scope: "talk_message",
    state: `${payload}.${sign(payload)}`,
  });
  return `https://kauth.kakao.com/oauth/authorize?${q}`;
}

/** state 서명이 맞고 10분 안이면 연결한 사람 id */
export function verifyState(state: string | null): string | null {
  if (!state) return null;
  const parts = state.split(".");
  if (parts.length !== 3) return null;
  const [uid, ts, sig] = parts;
  const expected = sign(`${uid}.${ts}`);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  if (!(Date.now() - Number(ts) < 10 * 60_000)) return null;
  return uid;
}

type TokenResponse = {
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
  refresh_token_expires_in?: number;
  error?: string;
  error_description?: string;
  error_code?: string;
};

async function tokenRequest(params: Record<string, string>): Promise<TokenResponse> {
  const secret = env("KAKAO_CLIENT_SECRET");
  const body = new URLSearchParams({ client_id: env("KAKAO_REST_API_KEY"), ...params, ...(secret ? { client_secret: secret } : {}) });
  const res = await fetch("https://kauth.kakao.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded;charset=utf-8" },
    body,
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as TokenResponse;
  if (!res.ok || !json.access_token) {
    throw new KakaoError(
      `카카오 토큰을 받지 못했어요 (${json.error_code ?? json.error ?? res.status}). ${json.error_description ?? ""}`.trim(),
    );
  }
  return json;
}

const inSeconds = (s: number | undefined) => (s ? new Date(Date.now() + s * 1000).toISOString() : null);

export async function exchangeCode(code: string, origin: string, userId: string) {
  const t = await tokenRequest({ grant_type: "authorization_code", redirect_uri: redirectUri(origin), code });
  const { error } = await adminClient()
    .from("kakao_tokens")
    .upsert({
      id: 1,
      access_token: t.access_token,
      refresh_token: t.refresh_token ?? "",
      access_expires_at: inSeconds(t.expires_in) ?? new Date(Date.now() + 3600_000).toISOString(),
      refresh_expires_at: inSeconds(t.refresh_token_expires_in),
      connected_by: userId,
      updated_at: new Date().toISOString(),
    });
  if (error) throw new KakaoError(`토큰을 저장하지 못했어요: ${error.message}`);
}

type TokenRow = {
  access_token: string;
  refresh_token: string;
  access_expires_at: string;
  refresh_expires_at: string | null;
  last_brief_on: string | null;
};

export async function loadTokens(): Promise<TokenRow | null> {
  const { data, error } = await adminClient().from("kakao_tokens").select("*").eq("id", 1).maybeSingle();
  if (error) return null;
  return (data as TokenRow | null) ?? null;
}

/** 쓸 수 있는 access token (곧 끝나면 갱신해서 저장) */
async function accessToken(): Promise<string> {
  const row = await loadTokens();
  if (!row) throw new KakaoError("카카오톡이 아직 연결되지 않았어요. 주문 화면에서 ‘카카오톡 연결’을 눌러 주세요.");
  if (Date.parse(row.access_expires_at) - Date.now() > 5 * 60_000) return row.access_token;
  const t = await tokenRequest({ grant_type: "refresh_token", refresh_token: row.refresh_token });
  const patch: Record<string, unknown> = {
    access_token: t.access_token,
    access_expires_at: inSeconds(t.expires_in) ?? new Date(Date.now() + 3600_000).toISOString(),
    updated_at: new Date().toISOString(),
  };
  // 갱신 토큰은 만료가 한 달 안 남았을 때만 새로 와요
  if (t.refresh_token) {
    patch.refresh_token = t.refresh_token;
    patch.refresh_expires_at = inSeconds(t.refresh_token_expires_in);
  }
  await adminClient().from("kakao_tokens").update(patch).eq("id", 1);
  return t.access_token as string;
}

/** 나와의 채팅방으로 글 보내기 (200자까지) */
export async function sendMemo(text: string, link: string) {
  const token = await accessToken();
  const template = {
    object_type: "text",
    text: text.slice(0, 200),
    link: { web_url: link, mobile_web_url: link },
    button_title: "주문 보기",
  };
  const res = await fetch("https://kapi.kakao.com/v2/api/talk/memo/default/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/x-www-form-urlencoded;charset=utf-8",
    },
    body: new URLSearchParams({ template_object: JSON.stringify(template) }),
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as { result_code?: number; code?: number; msg?: string };
  if (!res.ok || json.result_code !== 0) {
    if (json.code === -402) throw new KakaoError("카카오톡 메시지 보내기 동의가 없어요. ‘카카오톡 연결’을 다시 해 주세요.");
    if (json.code === -401) throw new KakaoError("카카오 연결이 끊겼어요. ‘카카오톡 연결’을 다시 해 주세요.");
    throw new KakaoError(`카카오톡으로 보내지 못했어요 (${json.code ?? res.status}: ${json.msg ?? ""})`);
  }
}

export async function markBriefSent(day: string) {
  await adminClient().from("kakao_tokens").update({ last_brief_on: day }).eq("id", 1);
}
