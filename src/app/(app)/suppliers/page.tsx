"use client";

import { Plus, Search, Star } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { OrderTabs } from "@/components/OrderTabs";
import { KIND_LABEL, KIND_STYLE, SupplierSheet } from "@/components/SupplierSheet";
import { EmptyState, Loading, PageHeader } from "@/components/ui";
import { hostOf, searchText, stockLevel } from "@/lib/format";
import { useProducts, useSuppliers } from "@/lib/queries";

export default function SuppliersPage() {
  const { data: suppliers, isLoading } = useSuppliers();
  const { data: products = [] } = useProducts();
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false);

  const stats = useMemo(() => {
    const m = new Map<string, { count: number; low: number }>();
    for (const p of products) {
      if (!p.supplier_id) continue;
      const s = m.get(p.supplier_id) ?? { count: 0, low: 0 };
      s.count++;
      if (p.is_active && stockLevel(p) !== "ok") s.low++;
      m.set(p.supplier_id, s);
    }
    return m;
  }, [products]);

  const list = useMemo(() => {
    const needle = searchText(q);
    return (suppliers ?? [])
      .filter((s) => !needle || searchText(s.name, s.website, s.contact, s.memo).includes(needle))
      .sort((a, b) => Number(b.favorite) - Number(a.favorite) || (stats.get(b.id)?.count ?? 0) - (stats.get(a.id)?.count ?? 0));
  }, [suppliers, q, stats]);

  return (
    <div>
      <PageHeader
        title="구매처"
        sub={suppliers ? `${suppliers.length}곳` : undefined}
        right={
          <button type="button" className="btn-primary btn-sm" onClick={() => setAdding(true)}>
            <Plus size={16} /> 추가
          </button>
        }
      />
      <OrderTabs />
      <div className="relative mb-3">
        <Search size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-faint" />
        <input className="input pl-10" type="search" placeholder="구매처 찾기" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {isLoading ? (
        <Loading />
      ) : list.length === 0 ? (
        <EmptyState
          mood="wow"
          title={q ? "찾는 구매처가 없어요" : "소품 산 곳을 모아둬요"}
          desc="도매 사이트, 시장 가게, 해외 직구까지! 다음에 다시 찾을 필요 없어요"
          action={
            <button type="button" className="btn-primary" onClick={() => setAdding(true)}>
              <Plus size={18} /> 구매처 추가
            </button>
          }
        />
      ) : (
        <ul className="space-y-2">
          {list.map((s) => {
            const st = stats.get(s.id);
            return (
              <li key={s.id}>
                <Link href={`/suppliers/${s.id}`} className="card flex items-center gap-3 p-3.5 active:scale-[0.99]">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-berry-50 font-cute text-xl text-berry-600">
                    {s.name.slice(0, 1)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1 truncate font-cute text-lg">
                      {s.favorite && <Star size={14} className="shrink-0 fill-butter-300 text-butter-500" />}
                      {s.name}
                    </p>
                    <p className="truncate text-xs text-ink-soft">
                      <span className={`badge mr-1 ${KIND_STYLE[s.kind]}`}>{KIND_LABEL[s.kind]}</span>
                      {hostOf(s.website) ?? s.phone ?? s.order_note ?? ""}
                    </p>
                  </div>
                  <div className="text-right text-xs">
                    <p className="font-cute text-base text-ink">{st?.count ?? 0}개</p>
                    {st?.low ? <p className="text-butter-700">발주 {st.low}</p> : null}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      <SupplierSheet open={adding} onClose={() => setAdding(false)} />
    </div>
  );
}
