"use client";

import { LayoutGrid, List, Plus, ScanBarcode, Search, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { EmptyState, Loading, PageHeader, ProductThumb, StockBadge } from "@/components/ui";
import { margin, needsKioskSync, searchText, stockLevel, won } from "@/lib/format";
import { useCategories, useProducts, useSupplierMap } from "@/lib/queries";
import type { Product } from "@/lib/types";

type Status = "all" | "low" | "kiosk" | "inactive" | "nosupplier" | "nophoto";
type Sort = "new" | "name" | "stock" | "margin" | "price";

const STATUS: { value: Status; label: string }[] = [
  { value: "all", label: "전체" },
  { value: "low", label: "⚠️ 품절·임박" },
  { value: "kiosk", label: "🖥️ 키오스크 미반영" },
  { value: "nosupplier", label: "구매처 없음" },
  { value: "nophoto", label: "사진 없음" },
  { value: "inactive", label: "판매 중지" },
];

function ProductsList() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { data: products, isLoading } = useProducts();
  const suppliers = useSupplierMap();
  const categories = useCategories();

  const [q, setQ] = useState(params.get("q") ?? "");
  const status = (params.get("status") as Status) || "all";
  const category = params.get("cat") ?? "";
  const supplierId = params.get("sup") ?? "";
  const sort = (params.get("sort") as Sort) || "new";
  const [view, setView] = useState<"list" | "grid">("list");

  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- restore per-device preference after mount
      if (localStorage.getItem("mongsil.view") === "grid") setView("grid");
    } catch {
      /* ignore */
    }
  }, []);

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  }

  useEffect(() => {
    const t = setTimeout(() => {
      if ((params.get("q") ?? "") !== q) setParam("q", q);
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const filtered = useMemo(() => {
    const needle = searchText(q);
    let list = (products ?? []).filter((p) => {
      if (category && p.category !== category) return false;
      if (supplierId && p.supplier_id !== supplierId) return false;
      if (status === "low" && (!p.is_active || stockLevel(p) === "ok")) return false;
      if (status === "kiosk" && !needsKioskSync(p)) return false;
      if (status === "inactive" && p.is_active) return false;
      if (status === "nosupplier" && p.supplier_id) return false;
      if (status === "nophoto" && p.image_path) return false;
      if (!needle) return true;
      const sup = p.supplier_id ? suppliers.get(p.supplier_id)?.name : "";
      return searchText(
        p.name, p.barcode, p.category, sup, p.supplier_sku, p.memo, p.tags.join(" "), p.name_en, p.kiosk_code,
      ).includes(needle);
    });
    const by: Record<Sort, (a: Product, b: Product) => number> = {
      new: (a, b) => b.created_at.localeCompare(a.created_at),
      name: (a, b) => a.name.localeCompare(b.name, "ko"),
      stock: (a, b) => a.stock_qty - b.stock_qty,
      margin: (a, b) => margin(b.cost_price, b.sale_price).rate - margin(a.cost_price, a.sale_price).rate,
      price: (a, b) => b.sale_price - a.sale_price,
    };
    list = [...list].sort(by[sort]);
    return list;
  }, [products, q, category, supplierId, status, sort, suppliers]);

  const supplierList = useMemo(() => [...suppliers.values()].sort((a, b) => a.name.localeCompare(b.name, "ko")), [suppliers]);

  return (
    <div>
      <PageHeader
        title="상품"
        sub={products ? `${filtered.length} / ${products.length}개` : undefined}
        right={
          <button
            type="button"
            className="btn-soft btn-sm px-2.5"
            aria-label={view === "list" ? "사진으로 보기" : "목록으로 보기"}
            onClick={() => {
              const next = view === "list" ? "grid" : "list";
              setView(next);
              try {
                localStorage.setItem("mongsil.view", next);
              } catch {
                /* ignore */
              }
            }}
          >
            {view === "list" ? <LayoutGrid size={18} /> : <List size={18} />}
          </button>
        }
      />

      <div className="sticky z-20 -mx-4 space-y-2 bg-cream/95 px-4 pb-2 backdrop-blur-md" style={{ top: "calc(env(safe-area-inset-top) + 3.6rem)" }}>
        <div className="relative">
          <Search size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-faint" />
          <input
            className="input pl-10 pr-20"
            type="search"
            placeholder="이름, 바코드, 구매처, 태그로 찾기"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <div className="absolute right-1.5 top-1/2 flex -translate-y-1/2 items-center">
            {q && (
              <button type="button" className="p-2 text-ink-faint" aria-label="검색어 지우기" onClick={() => setQ("")}>
                <X size={18} />
              </button>
            )}
            <Link href="/scan" className="p-2 text-berry-500" aria-label="바코드로 찾기">
              <ScanBarcode size={22} />
            </Link>
          </div>
        </div>
        <div className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4">
          {STATUS.map((s) => (
            <button
              type="button"
              key={s.value}
              className="chip"
              data-on={status === s.value}
              onClick={() => setParam("status", s.value === "all" ? "" : s.value)}
            >
              {s.label}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <select className="input py-1.5 text-sm" value={category} onChange={(e) => setParam("cat", e.target.value)} aria-label="카테고리">
            <option value="">모든 카테고리</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <select className="input py-1.5 text-sm" value={supplierId} onChange={(e) => setParam("sup", e.target.value)} aria-label="구매처">
            <option value="">모든 구매처</option>
            {supplierList.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <select className="input py-1.5 text-sm" value={sort} onChange={(e) => setParam("sort", e.target.value)} aria-label="정렬">
            <option value="new">최신순</option>
            <option value="name">이름순</option>
            <option value="stock">재고 적은순</option>
            <option value="margin">마진 높은순</option>
            <option value="price">가격 높은순</option>
          </select>
        </div>
      </div>

      {isLoading ? (
        <Loading />
      ) : filtered.length === 0 ? (
        products?.length ? (
          <EmptyState mood="sad" title="찾는 상품이 없어요" desc="검색어나 필터를 바꿔 보세요" />
        ) : (
          <EmptyState
            mood="wow"
            title="첫 상품을 등록해 볼까요?"
            desc="사진 찍고, 가격 넣고, 산 곳만 고르면 끝!"
            action={
              <Link href="/products/new" className="btn-primary">
                <Plus size={18} /> 상품 등록
              </Link>
            }
          />
        )
      ) : view === "list" ? (
        <ul className="mt-2 space-y-2">
          {filtered.map((p) => (
            <li key={p.id}>
              <Link href={`/products/${p.id}`} className="card flex items-center gap-3 p-2.5 pr-3 transition active:scale-[0.99]">
                <ProductThumb product={p} />
                <div className="min-w-0 flex-1">
                  <p className={`truncate font-semibold ${p.is_active ? "" : "text-ink-faint line-through"}`}>{p.name}</p>
                  <p className="truncate text-xs text-ink-soft">
                    {p.category}
                    {p.supplier_id && suppliers.get(p.supplier_id) ? ` · ${suppliers.get(p.supplier_id)?.name}` : ""}
                  </p>
                  <div className="mt-1 flex items-center gap-1">
                    <StockBadge product={p} />
                    {needsKioskSync(p) && <span className="badge bg-soda-100 text-soda-700">키오스크</span>}
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-cute text-lg tabular-nums">{won(p.sale_price)}</p>
                  {p.cost_price > 0 && (
                    <p className="text-xs text-matcha-700 tabular-nums">
                      마진 {margin(p.cost_price, p.sale_price).rate.toFixed(0)}%
                    </p>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <ul className="mt-2 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          {filtered.map((p) => (
            <li key={p.id}>
              <Link href={`/products/${p.id}`} className="card block overflow-hidden transition active:scale-[0.98]">
                <ProductThumb product={p} className="aspect-square w-full" frame="border-b-2" />
                <div className="p-2.5">
                  <p className="truncate text-sm font-semibold">{p.name}</p>
                  <div className="mt-1 flex items-center justify-between gap-1">
                    <span className="font-cute tabular-nums">{won(p.sale_price)}</span>
                    <StockBadge product={p} />
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <Link
        href="/products/new"
        className="btn-primary fixed z-30 h-14 rounded-full px-5 text-base"
        style={{ bottom: "calc(env(safe-area-inset-bottom) + 6.5rem)", right: "max(1rem, calc(50vw - 24rem + 1rem))" }}
      >
        <Plus size={22} /> 상품 등록
      </Link>
    </div>
  );
}

export default function ProductsPage() {
  return (
    <Suspense fallback={<Loading />}>
      <ProductsList />
    </Suspense>
  );
}
