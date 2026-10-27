"use client";

import {
  BookOpen,
  ChevronRight,
  FileSpreadsheet,
  History,
  LogOut,
  Printer,
  RefreshCw,
  Smartphone,
  Store,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Mascot } from "@/components/Mascot";
import { useAuth, useToast } from "@/components/providers";
import { ConfirmSheet, PageHeader, Sheet } from "@/components/ui";
import { APP_NAME, IS_DEMO } from "@/lib/config";
import { useRefresh } from "@/lib/queries";
import { resetDemoData } from "@/lib/store/demo-store";

const ROLE_LABEL = { admin: "관리자", staff: "직원", pending: "승인 대기" } as const;

export default function MorePage() {
  const { user, signOut } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const refresh = useRefresh();
  const [installOpen, setInstallOpen] = useState(false);
  const [reset, setReset] = useState<null | "sample" | "empty">(null);

  const items = [
    { href: "/excel", icon: FileSpreadsheet, label: "엑셀 · 빅솔론 대량등록", desc: "빅솔론 대량작업 엑셀 내보내기/가져오기, 백업" },
    { href: "/labels", icon: Printer, label: "바코드 라벨 · 가격표 인쇄", desc: "바코드 없는 상품에 붙일 라벨 만들기" },
    { href: "/print-station", icon: Printer, label: "인쇄 스테이션 (노트북)", desc: "폰에서 보낸 라벨을 노트북이 자동으로 인쇄" },
    { href: "/suppliers", icon: Store, label: "구매처 관리", desc: "소품 산 곳 모아보기" },
    { href: "/history", icon: History, label: "입고 · 출고 기록", desc: "언제 무엇이 들어오고 나갔는지" },
    ...(user?.role === "admin"
      ? [{ href: "/members", icon: Users, label: "직원 계정 관리", desc: "알바생·가족 계정 만들기, 권한 바꾸기" }]
      : []),
    { href: "/guide", icon: BookOpen, label: "빅솔론 · 히엘페이 연동 안내", desc: "어디까지 연결되는지, 업체 문의 방법" },
  ];

  return (
    <div>
      <PageHeader title="더보기" />
      <div className="space-y-4">
        <section className="card flex items-center gap-3 p-4">
          <Mascot mood="wink" size={60} />
          <div className="min-w-0 flex-1">
            <p className="truncate font-cute text-xl">{user?.display_name}</p>
            <p className="text-sm text-ink-soft">
              @{user?.username} · {user ? ROLE_LABEL[user.role] : ""}
              {IS_DEMO && " · 체험 모드"}
            </p>
          </div>
        </section>

        <ul className="card divide-y-2 divide-line overflow-hidden">
          {items.map((it) => (
            <li key={it.href}>
              <Link href={it.href} className="flex items-center gap-3 px-4 py-3.5 active:bg-cream">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-berry-50 text-berry-600">
                  <it.icon size={20} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-cute text-[16px]">{it.label}</span>
                  <span className="block truncate text-xs text-ink-soft">{it.desc}</span>
                </span>
                <ChevronRight size={18} className="text-ink-faint" />
              </Link>
            </li>
          ))}
          <li>
            <button type="button" onClick={() => setInstallOpen(true)} className="flex w-full items-center gap-3 px-4 py-3.5 text-left active:bg-cream">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-soda-100 text-soda-700">
                <Smartphone size={20} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-cute text-[16px]">폰 홈 화면에 앱처럼 설치</span>
                <span className="block truncate text-xs text-ink-soft">아이콘 누르면 바로 열려요</span>
              </span>
              <ChevronRight size={18} className="text-ink-faint" />
            </button>
          </li>
        </ul>

        {IS_DEMO && (
          <section className="card space-y-2 p-4">
            <p className="font-cute text-lg">체험 데이터</p>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" className="btn-soft btn-sm" onClick={() => setReset("sample")}>
                <RefreshCw size={16} /> 샘플로 되돌리기
              </button>
              <button type="button" className="btn-soft btn-sm" onClick={() => setReset("empty")}>
                모두 비우기
              </button>
            </div>
          </section>
        )}

        <button
          type="button"
          className="btn-soft w-full"
          onClick={async () => {
            await signOut();
            router.replace("/login");
          }}
        >
          <LogOut size={18} /> 로그아웃
        </button>
        <p className="text-center text-xs text-ink-faint">{APP_NAME} · 무인 소품샵 관리</p>
      </div>

      <Sheet open={installOpen} onClose={() => setInstallOpen(false)} title="홈 화면에 설치하기">
        <div className="space-y-4 text-sm">
          <div className="rounded-2xl bg-white p-4">
            <p className="font-cute text-base">🍎 아이폰 (Safari)</p>
            <ol className="mt-1 list-decimal space-y-0.5 pl-5 text-ink-soft">
              <li>Safari로 이 사이트를 열어요</li>
              <li>아래쪽 공유 버튼(□↑)을 눌러요</li>
              <li>‘홈 화면에 추가’를 눌러요</li>
            </ol>
          </div>
          <div className="rounded-2xl bg-white p-4">
            <p className="font-cute text-base">🤖 갤럭시 (Chrome / 삼성 인터넷)</p>
            <ol className="mt-1 list-decimal space-y-0.5 pl-5 text-ink-soft">
              <li>오른쪽 위 ⋮ (또는 아래 ≡) 메뉴를 눌러요</li>
              <li>‘홈 화면에 추가’ 또는 ‘앱 설치’를 눌러요</li>
            </ol>
          </div>
          <p className="text-center text-ink-soft">자동 로그인을 켜두면 아이콘만 누르면 바로 시작해요 ✨</p>
        </div>
      </Sheet>

      <ConfirmSheet
        open={reset !== null}
        onClose={() => setReset(null)}
        danger
        title={reset === "empty" ? "체험 데이터를 모두 비울까요?" : "샘플 데이터로 되돌릴까요?"}
        desc="이 기기에 저장된 체험 데이터가 바뀌어요."
        confirmText="바꾸기"
        onConfirm={async () => {
          await resetDemoData(reset === "empty");
          await refresh("products", "suppliers", "moves");
          toast("바꿨어요", "happy");
        }}
      />
    </div>
  );
}
