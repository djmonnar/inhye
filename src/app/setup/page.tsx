"use client";

import { Check, Copy, ExternalLink, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Mascot } from "@/components/Mascot";
import { useAuth } from "@/components/providers";
import { Field } from "@/components/ui";
import { APP_NAME, IS_DEMO, LOGIN_DOMAIN, SUPABASE_REF } from "@/lib/config";
import { store } from "@/lib/store";
import { supabase, USERNAME_RE } from "@/lib/supabase";

type Status = { schema: boolean; hasAdmin: boolean } | null;

function Step({ n, title, done, children }: { n: number; title: string; done?: boolean; children: ReactNode }) {
  return (
    <section className="card p-4">
      <div className="mb-3 flex items-center gap-2">
        <span
          className={`flex h-8 w-8 items-center justify-center rounded-full font-cute ${
            done ? "bg-matcha-500 text-white" : "bg-berry-100 text-berry-600"
          }`}
        >
          {done ? <Check size={18} /> : n}
        </span>
        <h2 className="font-cute text-lg">{title}</h2>
      </div>
      <div className="space-y-3 text-sm leading-relaxed">{children}</div>
    </section>
  );
}

export default function SetupPage() {
  const router = useRouter();
  const { refresh } = useAuth();
  const [status, setStatus] = useState<Status>(null);
  const [checking, setChecking] = useState(!IS_DEMO);
  const [sql, setSql] = useState("");
  const [copied, setCopied] = useState(false);
  const [f, setF] = useState({ username: "", password: "", display_name: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const check = useCallback(async () => {
    if (IS_DEMO) return;
    setChecking(true);
    const { data, error } = await supabase().rpc("app_status");
    setStatus(error ? { schema: false, hasAdmin: false } : { schema: true, hasAdmin: Boolean((data as { has_admin?: boolean })?.has_admin) });
    setChecking(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial status probe
    void check();
    fetch("/schema.sql")
      .then((r) => r.text())
      .then(setSql)
      .catch(() => {});
  }, [check]);

  async function copySql() {
    await navigator.clipboard.writeText(sql);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function createAdmin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const username = f.username.trim().toLowerCase();
    if (!USERNAME_RE.test(username)) return setError("아이디는 영어 소문자·숫자로 3~32자예요 (. _ - 사용 가능).");
    if (f.password.length < 6) return setError("비밀번호는 6자 이상이에요.");
    setBusy(true);
    try {
      const res = await fetch("/api/setup/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...f, username }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error || "계정을 만들지 못했어요.");
      await store().signIn(username, f.password, true);
      await refresh();
      router.replace("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "계정을 만들지 못했어요.");
    } finally {
      setBusy(false);
    }
  }

  const sqlEditor = SUPABASE_REF ? `https://supabase.com/dashboard/project/${SUPABASE_REF}/sql/new` : "https://supabase.com/dashboard";

  return (
    <main className="dotted-bg min-h-dvh px-4 py-8">
      <div className="mx-auto max-w-lg space-y-4">
        <div className="flex items-center gap-3">
          <Mascot mood="wow" size={72} />
          <div>
            <h1 className="font-cute text-3xl text-berry-600">{APP_NAME} 설정</h1>
            <p className="text-sm text-ink-soft">처음 한 번만 하면 돼요</p>
          </div>
        </div>

        <Step n={1} title="Supabase 연결 (데이터 저장소)" done={!IS_DEMO}>
          {IS_DEMO ? (
            <>
              <p>
                지금은 <b>체험 모드</b>라 이 기기에만 저장돼요. 폰·PC 여러 대에서 같이 쓰려면 무료 Supabase를 연결해요.
              </p>
              <div className="rounded-2xl bg-cream p-3">
                <p className="font-cute">가장 쉬운 방법 (Vercel에서 클릭 몇 번)</p>
                <ol className="mt-1 list-decimal space-y-0.5 pl-5 text-ink-soft">
                  <li>Vercel 대시보드 → 이 프로젝트 → <b>Storage</b> 탭</li>
                  <li>
                    <b>Supabase</b> → Create → 지역은 <b>Seoul</b> 선택
                  </li>
                  <li>프로젝트에 연결(Connect)하면 환경변수가 자동으로 들어가요</li>
                  <li>
                    <b>Deployments → Redeploy</b> 한 번 누르기
                  </li>
                </ol>
              </div>
              <div className="rounded-2xl bg-cream p-3">
                <p className="font-cute">직접 넣는 방법</p>
                <p className="mt-1 text-ink-soft">
                  supabase.com → 새 프로젝트 → Project Settings → API 에서 값을 복사해 Vercel → Settings → Environment
                  Variables에 넣고 Redeploy:
                </p>
                <pre className="mt-2 overflow-x-auto rounded-xl bg-white p-2 text-xs">
{`NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY`}
                </pre>
              </div>
              <Link href="/login" className="btn-soft w-full">
                일단 체험 모드로 둘러보기
              </Link>
            </>
          ) : (
            <p className="text-ink-soft">연결됐어요! ✨</p>
          )}
        </Step>

        {!IS_DEMO && (
          <>
            <Step n={2} title="DB 만들기 (SQL 한 번 실행)" done={status?.schema}>
              {status?.schema ? (
                <p className="text-ink-soft">테이블이 준비됐어요. 앱을 업데이트할 때 SQL이 바뀌면 다시 실행해도 안전해요.</p>
              ) : (
                <>
                  <ol className="list-decimal space-y-0.5 pl-5 text-ink-soft">
                    <li>아래 ‘SQL 복사’를 눌러요</li>
                    <li>‘SQL 편집기 열기’ → 빈 칸에 붙여넣기 → 오른쪽 아래 <b>Run</b></li>
                    <li>‘Success’가 뜨면 ‘다시 확인’을 눌러요</li>
                  </ol>
                </>
              )}
              <div className="grid grid-cols-2 gap-2">
                <button type="button" className="btn-primary btn-sm" onClick={copySql} disabled={!sql}>
                  {copied ? <Check size={16} /> : <Copy size={16} />} {copied ? "복사됨" : "SQL 복사"}
                </button>
                <a href={sqlEditor} target="_blank" rel="noreferrer" className="btn-soft btn-sm">
                  <ExternalLink size={16} /> SQL 편집기 열기
                </a>
              </div>
              <button type="button" className="btn-ghost btn-sm w-full" onClick={() => void check()} disabled={checking}>
                <RefreshCw size={16} className={checking ? "animate-spin" : ""} /> 다시 확인
              </button>
            </Step>

            <Step n={3} title="관리자 계정 만들기" done={status?.hasAdmin}>
              {status?.hasAdmin ? (
                <>
                  <p className="text-ink-soft">관리자 계정이 있어요. 설정 끝! 🎉</p>
                  <Link href="/login" className="btn-primary w-full">
                    로그인하러 가기
                  </Link>
                </>
              ) : !status?.schema ? (
                <p className="text-ink-soft">2단계를 먼저 끝내 주세요.</p>
              ) : (
                <>
                  <form onSubmit={createAdmin} className="space-y-3">
                    <Field label="이름">
                      {(id) => (
                        <input id={id} className="input" placeholder="예: 사장님" value={f.display_name} onChange={(e) => setF({ ...f, display_name: e.target.value })} />
                      )}
                    </Field>
                    <Field label="관리자 아이디" hint="영어 소문자·숫자 3~32자">
                      {(id) => (
                        <input
                          id={id}
                          className="input"
                          autoCapitalize="none"
                          autoCorrect="off"
                          autoComplete="username"
                          value={f.username}
                          onChange={(e) => setF({ ...f, username: e.target.value })}
                        />
                      )}
                    </Field>
                    <Field label="비밀번호" hint="6자 이상">
                      {(id) => (
                        <input
                          id={id}
                          className="input"
                          type="password"
                          autoComplete="new-password"
                          value={f.password}
                          onChange={(e) => setF({ ...f, password: e.target.value })}
                        />
                      )}
                    </Field>
                    {error && <p className="rounded-2xl bg-danger/10 p-3 text-danger">{error}</p>}
                    <button type="submit" className="btn-primary w-full" disabled={busy}>
                      {busy ? "만드는 중..." : "관리자 계정 만들고 시작하기"}
                    </button>
                  </form>
                  <details className="rounded-2xl bg-cream p-3 text-ink-soft">
                    <summary className="cursor-pointer font-cute text-ink">버튼이 안 되면? (직접 만들기)</summary>
                    <p className="mt-2">
                      Supabase 대시보드 → Authentication → Users → <b>Add user</b> → 이메일에{" "}
                      <code className="rounded bg-white px-1">아이디@{LOGIN_DOMAIN}</code>, 비밀번호 입력, <b>Auto Confirm User</b> 체크.
                      처음 만든 계정은 자동으로 관리자가 돼요. 로그인할 때는 아이디만 넣으면 돼요.
                    </p>
                  </details>
                </>
              )}
            </Step>
          </>
        )}
      </div>
    </main>
  );
}
