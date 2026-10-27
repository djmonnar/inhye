"use client";

import { ClipboardList, Ellipsis, House, Package, ScanBarcode } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { Mascot } from "@/components/Mascot";
import { useAuth } from "@/components/providers";
import { IS_DEMO } from "@/lib/config";
import { useWedgeScanner } from "@/lib/useWedgeScanner";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, signOut } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  // USB 스캐너로 아무 화면에서나 찍으면 바로 그 상품을 찾아줘요 (입력 화면 제외).
  const wedgeOn = !!user && !pathname.startsWith("/scan") && !/\/(new|edit)$/.test(pathname);
  useWedgeScanner((code) => router.push(`/scan?code=${encodeURIComponent(code)}`), wedgeOn);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  if (loading || !user) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Mascot mood="happy" size={88} className="animate-float" />
      </div>
    );
  }

  if (user.role === "pending") {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
        <Mascot mood="sleep" size={120} className="animate-float" />
        <h1 className="mt-3 font-cute text-2xl">승인을 기다리고 있어요</h1>
        <p className="mt-2 text-ink-soft">
          관리자가 <b>{user.username}</b> 계정을 승인하면 사용할 수 있어요.
        </p>
        <button type="button" className="btn-soft mt-6" onClick={() => void signOut()}>
          다른 아이디로 로그인
        </button>
      </main>
    );
  }

  return (
    <div className="pb-nav mx-auto min-h-dvh max-w-3xl px-4">
      {IS_DEMO && (
        <Link
          href="/setup"
          className="-mx-4 block bg-butter-100 px-4 py-1.5 text-center text-xs text-butter-700"
          style={{ paddingTop: "calc(env(safe-area-inset-top) + 0.375rem)" }}
        >
          🧪 체험 모드 · 이 기기에만 저장돼요 <u>Supabase 연결하기</u>
        </Link>
      )}
      {children}
      <BottomNav />
    </div>
  );
}

const TABS = [
  { href: "/", label: "홈", icon: House, match: (p: string) => p === "/" },
  { href: "/products", label: "상품", icon: Package, match: (p: string) => p.startsWith("/products") },
  { href: "/scan", label: "스캔", icon: ScanBarcode, match: (p: string) => p.startsWith("/scan") },
  {
    href: "/reorder",
    label: "발주",
    icon: ClipboardList,
    match: (p: string) => p.startsWith("/reorder") || p.startsWith("/suppliers"),
  },
  { href: "/more", label: "더보기", icon: Ellipsis, match: (p: string) => !["/", "/products", "/scan", "/reorder", "/suppliers"].some((x) => (x === "/" ? p === "/" : p.startsWith(x))) },
];

function BottomNav() {
  const pathname = usePathname();
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 mx-auto max-w-3xl px-3"
      style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 0.5rem)" }}
      aria-label="메인 메뉴"
    >
      <div className="card flex items-end justify-around px-2 pb-1.5 pt-1 shadow-soft">
        {TABS.map((t) => {
          const on = t.match(pathname);
          const Icon = t.icon;
          if (t.href === "/scan") {
            return (
              <Link key={t.href} href={t.href} className="-mt-7 flex flex-col items-center" aria-label="바코드 스캔">
                <span
                  className={`flex h-16 w-16 items-center justify-center rounded-full border-[3px] border-white text-white transition active:scale-95 ${
                    on ? "bg-berry-600" : "bg-berry-500"
                  }`}
                  style={{ boxShadow: "0 4px 0 0 #d95f82, 0 10px 20px -8px rgb(217 95 130 / 0.6)" }}
                >
                  <Icon size={30} strokeWidth={2.2} />
                </span>
                <span className="mt-0.5 font-cute text-xs text-berry-600">{t.label}</span>
              </Link>
            );
          }
          return (
            <Link
              key={t.href}
              href={t.href}
              className={`flex min-w-14 flex-col items-center gap-0.5 rounded-2xl px-2 py-1.5 transition ${
                on ? "text-berry-600" : "text-ink-faint"
              }`}
              aria-current={on ? "page" : undefined}
            >
              <Icon size={24} strokeWidth={on ? 2.4 : 2} />
              <span className="font-cute text-xs">{t.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
