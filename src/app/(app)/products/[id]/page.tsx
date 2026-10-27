"use client";

import {
  Copy,
  ExternalLink,
  Globe,
  Minus,
  PackagePlus,
  Pencil,
  Phone,
  Plus,
  Printer,
  ShoppingBasket,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { BarcodeSvg } from "@/components/BarcodeSvg";
import { useAuth, useToast } from "@/components/providers";
import { StockSheet } from "@/components/StockSheet";
import { KIND_LABEL, KIND_STYLE } from "@/components/SupplierSheet";
import {
  ConfirmSheet,
  EmptyState,
  Loading,
  PageHeader,
  ProductThumb,
  StockBadge,
} from "@/components/ui";
import { ensureUrl, margin, needsKioskSync, num, relTime, shortDate, won } from "@/lib/format";
import { useMoves, useProduct, useRefresh, useSupplierMap } from "@/lib/queries";
import { store } from "@/lib/store";
import type { MoveKind } from "@/lib/types";

const MOVE_LABEL: Record<MoveKind, string> = { in: "입고", out: "출고", adjust: "재고 맞춤", sale: "판매" };

export default function ProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const refresh = useRefresh();
  const { user } = useAuth();
  const { product, isLoading } = useProduct(id);
  const suppliers = useSupplierMap();
  const { data: moves = [] } = useMoves(id, 30);
  const [stockOpen, setStockOpen] = useState<null | "in" | "out" | "set">(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [quickBusy, setQuickBusy] = useState(false);

  if (isLoading) return <Loading />;
  if (!product)
    return (
      <>
        <PageHeader back title="상품" />
        <EmptyState mood="sad" title="상품을 찾을 수 없어요" action={<Link href="/products" className="btn-soft">상품 목록으로</Link>} />
      </>
    );

  const supplier = product.supplier_id ? suppliers.get(product.supplier_id) : undefined;
  const m = margin(product.cost_price, product.sale_price);
  const imageUrl = store().imageUrl(product.image_path);

  async function quick(delta: 1 | -1) {
    if (!product || quickBusy) return;
    setQuickBusy(true);
    try {
      const qty = await store().addMove({ product_id: product.id, kind: delta > 0 ? "in" : "out", qty: delta });
      await refresh("products", "moves");
      toast(`재고 ${num(qty)}개`, delta > 0 ? "wow" : "happy");
    } catch (e) {
      toast(e instanceof Error ? e.message : "실패했어요", "sad");
    } finally {
      setQuickBusy(false);
    }
  }

  async function copy(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast(`${label} 복사했어요`, "wink");
    } catch {
      toast("복사하지 못했어요", "sad");
    }
  }

  return (
    <div>
      <PageHeader
        back
        title={product.name}
        sub={product.category}
        right={
          <Link href={`/products/${product.id}/edit`} className="btn-soft btn-sm" aria-label="수정">
            <Pencil size={16} /> 수정
          </Link>
        }
      />

      <div className="space-y-4">
        {/* 사진 + 이름 */}
        <section className="card overflow-hidden">
          {imageUrl ? (
            <a href={imageUrl} target="_blank" rel="noreferrer" className="block bg-berry-50">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imageUrl} alt={product.name} className="mx-auto max-h-[60vh] w-full object-contain" />
            </a>
          ) : (
            <div className="flex justify-center bg-berry-50 py-8">
              <ProductThumb product={product} className="h-28 w-28" />
            </div>
          )}
          <div className="space-y-2 p-4">
            <div className="flex flex-wrap items-center gap-1.5">
              <StockBadge product={product} />
              {!product.is_active && <span className="badge bg-ink/10 text-ink-soft">판매 중지</span>}
              {needsKioskSync(product) && <span className="badge bg-soda-100 text-soda-700">키오스크 반영 필요</span>}
              {product.tags.map((t) => (
                <span key={t} className="badge bg-berry-50 text-berry-600">
                  #{t}
                </span>
              ))}
            </div>
            <h2 className="font-cute text-2xl leading-snug">{product.name}</h2>
            {product.barcode && (
              <button
                type="button"
                className="flex w-full items-center gap-3 rounded-2xl bg-cream p-3 text-left"
                onClick={() => copy(product.barcode ?? "", "바코드")}
              >
                <BarcodeSvg value={product.barcode} height={36} width={1.4} fontSize={12} className="max-w-[70%]" />
                <Copy size={16} className="ml-auto text-ink-faint" />
              </button>
            )}
          </div>
        </section>

        {/* 가격 */}
        <section className="card grid grid-cols-3 divide-x-2 divide-line p-1 text-center">
          <div className="p-3">
            <p className="text-xs text-ink-soft">판매가</p>
            <p className="font-cute text-xl tabular-nums text-berry-600">{won(product.sale_price)}</p>
          </div>
          <div className="p-3">
            <p className="text-xs text-ink-soft">원가</p>
            <p className="font-cute text-xl tabular-nums">{won(product.cost_price)}</p>
          </div>
          <div className="p-3">
            <p className="text-xs text-ink-soft">마진</p>
            <p className={`font-cute text-xl tabular-nums ${m.amount < 0 ? "text-danger" : "text-matcha-700"}`}>
              {m.rate.toFixed(0)}%
            </p>
            <p className="text-[11px] text-ink-soft tabular-nums">{won(m.amount)}</p>
          </div>
        </section>

        {/* 재고 */}
        <section className="card p-4">
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <p className="text-sm text-ink-soft">지금 재고</p>
              <p className="font-cute text-4xl tabular-nums">
                {num(product.stock_qty)}
                <span className="ml-1 text-lg text-ink-soft">개</span>
              </p>
              {product.safety_stock > 0 && (
                <p className="text-xs text-ink-soft">{num(product.safety_stock)}개 이하면 발주 알림</p>
              )}
            </div>
            <button
              type="button"
              className="btn-soft h-14 w-14 px-0"
              aria-label="재고 하나 빼기"
              disabled={quickBusy}
              onClick={() => quick(-1)}
            >
              <Minus size={24} />
            </button>
            <button
              type="button"
              className="btn-primary h-14 w-14 px-0"
              aria-label="재고 하나 더하기"
              disabled={quickBusy}
              onClick={() => quick(1)}
            >
              <Plus size={24} />
            </button>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button type="button" className="btn-soft btn-sm" onClick={() => setStockOpen("in")}>
              <PackagePlus size={16} /> 입고 등록
            </button>
            <button type="button" className="btn-soft btn-sm" onClick={() => setStockOpen("set")}>
              🔢 재고 맞추기
            </button>
          </div>
        </section>

        {/* 구매처 */}
        <section className="card p-4">
          <p className="mb-3 font-cute text-lg">🛒 어디서 샀더라?</p>
          {supplier ? (
            <Link href={`/suppliers/${supplier.id}`} className="flex items-center gap-2 rounded-2xl bg-cream p-3">
              <span className={`badge ${KIND_STYLE[supplier.kind]}`}>{KIND_LABEL[supplier.kind]}</span>
              <span className="font-cute text-lg">{supplier.name}</span>
              {supplier.order_note && <span className="ml-auto truncate text-xs text-ink-soft">{supplier.order_note}</span>}
            </Link>
          ) : (
            <p className="rounded-2xl bg-cream p-3 text-sm text-ink-soft">
              구매처가 아직 없어요.{" "}
              <Link href={`/products/${product.id}/edit`} className="font-semibold text-berry-600 underline">
                추가하기
              </Link>
            </p>
          )}
          {product.supplier_sku && (
            <button
              type="button"
              className="mt-2 flex w-full items-center gap-2 rounded-2xl border-2 border-dashed border-line p-3 text-left text-sm"
              onClick={() => copy(product.supplier_sku ?? "", "구매처 상품명")}
            >
              <span className="text-ink-soft">구매처 상품명</span>
              <span className="flex-1 truncate font-medium">{product.supplier_sku}</span>
              <Copy size={14} className="text-ink-faint" />
            </button>
          )}
          <div className="mt-3 space-y-2">
            {product.purchase_url && (
              <a href={ensureUrl(product.purchase_url)} target="_blank" rel="noreferrer" className="btn-primary w-full text-lg">
                <ShoppingBasket size={20} /> 다시 주문하러 가기
              </a>
            )}
            <div className="grid grid-cols-2 gap-2">
              {supplier?.website && (
                <a href={ensureUrl(supplier.website)} target="_blank" rel="noreferrer" className="btn-soft btn-sm">
                  <Globe size={16} /> 구매처 사이트
                </a>
              )}
              {supplier?.phone && (
                <a href={`tel:${supplier.phone}`} className="btn-soft btn-sm">
                  <Phone size={16} /> 전화하기
                </a>
              )}
            </div>
          </div>
        </section>

        {/* 메모 / 키오스크 */}
        {(product.memo || product.kiosk_code || product.description) && (
          <section className="card space-y-2 p-4 text-sm">
            {product.memo && <p className="whitespace-pre-wrap">📝 {product.memo}</p>}
            {product.description && <p className="whitespace-pre-wrap text-ink-soft">{product.description}</p>}
            {product.kiosk_code && (
              <p className="text-ink-soft">
                키오스크 코드 <span className="font-mono text-ink">{product.kiosk_code}</span>
              </p>
            )}
          </section>
        )}

        {/* 기록 */}
        <section className="card p-4">
          <p className="mb-2 font-cute text-lg">📒 입고 · 출고 기록</p>
          {moves.length === 0 ? (
            <p className="py-3 text-center text-sm text-ink-soft">아직 기록이 없어요</p>
          ) : (
            <ul className="divide-y-2 divide-dashed divide-line">
              {moves.map((mv) => (
                <li key={mv.id} className="flex items-center gap-2 py-2.5 text-sm">
                  <span
                    className={`badge ${
                      mv.qty > 0 ? "bg-matcha-100 text-matcha-700" : "bg-berry-100 text-berry-700"
                    }`}
                  >
                    {MOVE_LABEL[mv.kind]}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-ink-soft">
                    {mv.memo ?? (mv.supplier_id ? suppliers.get(mv.supplier_id)?.name : "") ?? ""}
                    {mv.unit_cost ? ` · 개당 ${won(mv.unit_cost)}` : ""}
                  </span>
                  <span className={`font-cute tabular-nums ${mv.qty > 0 ? "text-matcha-700" : "text-berry-600"}`}>
                    {mv.qty > 0 ? "+" : ""}
                    {num(mv.qty)}
                  </span>
                  <span className="w-14 text-right text-xs text-ink-faint" title={shortDate(mv.created_at)}>
                    {relTime(mv.created_at)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="grid grid-cols-2 gap-2">
          <Link href={`/labels?ids=${product.id}`} className="btn-soft">
            <Printer size={18} /> 라벨 인쇄
          </Link>
          <Link href={`/products/new?copy=${product.id}`} className="btn-soft">
            <Copy size={18} /> 복사해서 등록
          </Link>
        </div>
        {product.purchase_url && (
          <p className="text-center text-xs text-ink-faint">
            <ExternalLink size={12} className="inline" /> {product.purchase_url}
          </p>
        )}
        {user?.role === "admin" && (
          <button type="button" className="btn-danger w-full" onClick={() => setConfirmDelete(true)}>
            <Trash2 size={18} /> 상품 삭제
          </button>
        )}
        <p className="text-center text-xs text-ink-faint">
          등록 {shortDate(product.created_at)} · 수정 {relTime(product.updated_at)}
        </p>
      </div>

      <StockSheet
        product={product}
        open={stockOpen !== null}
        initialMode={stockOpen ?? "in"}
        onClose={() => setStockOpen(null)}
      />
      <ConfirmSheet
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        danger
        title="정말 삭제할까요?"
        desc={`‘${product.name}’과 입고 기록이 모두 지워져요.`}
        confirmText="삭제"
        onConfirm={async () => {
          try {
            await store().deleteProduct(product.id);
            await refresh("products", "moves");
            toast("삭제했어요", "sad");
            router.replace("/products");
          } catch (e) {
            toast(e instanceof Error ? e.message : "삭제하지 못했어요", "sad");
          }
        }}
      />
    </div>
  );
}
