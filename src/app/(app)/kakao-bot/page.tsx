"use client";

import { CheckCircle2, Copy, KeyRound, Link2Off, MessageCircle, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { useAuth, useToast } from "@/components/providers";
import { ConfirmSheet, Loading, PageHeader } from "@/components/ui";
import { relTime } from "@/lib/format";
import { useKakaoBot, useRefresh } from "@/lib/queries";
import { store } from "@/lib/store";

const ROLE_LABEL = { admin: "관리자", staff: "직원", pending: "승인 대기" } as const;

const EXAMPLES = [
  ["거래처 목록", "자주 쓰는 곳부터 거래처 보기"],
  ["거래처 등록", "이름 → 종류 → 사이트 … 차례로 물어봐요"],
  ["거래처 도매꾹", "연락처·주문 조건 + 전화·사이트 버튼"],
  ["거래처 상품 도매꾹", "거기서 사는 상품, 가격, 더 싼 곳"],
  ["상품 곰돌이 / 바코드", "재고, 거래처별 가격, 다시 주문"],
  ["가격 기록 곰돌이", "거래처마다 개당 가격 적기"],
  ["발주 목록", "품절·품절 임박을 거래처별로"],
  ["오늘 매출", "빅솔론 오늘 판매"],
] as const;

export default function KakaoBotPage() {
  const toast = useToast();
  const refresh = useRefresh();
  const { user } = useAuth();
  const { data, isLoading, error } = useKakaoBot();
  const [code, setCode] = useState<{ code: string; expires_at: string } | null>(null);
  const [left, setLeft] = useState(0);
  const [busy, setBusy] = useState(false);
  const [unlink, setUnlink] = useState<string | null>(null);

  useEffect(() => {
    if (!code) return;
    const tick = () => setLeft(Math.max(0, Math.round((new Date(code.expires_at).getTime() - Date.now()) / 1000)));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [code]);

  async function getCode() {
    setBusy(true);
    try {
      setCode(await store().kakaoBotCode());
    } catch (e) {
      toast(e instanceof Error ? e.message : "코드를 받지 못했어요", "sad");
    } finally {
      setBusy(false);
    }
  }

  async function copy(v: string, what: string) {
    try {
      await navigator.clipboard.writeText(v);
      toast(`${what} 복사했어요`, "wink");
    } catch {
      toast("복사하지 못했어요", "sad");
    }
  }

  if (isLoading) return <Loading />;

  return (
    <div>
      <PageHeader back="/more" title="카카오 챗봇" sub="카톡으로 거래처 · 발주 · 재고 · 매출 보기" />
      <div className="space-y-4">
        {data?.demo && (
          <p className="card p-4 text-sm text-ink-soft">체험 모드에서는 챗봇을 연결할 수 없어요. Supabase를 먼저 연결해 주세요.</p>
        )}
        {error && <p className="card p-4 text-sm text-danger">{error instanceof Error ? error.message : "불러오지 못했어요"}</p>}

        {/* 내 연결 */}
        <section className="card space-y-3 p-4">
          <p className="font-cute text-lg">💬 내 카톡 연결하기</p>
          <ol className="list-decimal space-y-1 pl-5 text-sm text-ink-soft">
            <li>아래 ‘연결 코드 받기’를 눌러요</li>
            <li>카카오톡 포포하우스 관리 채널 대화방에서</li>
            <li>
              <b className="text-ink">연결 123456</b>처럼 코드를 보내면 끝 (10분 안에)
            </li>
          </ol>
          {code && left > 0 ? (
            <button
              type="button"
              className="flex w-full flex-col items-center gap-1 rounded-2xl bg-butter-100 py-4"
              onClick={() => copy(`연결 ${code.code}`, "‘연결 코드’를")}
            >
              <span className="font-cute text-4xl tracking-[0.3em] tabular-nums">{code.code}</span>
              <span className="text-xs text-ink-soft">
                {Math.floor(left / 60)}분 {left % 60}초 남았어요 · 누르면 ‘연결 {code.code}’ 복사
              </span>
            </button>
          ) : (
            <button type="button" className="btn-primary w-full" disabled={busy || data?.demo} onClick={getCode}>
              <KeyRound size={18} /> {code ? "새 연결 코드 받기" : "연결 코드 받기"}
            </button>
          )}
          <p className="text-xs text-ink-faint">챗봇은 이 계정 권한 그대로예요. 거래처 삭제는 관리자만 할 수 있어요.</p>
        </section>

        {/* 연결된 사람 */}
        <section className="card p-4">
          <p className="mb-2 font-cute text-lg">🔗 연결된 카톡 {data?.links.length ? `${data.links.length}명` : ""}</p>
          {!data?.links.length ? (
            <p className="py-2 text-sm text-ink-soft">아직 연결된 카톡이 없어요.</p>
          ) : (
            <ul className="divide-y-2 divide-dashed divide-line">
              {data.links.map((l) => (
                <li key={l.key} className="flex items-center gap-2 py-2.5 text-sm">
                  <MessageCircle size={16} className="text-butter-700" />
                  <span className="font-semibold">{l.name}</span>
                  <span className="badge bg-cream text-ink-soft">{ROLE_LABEL[l.role]}</span>
                  {l.mine && <span className="badge bg-berry-50 text-berry-600">나</span>}
                  <span className="ml-auto text-xs text-ink-faint">{l.last_seen_at ? `${relTime(l.last_seen_at)} 사용` : `${relTime(l.linked_at)} 연결`}</span>
                  {(l.mine || user?.role === "admin") && (
                    <button type="button" className="btn-soft btn-sm px-2" aria-label="연결 끊기" onClick={() => setUnlink(l.key)}>
                      <Link2Off size={14} />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* 할 수 있는 말 */}
        <section className="card p-4">
          <p className="mb-2 font-cute text-lg">🐾 이렇게 말해 보세요</p>
          <ul className="space-y-1.5 text-sm">
            {EXAMPLES.map(([say, what]) => (
              <li key={say} className="flex gap-2">
                <b className="shrink-0">{say}</b>
                <span className="text-ink-soft">{what}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* 관리자: 오픈빌더 설정 */}
        {user?.role === "admin" && data && !data.demo && (
          <section className="card space-y-3 p-4 text-sm">
            <p className="font-cute text-lg">🛠️ 챗봇 설정 (관리자, 한 번만)</p>
            <p className="flex items-center gap-1.5">
              {data.secretConfigured ? (
                <CheckCircle2 size={16} className="text-matcha-700" />
              ) : (
                <XCircle size={16} className="text-danger" />
              )}
              Vercel 환경변수 <code className="font-mono">KAKAO_SKILL_SECRET</code>
              {data.secretConfigured ? " 있음" : " 없음 — 넣고 다시 배포해 주세요"}
            </p>
            <ol className="list-decimal space-y-2 pl-5 text-ink-soft">
              <li>
                챗봇 관리자센터 → <b className="text-ink">스킬 → 스킬 목록 → 생성</b>
                <button
                  type="button"
                  className="mt-1 flex w-full items-center gap-2 rounded-xl bg-cream p-2 text-left text-ink"
                  onClick={() => copy(data.skillUrl, "스킬 주소를")}
                >
                  <span className="min-w-0 flex-1 break-all font-mono text-xs">{data.skillUrl}</span>
                  <Copy size={14} className="shrink-0 text-ink-faint" />
                </button>
                URL과 Test URL에 이 주소, 헤더값에 Key <code className="font-mono text-ink">X-Popo-Key</code> · Value는
                KAKAO_SKILL_SECRET과 같은 값. ‘기본 스킬로 설정’ 체크 → 저장
              </li>
              <li>
                <b className="text-ink">시나리오 → 기본 시나리오</b>의 <b className="text-ink">폴백 블록</b>과{" "}
                <b className="text-ink">웰컴 블록</b>: 파라미터 설정에서 스킬 선택 → 봇 응답을 ‘스킬데이터 사용’ → 저장
              </li>
              <li>
                <b className="text-ink">배포</b> → 배포하기, <b className="text-ink">설정 → 카카오톡 채널 연결</b>에서 포포하우스 채널 연결
              </li>
              <li>봇테스트에서 ‘메뉴’를 보내 보면 연결 안내가 나와요 → 위에서 받은 코드로 연결</li>
            </ol>
          </section>
        )}
      </div>

      <ConfirmSheet
        open={unlink !== null}
        onClose={() => setUnlink(null)}
        danger
        title="연결을 끊을까요?"
        desc="그 카톡에서는 다시 코드를 받아 연결하기 전까지 챗봇을 못 써요."
        confirmText="끊기"
        onConfirm={async () => {
          if (!unlink) return;
          try {
            await store().kakaoBotUnlink(unlink);
            await refresh("kakao-bot");
            toast("연결을 끊었어요", "sad");
          } catch (e) {
            toast(e instanceof Error ? e.message : "끊지 못했어요", "sad");
          }
        }}
      />
    </div>
  );
}
