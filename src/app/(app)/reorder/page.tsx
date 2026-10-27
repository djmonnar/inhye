"use client";

import { Copy, ExternalLink, Globe, PackagePlus, Share2 } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { OrderTabs } from "@/components/OrderTabs";
import { useToast } from "@/components/providers";
import { StockSheet } from "@/components/StockSheet";
import { EmptyState, Loading, PageHeader, ProductThumb } from "@/components/ui";
import { ensureUrl, num, stockLevel, won } from "@/lib/format";
import { useProducts, useSupplierMap } from "@/lib/queries";
import type { Product, Supplier } from "@/lib/types";

const suggestQty = (p: Product) => Math.max(p.safety_stock * 2 - p.stock_qty, p.safety_stock || 1, 1);

export default function ReorderPage() {
  const toast = useToast();
  const { data: products, isLoading } = useProducts();
  const suppliers = useSupplierMap();
  const [qty, setQty] = useState<Record<string, number>>({});
  const [skip, setSkip] = useState<Record<string, boolean>>({});
  const [receive, setReceive] = useState<Product | null>(null);

  const groups = useMemo(() => {
    const need = (products ?? []).filter((p) => p.is_active && stockLevel(p) !== "ok");
    const map = new Map<string, { supplier?: Supplier; items: Product[] }>();
    for (const p of need) {
      const key = p.supplier_id && suppliers.has(p.supplier_id) ? p.supplier_id : "none";
      const g = map.get(key) ?? { supplier: suppliers.get(key), items: [] };
      g.items.push(p);
      map.set(key, g);
    }
    for (const g of map.values()) g.items.sort((a, b) => a.stock_qty - b.stock_qty);
    return [...map.values()].sort((a, b) => (a.supplier ? 0 : 1) - (b.supplier ? 0 : 1) || b.items.length - a.items.length);
  }, [products, suppliers]);

  const q = (p: Product) => qty[p.id] ?? suggestQty(p);

  function listText(g: { supplier?: Supplier; items: Product[] }) {
    const today = new Date();
    const lines = g.items
      .filter((p) => !skip[p.id])
      .map((p) => {
        const name = p.supplier_sku || p.name;
        return `· ${name} × ${q(p)}${p.purchase_url ? `\n  ${ensureUrl(p.purchase_url)}` : ""}`;
      });
    return `[${g.supplier?.name ?? "구매처 미지정"}] 주문 목록 (${today.getMonth() + 1}/${today.getDate()})\n${lines.join("\n")}`;
  }

  async function share(text: string) {
    if (navigator.share) {
      try {
        await navigator.share({ text });
        return;
      } catch {
        /* cancelled → fall back to copy */
      }
    }
    try {
      await navigator.clipboard.writeText(text);
      toast("목록을 복사했어요. 카톡에 붙여넣으세요!", "wink");
    } catch {
      toast("복사하지 못했어요", "sad");
    }
  }

  const total = groups.reduce((n, g) => n + g.items.length, 0);

  return (
    <div>
      <PageHeader title="발주" sub={total ? `채워야 할 상품 ${total}개` : undefined} />
      <OrderTabs />
      {isLoading ? (
        <Loading />
      ) : total === 0 ? (
        <EmptyState
          mood="wow"
          title="모든 재고가 넉넉해요!"
          desc="상품의 ‘품절 알림 기준’ 개수 이하가 되면 여기에 모여요"
        />
      ) : (
        <div className="space-y-4">
          {groups.map((g) => {
            const cost = g.items.filter((p) => !skip[p.id]).reduce((n, p) => n + p.cost_price * q(p), 0);
            const text = listText(g);
            return (
              <section key={g.supplier?.id ?? "none"} className="card overflow-hidden">
                <div className="flex items-center gap-2 border-b-2 border-line bg-berry-50 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    {g.supplier ? (
                      <Link href={`/suppliers/${g.supplier.id}`} className="font-cute text-lg">
                        {g.supplier.name}
                      </Link>
                    ) : (
                      <p className="font-cute text-lg text-ink-soft">구매처 미지정</p>
                    )}
                    {g.supplier?.order_note && <p className="truncate text-xs text-ink-soft">{g.supplier.order_note}</p>}
                  </div>
                  {g.supplier?.website && (
                    <a href={ensureUrl(g.supplier.website)} target="_blank" rel="noreferrer" className="btn-soft btn-sm px-2.5" aria-label="구매처 사이트">
                      <Globe size={16} />
                    </a>
                  )}
                  <button type="button" className="btn-soft btn-sm" onClick={() => share(text)}>
                    {typeof navigator !== "undefined" && "share" in navigator ? <Share2 size={16} /> : <Copy size={16} />} 목록
                  </button>
                </div>
                <ul className="divide-y-2 divide-dashed divide-line">
                  {g.items.map((p) => (
                    <li key={p.id} className={`flex items-center gap-3 px-3 py-2.5 ${skip[p.id] ? "opacity-40" : ""}`}>
                      <input
                        type="checkbox"
                        className="h-5 w-5 accent-berry-500"
                        checked={!skip[p.id]}
                        onChange={(e) => setSkip((s) => ({ ...s, [p.id]: !e.target.checked }))}
                        aria-label={`${p.name} 주문에 포함`}
                      />
                      <Link href={`/products/${p.id}`}>
                        <ProductThumb product={p} className="h-12 w-12" frame="rounded-xl border-2" />
                      </Link>
                      <div className="min-w-0 flex-1">
                        <p className="line-clamp-2 text-sm font-semibold leading-snug">{p.name}</p>
                        <p className="text-xs text-ink-soft">
                          재고 <b className={p.stock_qty <= 0 ? "text-danger" : "text-butter-700"}>{num(p.stock_qty)}</b> / 기준{" "}
                          {num(p.safety_stock)}
                        </p>
                      </div>
                      <input
                        className="input w-16 px-2 py-1.5 text-center text-sm tabular-nums"
                        inputMode="numeric"
                        aria-label={`${p.name} 주문 수량`}
                        value={q(p)}
                        onChange={(e) => setQty((s) => ({ ...s, [p.id]: Number(e.target.value.replace(/\D/g, "")) || 0 }))}
                      />
                      {p.purchase_url ? (
                        <a href={ensureUrl(p.purchase_url)} target="_blank" rel="noreferrer" className="p-1.5 text-berry-500" aria-label="주문 페이지 열기">
                          <ExternalLink size={20} />
                        </a>
                      ) : (
                        <span className="w-8" />
                      )}
                      <button type="button" className="p-1.5 text-matcha-700" aria-label="입고 처리" onClick={() => setReceive(p)}>
                        <PackagePlus size={20} />
                      </button>
                    </li>
                  ))}
                </ul>
                {cost > 0 && (
                  <p className="border-t-2 border-line px-4 py-2 text-right text-sm text-ink-soft">
                    예상 주문 금액 <b className="text-ink">{won(cost)}</b>
                  </p>
                )}
              </section>
            );
          })}
          <p className="text-center text-xs text-ink-faint">
            주문한 물건이 도착하면 <PackagePlus size={12} className="inline" /> 버튼으로 입고 처리하세요
          </p>
        </div>
      )}
      {receive && (
        <StockSheet product={receive} open onClose={() => setReceive(null)} initialMode="in" initialQty={q(receive)} />
      )}
    </div>
  );
}
