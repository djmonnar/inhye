"use client";

import { ChevronRight, FileSpreadsheet, PackagePlus, Plus, Printer, ScanBarcode, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";
import { Mascot } from "@/components/Mascot";
import { useAuth } from "@/components/providers";
import { Loading, ProductThumb } from "@/components/ui";
import { SHOP_NAME } from "@/lib/config";
import { needsKioskSync, num, relTime, stockLevel, won } from "@/lib/format";
import { useMoves, usePrintJobs, useProducts } from "@/lib/queries";

function greeting() {
  const h = new Date().getHours();
  if (h < 11) return "좋은 아침이에요";
  if (h < 17) return "오늘도 화이팅";
  return "오늘도 수고했어요";
}

export default function HomePage() {
  const { user } = useAuth();
  const { data: products, isLoading } = useProducts();
  const { data: moves = [] } = useMoves(undefined, 300);
  const { data: printJobs = [] } = usePrintJobs("pending");
  const printWaiting = printJobs.reduce((n, j) => n + j.copies, 0);

  const stats = useMemo(() => {
    const list = products ?? [];
    const active = list.filter((p) => p.is_active);
    const stockCost = active.reduce((n, p) => n + Math.max(p.stock_qty, 0) * p.cost_price, 0);
    const stockValue = active.reduce((n, p) => n + Math.max(p.stock_qty, 0) * p.sale_price, 0);
    const priced = active.filter((p) => p.sale_price > 0 && p.cost_price > 0);
    const avgMargin = priced.length
      ? priced.reduce((n, p) => n + (p.sale_price - p.cost_price) / p.sale_price, 0) / priced.length
      : 0;
    const out = active.filter((p) => stockLevel(p) === "out").length;
    const low = active.filter((p) => stockLevel(p) === "low").length;
    const kiosk = list.filter(needsKioskSync).length;

    const cats = new Map<string, number>();
    for (const p of active) cats.set(p.category, (cats.get(p.category) ?? 0) + 1);
    const catList = [...cats.entries()].sort((a, b) => b[1] - a[1]);
    const top = catList.slice(0, 6);
    const rest = catList.slice(6).reduce((n, [, c]) => n + c, 0);
    if (rest) top.push(["기타 묶음", rest]);

    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const monthIn = moves.filter((m) => m.kind === "in" && m.qty > 0 && new Date(m.created_at) >= monthStart);
    const monthInAmount = monthIn.reduce((n, m) => n + (m.unit_cost ?? 0) * m.qty, 0);
    const monthInQty = monthIn.reduce((n, m) => n + m.qty, 0);

    return { total: list.length, active: active.length, stockCost, stockValue, avgMargin, out, low, kiosk, cats: top, monthInAmount, monthInQty };
  }, [products, moves]);

  const recent = (products ?? []).slice(0, 10);
  const names = useMemo(() => new Map((products ?? []).map((p) => [p.id, p.name])), [products]);

  if (isLoading) return <Loading />;

  const maxCat = Math.max(1, ...stats.cats.map(([, c]) => c));

  return (
    <div className="space-y-4" style={{ paddingTop: "calc(env(safe-area-inset-top) + 0.75rem)" }}>
      {/* 인사 */}
      <section className="flex items-center gap-3 pt-1">
        <Mascot mood={stats.out > 0 ? "wow" : "happy"} size={72} className="animate-float" />
        <div className="min-w-0">
          <p className="text-sm text-ink-soft">{SHOP_NAME}</p>
          <h1 className="font-cute text-2xl leading-tight">
            {greeting()}, <span className="text-berry-600">{user?.display_name}</span>님!
          </h1>
        </div>
      </section>

      {/* 빠른 실행 */}
      <section className="grid grid-cols-4 gap-2">
        {[
          { href: "/products/new", label: "상품 등록", icon: Plus, tone: "bg-berry-100 text-berry-600" },
          { href: "/scan", label: "스캔", icon: ScanBarcode, tone: "bg-soda-100 text-soda-700" },
          { href: "/reorder", label: "발주", icon: PackagePlus, tone: "bg-butter-100 text-butter-700" },
          { href: "/excel", label: "빅솔론", icon: FileSpreadsheet, tone: "bg-matcha-100 text-matcha-700" },
        ].map((a) => (
          <Link key={a.href} href={a.href} className="card flex flex-col items-center gap-1 py-3 active:scale-95">
            <span className={`flex h-11 w-11 items-center justify-center rounded-2xl ${a.tone}`}>
              <a.icon size={22} />
            </span>
            <span className="font-cute text-[13px]">{a.label}</span>
          </Link>
        ))}
      </section>

      {/* 알림 */}
      {(stats.out > 0 || stats.low > 0) && (
        <Link href="/reorder" className="card flex items-center gap-3 border-butter-300 bg-butter-100 p-4">
          <TriangleAlert className="shrink-0 text-butter-700" />
          <div className="flex-1">
            <p className="font-cute text-lg">채워야 할 상품이 있어요</p>
            <p className="text-sm text-ink-soft">
              품절 {stats.out}개 · 품절 임박 {stats.low}개
            </p>
          </div>
          <ChevronRight className="text-ink-soft" />
        </Link>
      )}
      {printWaiting > 0 && (
        <Link href="/print-station" className="card flex items-center gap-3 border-berry-200 bg-berry-50 p-4">
          <Printer className="shrink-0 text-berry-600" />
          <div className="flex-1">
            <p className="font-cute text-lg">라벨 인쇄 대기 {printWaiting}장</p>
            <p className="text-sm text-ink-soft">노트북 인쇄 스테이션에서 뽑아요</p>
          </div>
          <ChevronRight className="text-ink-soft" />
        </Link>
      )}
      {stats.kiosk > 0 && (
        <Link href="/excel" className="card flex items-center gap-3 border-soda-300 bg-soda-100 p-4">
          <FileSpreadsheet className="shrink-0 text-soda-700" />
          <div className="flex-1">
            <p className="font-cute text-lg">빅솔론에 반영할 상품 {stats.kiosk}개</p>
            <p className="text-sm text-ink-soft">새로 등록·수정한 상품을 대량등록 엑셀로 내보내세요</p>
          </div>
          <ChevronRight className="text-ink-soft" />
        </Link>
      )}

      {/* 숫자 */}
      <section className="grid grid-cols-2 gap-2.5">
        <Stat label="판매 중인 상품" value={`${num(stats.active)}개`} sub={`전체 ${num(stats.total)}개`} />
        <Stat label="평균 마진율" value={`${(stats.avgMargin * 100).toFixed(0)}%`} sub="원가·판매가 입력된 상품" />
        <Stat label="재고 원가 합계" value={won(stats.stockCost)} sub="지금 매장에 깔린 돈" />
        <Stat label="다 팔면 매출" value={won(stats.stockValue)} sub={`예상 이익 ${won(stats.stockValue - stats.stockCost)}`} />
        <Stat
          label="이번 달 입고"
          value={won(stats.monthInAmount)}
          sub={`${num(stats.monthInQty)}개 들어옴`}
          className="col-span-2"
        />
      </section>

      {/* 카테고리 */}
      {stats.cats.length > 0 && (
        <section className="card p-4">
          <p className="mb-3 font-cute text-lg">카테고리별 상품 수</p>
          <ul className="space-y-2.5">
            {stats.cats.map(([cat, count]) => (
              <li key={cat}>
                <Link
                  href={cat === "기타 묶음" ? "/products" : `/products?cat=${encodeURIComponent(cat)}`}
                  className="grid grid-cols-[5.5rem_1fr_2.5rem] items-center gap-2 text-sm"
                  title={`${cat}: ${count}개`}
                >
                  <span className="truncate text-ink-soft">{cat}</span>
                  <span className="h-3 rounded-full bg-cream-deep">
                    <span
                      className="block h-3 rounded-full bg-berry-300"
                      style={{ width: `${Math.max(4, (count / maxCat) * 100)}%` }}
                    />
                  </span>
                  <span className="text-right font-semibold tabular-nums">{count}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* 최근 등록 */}
      {recent.length > 0 && (
        <section>
          <div className="mb-2 flex items-center justify-between">
            <p className="font-cute text-lg">최근 등록한 상품</p>
            <Link href="/products" className="text-sm text-berry-600">
              전체 보기
            </Link>
          </div>
          <div className="no-scrollbar -mx-4 flex gap-2.5 overflow-x-auto px-4 pb-1">
            {recent.map((p) => (
              <Link key={p.id} href={`/products/${p.id}`} className="card w-28 shrink-0 overflow-hidden">
                <ProductThumb product={p} className="aspect-square w-full" frame="border-b-2" />
                <div className="p-2">
                  <p className="truncate text-xs font-semibold">{p.name}</p>
                  <p className="font-cute text-sm tabular-nums">{won(p.sale_price)}</p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* 최근 기록 */}
      {moves.length > 0 && (
        <section className="card p-4">
          <div className="mb-1 flex items-center justify-between">
            <p className="font-cute text-lg">최근 입고·출고</p>
            <Link href="/history" className="text-sm text-berry-600">
              전체 기록
            </Link>
          </div>
          <ul className="divide-y-2 divide-dashed divide-line">
            {moves.slice(0, 5).map((m) => (
              <li key={m.id} className="flex items-center gap-2 py-2 text-sm">
                <span className="min-w-0 flex-1 truncate">{names.get(m.product_id) ?? "삭제된 상품"}</span>
                <span className={`font-cute tabular-nums ${m.qty > 0 ? "text-matcha-700" : "text-berry-600"}`}>
                  {m.qty > 0 ? "+" : ""}
                  {num(m.qty)}
                </span>
                <span className="w-14 text-right text-xs text-ink-faint">{relTime(m.created_at)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {stats.total === 0 && (
        <Link href="/products/new" className="card flex items-center gap-3 bg-berry-50 p-4">
          <Mascot mood="wink" size={56} />
          <div className="flex-1">
            <p className="font-cute text-lg">첫 상품을 등록해 볼까요?</p>
            <p className="text-sm text-ink-soft">빅솔론 엑셀이 있다면 ‘더보기 → 엑셀’에서 한 번에 가져올 수 있어요</p>
          </div>
        </Link>
      )}
    </div>
  );
}

function Stat({ label, value, sub, className = "" }: { label: string; value: string; sub?: string; className?: string }) {
  return (
    <div className={`card p-3.5 ${className}`}>
      <p className="text-xs text-ink-soft">{label}</p>
      <p className="mt-0.5 font-cute text-[22px] leading-tight tabular-nums">{value}</p>
      {sub && <p className="mt-0.5 truncate text-[11px] text-ink-faint">{sub}</p>}
    </div>
  );
}
