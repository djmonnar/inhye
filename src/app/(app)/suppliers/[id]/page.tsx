"use client";

import { Globe, MessageCircle, Pencil, Phone, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useAuth, useToast } from "@/components/providers";
import { KIND_LABEL, KIND_STYLE, SupplierSheet } from "@/components/SupplierSheet";
import { ConfirmSheet, EmptyState, Loading, PageHeader, ProductThumb, StockBadge } from "@/components/ui";
import { ensureUrl, hostOf, num, won } from "@/lib/format";
import { useMoves, useProducts, useRefresh, useSuppliers } from "@/lib/queries";
import { store } from "@/lib/store";

export default function SupplierDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const refresh = useRefresh();
  const { user } = useAuth();
  const { data: suppliers, isLoading } = useSuppliers();
  const { data: products = [] } = useProducts();
  const { data: moves = [] } = useMoves(undefined, 500);
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const supplier = suppliers?.find((s) => s.id === id);
  const items = useMemo(
    () => products.filter((p) => p.supplier_id === id).sort((a, b) => a.stock_qty - b.stock_qty),
    [products, id],
  );
  const bought = useMemo(() => {
    const ins = moves.filter((m) => m.supplier_id === id && m.qty > 0);
    return { count: ins.length, amount: ins.reduce((n, m) => n + (m.unit_cost ?? 0) * m.qty, 0) };
  }, [moves, id]);

  if (isLoading) return <Loading />;
  if (!supplier)
    return (
      <>
        <PageHeader back="/suppliers" title="구매처" />
        <EmptyState mood="sad" title="구매처를 찾을 수 없어요" />
      </>
    );

  return (
    <div>
      <PageHeader
        back
        title={supplier.name}
        right={
          <button type="button" className="btn-soft btn-sm" onClick={() => setEditing(true)}>
            <Pencil size={16} /> 수정
          </button>
        }
      />
      <div className="space-y-4">
        <section className="card space-y-3 p-4">
          <div className="flex items-center gap-2">
            <span className={`badge ${KIND_STYLE[supplier.kind]}`}>{KIND_LABEL[supplier.kind]}</span>
            {supplier.favorite && <span className="badge bg-butter-100 text-butter-700">⭐ 자주 쓰는 곳</span>}
          </div>
          {supplier.order_note && <p className="rounded-2xl bg-butter-100 px-3 py-2 text-sm">🚚 {supplier.order_note}</p>}
          {supplier.contact && (
            <p className="text-sm">
              <span className="text-ink-soft">담당 </span>
              {supplier.contact}
            </p>
          )}
          {supplier.memo && <p className="whitespace-pre-wrap text-sm text-ink-soft">{supplier.memo}</p>}
          <div className="grid grid-cols-2 gap-2">
            {supplier.website && (
              <a href={ensureUrl(supplier.website)} target="_blank" rel="noreferrer" className="btn-primary col-span-2">
                <Globe size={18} /> {hostOf(supplier.website)} 열기
              </a>
            )}
            {supplier.phone && (
              <>
                <a href={`tel:${supplier.phone}`} className="btn-soft btn-sm">
                  <Phone size={16} /> 전화
                </a>
                <a href={`sms:${supplier.phone}`} className="btn-soft btn-sm">
                  <MessageCircle size={16} /> 문자
                </a>
              </>
            )}
          </div>
        </section>

        <section className="card grid grid-cols-3 divide-x-2 divide-line p-1 text-center">
          <div className="p-3">
            <p className="text-xs text-ink-soft">상품</p>
            <p className="font-cute text-xl">{num(items.length)}개</p>
          </div>
          <div className="p-3">
            <p className="text-xs text-ink-soft">입고 횟수</p>
            <p className="font-cute text-xl">{num(bought.count)}번</p>
          </div>
          <div className="p-3">
            <p className="text-xs text-ink-soft">산 금액</p>
            <p className="font-cute text-xl tabular-nums">{won(bought.amount)}</p>
          </div>
        </section>

        <section>
          <div className="mb-2 flex items-center justify-between">
            <p className="font-cute text-lg">여기서 산 상품</p>
            <Link href={`/products?sup=${supplier.id}`} className="text-sm text-berry-600">
              전체 보기
            </Link>
          </div>
          {items.length === 0 ? (
            <p className="card p-4 text-center text-sm text-ink-soft">아직 연결된 상품이 없어요</p>
          ) : (
            <ul className="space-y-2">
              {items.map((p) => (
                <li key={p.id}>
                  <Link href={`/products/${p.id}`} className="card flex items-center gap-3 p-2.5">
                    <ProductThumb product={p} className="h-12 w-12" frame="rounded-xl border-2" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{p.name}</p>
                      <p className="text-xs text-ink-soft">원가 {won(p.cost_price)}</p>
                    </div>
                    <StockBadge product={p} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <Link href="/products/new" className="btn-soft mt-3 w-full">
            <Plus size={18} /> 새 상품 등록
          </Link>
        </section>

        {user?.role === "admin" && (
          <button type="button" className="btn-danger w-full" onClick={() => setConfirmDelete(true)}>
            <Trash2 size={18} /> 구매처 삭제
          </button>
        )}
      </div>

      <SupplierSheet open={editing} onClose={() => setEditing(false)} supplier={supplier} />
      <ConfirmSheet
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        danger
        title="구매처를 삭제할까요?"
        desc={`상품은 그대로 남고, ${items.length}개 상품의 구매처만 비워져요.`}
        confirmText="삭제"
        onConfirm={async () => {
          try {
            await store().deleteSupplier(supplier.id);
            await refresh("suppliers", "products");
            toast("삭제했어요", "sad");
            router.replace("/suppliers");
          } catch (e) {
            toast(e instanceof Error ? e.message : "삭제하지 못했어요", "sad");
          }
        }}
      />
    </div>
  );
}
