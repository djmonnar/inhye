"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { EmptyState, Loading, PageHeader, Segmented } from "@/components/ui";
import { num, won } from "@/lib/format";
import { useMoves, useProducts, useSupplierMap } from "@/lib/queries";
import type { MoveKind } from "@/lib/types";

const LABEL: Record<MoveKind, string> = { in: "입고", out: "출고", adjust: "재고 맞춤", sale: "판매" };
type Filter = "all" | "in" | "out";

export default function HistoryPage() {
  const { data: moves, isLoading } = useMoves(undefined, 500);
  const { data: products = [] } = useProducts();
  const suppliers = useSupplierMap();
  const [filter, setFilter] = useState<Filter>("all");
  const names = useMemo(() => new Map(products.map((p) => [p.id, p.name])), [products]);

  const days = useMemo(() => {
    const list = (moves ?? []).filter((m) => filter === "all" || (filter === "in" ? m.qty > 0 : m.qty < 0));
    const map = new Map<string, typeof list>();
    for (const m of list) {
      const d = new Date(m.created_at);
      const key = `${d.getMonth() + 1}월 ${d.getDate()}일 (${"일월화수목금토"[d.getDay()]})`;
      map.set(key, [...(map.get(key) ?? []), m]);
    }
    return [...map.entries()];
  }, [moves, filter]);

  return (
    <div>
      <PageHeader back title="입고 · 출고 기록" sub="최근 500건" />
      <div className="mb-3">
        <Segmented<Filter>
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: "전체" },
            { value: "in", label: "늘어난 것" },
            { value: "out", label: "줄어든 것" },
          ]}
        />
      </div>
      {isLoading ? (
        <Loading />
      ) : days.length === 0 ? (
        <EmptyState title="아직 기록이 없어요" desc="입고·출고·스캔을 하면 여기에 쌓여요" />
      ) : (
        <div className="space-y-4">
          {days.map(([day, list]) => {
            const inAmount = list.reduce((n, m) => n + (m.qty > 0 ? (m.unit_cost ?? 0) * m.qty : 0), 0);
            return (
              <section key={day}>
                <div className="mb-1.5 flex items-baseline justify-between px-1">
                  <p className="font-cute">{day}</p>
                  {inAmount > 0 && <p className="text-xs text-ink-soft">입고 {won(inAmount)}</p>}
                </div>
                <ul className="card divide-y-2 divide-dashed divide-line px-3">
                  {list.map((m) => (
                    <li key={m.id} className="flex items-center gap-2 py-2.5 text-sm">
                      <span className={`badge ${m.qty > 0 ? "bg-matcha-100 text-matcha-700" : "bg-berry-100 text-berry-700"}`}>
                        {LABEL[m.kind]}
                      </span>
                      <div className="min-w-0 flex-1">
                        <Link href={`/products/${m.product_id}`} className="block truncate font-medium">
                          {names.get(m.product_id) ?? "삭제된 상품"}
                        </Link>
                        <p className="truncate text-xs text-ink-faint">
                          {[
                            m.supplier_id ? suppliers.get(m.supplier_id)?.name : null,
                            m.unit_cost ? `개당 ${won(m.unit_cost)}` : null,
                            m.memo,
                            m.created_by_name,
                            new Date(m.created_at).toLocaleTimeString("ko-KR", { hour: "numeric", minute: "2-digit" }),
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      </div>
                      <span className={`font-cute text-base tabular-nums ${m.qty > 0 ? "text-matcha-700" : "text-berry-600"}`}>
                        {m.qty > 0 ? "+" : ""}
                        {num(m.qty)}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
