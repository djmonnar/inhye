"use client";

import { Eye, EyeOff } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Mascot } from "@/components/Mascot";
import { useAuth } from "@/components/providers";
import { Toggle } from "@/components/ui";
import { APP_NAME, IS_DEMO } from "@/lib/config";
import { store } from "@/lib/store";
import { getRemember } from "@/lib/supabase";

export default function LoginPage() {
  const router = useRouter();
  const { user, loading, refresh } = useAuth();
  const [id, setId] = useState("");
  const [pw, setPw] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read device preference once mounted
    setRemember(getRemember());
    try {
      const last = localStorage.getItem("mongsil.lastId");
      if (last) setId(last);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (!loading && user) router.replace("/");
  }, [loading, user, router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!id.trim() || (!IS_DEMO && !pw)) {
      setError("아이디와 비밀번호를 입력해 주세요.");
      return;
    }
    setBusy(true);
    try {
      await store().signIn(id, pw, remember);
      try {
        localStorage.setItem("mongsil.lastId", id.trim());
      } catch {
        /* ignore */
      }
      await refresh();
      router.replace("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "로그인에 실패했어요.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="dotted-bg flex min-h-dvh flex-col items-center justify-center px-5 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-5 flex flex-col items-center text-center">
          <div className="relative">
            <Mascot mood="happy" size={124} className="animate-float" />
            <span className="absolute -right-3 top-2 rotate-12 rounded-full bg-butter-300 px-2 py-0.5 font-cute text-xs shadow-pop">
              안녕!
            </span>
          </div>
          <h1 className="mt-2 font-cute text-4xl text-berry-600">{APP_NAME}</h1>
          <p className="mt-1 text-sm text-ink-soft">우리 소품샵 상품 · 구매처 · 재고를 한 곳에</p>
        </div>

        <form onSubmit={submit} className="card space-y-4 p-5">
          <div>
            <label htmlFor="login-id" className="label">
              아이디
            </label>
            <input
              id="login-id"
              className="input"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              placeholder={IS_DEMO ? "아무거나 입력해도 돼요" : "아이디"}
              value={id}
              onChange={(e) => setId(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="login-pw" className="label">
              비밀번호
            </label>
            <div className="relative">
              <input
                id="login-pw"
                className="input pr-12"
                type={showPw ? "text" : "password"}
                autoComplete="current-password"
                placeholder={IS_DEMO ? "체험 모드는 비워도 돼요" : "비밀번호"}
                value={pw}
                onChange={(e) => setPw(e.target.value)}
              />
              <button
                type="button"
                className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-ink-soft"
                aria-label={showPw ? "비밀번호 숨기기" : "비밀번호 보기"}
                onClick={() => setShowPw((v) => !v)}
              >
                {showPw ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
          </div>
          <Toggle
            checked={remember}
            onChange={setRemember}
            label="자동 로그인"
            desc="이 기기에서는 다음부터 바로 들어가요"
          />
          {error && (
            <p className="rounded-2xl bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">
              {error}
            </p>
          )}
          <button type="submit" className="btn-primary w-full text-lg" disabled={busy}>
            {busy ? "들어가는 중..." : "로그인"}
          </button>
        </form>

        {IS_DEMO ? (
          <div className="mt-4 rounded-3xl border-2 border-dashed border-berry-200 bg-white/70 p-4 text-sm text-ink-soft">
            <p className="font-cute text-base text-berry-600">지금은 체험 모드예요</p>
            <p className="mt-1">
              데이터가 이 기기 브라우저에만 저장돼요. 여러 기기에서 같이 쓰려면 Supabase를 연결해 주세요.
            </p>
            <Link href="/setup" className="mt-2 inline-block font-semibold text-berry-600 underline">
              연결 방법 보기 →
            </Link>
          </div>
        ) : (
          <p className="mt-4 text-center text-sm text-ink-soft">
            처음 설치하셨나요?{" "}
            <Link href="/setup" className="font-semibold text-berry-600 underline">
              관리자 계정 만들기
            </Link>
          </p>
        )}
      </div>
    </main>
  );
}
