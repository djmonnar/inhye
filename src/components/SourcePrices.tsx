"use client";

import { ChevronDown, Plus, ShoppingBasket, Star, Tag, Trash2 } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { ensureUrl, relTime, shortDate, won } from "@/lib/format";
import { j } from "@/lib/josa";
import { usePriceLogs, useRefresh, useSources, useSuppliers } from "@/lib/queries";
import { cheaperThanMain, cheapest, isStale, sortSources } from "@/lib/sources";
import { store } from "@/lib/store";
import type { PriceLog, Product, ProductSource, Supplier } from "@/lib/types";
import { useAuth, useToast } from "./providers";
import { KIND_LABEL, KIND_STYLE, SupplierSheet } from "./SupplierSheet";
import { ConfirmSheet, Field, MoneyInput, Sheet, Toggle } from "./ui";

const LOG_SOURCE: Record<PriceLog["source"], string> = {
  manual: "직접",
  stock_in: "입고",
  chatbot: "카톡",
  import: "가져오기",
};

/**
 * 상품 화면의 ‘거래처별 가격’ — 같은 상품도 거래처마다 값이 달라서, 거래처마다 최근 개당 가격을
 * 한 줄씩 보여주고 제일 싼 곳을 표시해요. 아래에는 가격이 바뀐 기록이 쌓여요.
 */
export function SourcePrices({ product }: { product: Product }) {
  const toast = useToast();
  const refresh = useRefresh();
  const { user } = useAuth();
  const { data: allSources = [] } = useSources();
  const { data: suppliers = [] } = useSuppliers();
  const { data: logs = [] } = usePriceLogs({ productId: product.id }, 20);
  const supMap = useMemo(() => new Map(suppliers.map((s) => [s.id, s])), [suppliers]);
  const rows = useMemo(
    () => sortSources(allSources.filter((s) => s.product_id === product.id && supMap.has(s.supplier_id))),
    [allSources, product.id, supMap],
  );
  const best = cheapest(rows);
  const cheaper = cheaperThanMain(product, rows);
  const [sheet, setSheet] = useState<null | { supplierId?: string }>(null);
  const [removing, setRemoving] = useState<ProductSource | null>(null);
  const [showLogs, setShowLogs] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  async function makeMain(src: ProductSource) {
    setBusy(src.id);
    try {
      await store().setMainSource(src);
      await refresh("products", "sources");
      toast(`${j(supMap.get(src.supplier_id)?.name ?? "이 거래처", "을")} 주 거래처로 바꿨어요`, "wow");
    } catch (e) {
      toast(e instanceof Error ? e.message : "바꾸지 못했어요", "sad");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="card p-4">
      <div className="mb-3 flex items-center gap-2">
        <p className="flex-1 font-cute text-lg">🏷️ 거래처별 가격</p>
        <button type="button" className="btn-soft btn-sm" onClick={() => setSheet({})}>
          <Plus size={16} /> 가격 기록
        </button>
      </div>

      {cheaper && (
        <p className="mb-3 rounded-2xl bg-matcha-100 px-3 py-2 text-sm text-matcha-700">
          💡 {supMap.get(cheaper.source.supplier_id)?.name}에서 사면 개당 {won(cheaper.save)} 아껴요
        </p>
      )}

      {rows.length === 0 ? (
        <p className="rounded-2xl bg-cream p-3 text-sm text-ink-soft">
          아직 거래처 가격이 없어요. ‘가격 기록’으로 거래처마다 값을 적어 두면 제일 싼 곳을 알려드려요.
        </p>
      ) : (
        <ul className="space-y-2">
          {rows.map((src) => {
            const sup = supMap.get(src.supplier_id) as Supplier;
            const isMain = src.supplier_id === product.supplier_id;
            const isBest = best?.id === src.id && rows.length > 1;
            const stale = src.price != null && isStale(src.price_at);
            return (
              <li key={src.id} className={`rounded-2xl border-2 p-3 ${isBest ? "border-matcha-300 bg-matcha-100/40" : "border-line"}`}>
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className={`badge ${KIND_STYLE[sup.kind]}`}>{KIND_LABEL[sup.kind]}</span>
                      <Link href={`/suppliers/${sup.id}`} className="truncate font-semibold">
                        {sup.name}
                      </Link>
                      {isMain && <span className="badge bg-butter-100 text-butter-700">주 거래처</span>}
                      {isBest && <span className="badge bg-matcha-100 text-matcha-700">최저가</span>}
                    </div>
                    <p className="mt-1 text-xs text-ink-soft">
                      {src.price_at ? `${relTime(src.price_at)} 확인` : "가격 미확인"}
                      {stale && " · 오래된 가격이에요"}
                      {src.memo ? ` · ${src.memo}` : ""}
                    </p>
                    {src.supplier_sku && <p className="truncate text-xs text-ink-faint">상품명 {src.supplier_sku}</p>}
                  </div>
                  <p className={`font-cute text-xl tabular-nums ${isBest ? "text-matcha-700" : ""}`}>
                    {src.price != null ? won(src.price) : "—"}
                  </p>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {(src.purchase_url || sup.website) && (
                    <a
                      href={ensureUrl(src.purchase_url || sup.website || "")}
                      target="_blank"
                      rel="noreferrer"
                      className="btn-primary btn-sm"
                    >
                      <ShoppingBasket size={14} /> {src.purchase_url ? "주문하러" : "사이트"}
                    </a>
                  )}
                  <button type="button" className="btn-soft btn-sm" onClick={() => setSheet({ supplierId: src.supplier_id })}>
                    <Tag size={14} /> 새 가격
                  </button>
                  {!isMain && (
                    <button type="button" className="btn-soft btn-sm" disabled={busy === src.id} onClick={() => makeMain(src)}>
                      <Star size={14} /> 주 거래처로
                    </button>
                  )}
                  {user?.role === "admin" && !isMain && (
                    <button type="button" className="btn-soft btn-sm text-danger" aria-label="이 거래처 빼기" onClick={() => setRemoving(src)}>
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {logs.length > 0 && (
        <div className="mt-3">
          <button type="button" className="flex w-full items-center gap-1 text-sm text-ink-soft" onClick={() => setShowLogs((v) => !v)}>
            <ChevronDown size={16} className={showLogs ? "rotate-180" : ""} /> 가격 기록 {logs.length}건
          </button>
          {showLogs && <PriceHistory logs={logs} supMap={supMap} />}
        </div>
      )}

      <PriceSheet
        open={sheet !== null}
        onClose={() => setSheet(null)}
        product={product}
        rows={rows}
        initialSupplierId={sheet?.supplierId}
      />
      <ConfirmSheet
        open={removing !== null}
        onClose={() => setRemoving(null)}
        danger
        title="이 거래처를 뺄까요?"
        desc={`${supMap.get(removing?.supplier_id ?? "")?.name ?? ""}의 가격 줄만 지워져요. 지난 가격 기록은 남아요.`}
        confirmText="빼기"
        onConfirm={async () => {
          if (!removing) return;
          try {
            await store().deleteSource(removing.id);
            await refresh("sources");
            toast("뺐어요", "sad");
          } catch (e) {
            toast(e instanceof Error ? e.message : "빼지 못했어요", "sad");
          }
        }}
      />
    </section>
  );
}

/** 가격 기록: 같은 거래처의 바로 전 가격보다 오르면 ▲, 내리면 ▼ */
function PriceHistory({ logs, supMap }: { logs: PriceLog[]; supMap: Map<string, Supplier> }) {
  return (
    <ul className="mt-2 divide-y-2 divide-dashed divide-line text-sm">
      {logs.map((l, i) => {
        const prev = logs.slice(i + 1).find((x) => x.supplier_id === l.supplier_id);
        const diff = prev ? l.price - prev.price : 0;
        return (
          <li key={l.id} className="flex items-center gap-2 py-2">
            <span className="badge bg-cream text-ink-soft">{LOG_SOURCE[l.source]}</span>
            <span className="min-w-0 flex-1 truncate">{supMap.get(l.supplier_id)?.name ?? "지운 거래처"}</span>
            {diff !== 0 && (
              <span className={`text-xs tabular-nums ${diff > 0 ? "text-danger" : "text-matcha-700"}`}>
                {diff > 0 ? "▲" : "▼"}
                {won(Math.abs(diff))}
              </span>
            )}
            <span className="font-semibold tabular-nums">{won(l.price)}</span>
            <span className="w-16 text-right text-xs text-ink-faint" title={shortDate(l.noted_at)}>
              {relTime(l.noted_at)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** 가격 기록하기: 거래처 고르기 → 개당 가격 → (선택) 링크·상품명·메모 */
export function PriceSheet({
  open,
  onClose,
  product,
  rows,
  initialSupplierId,
}: {
  open: boolean;
  onClose: () => void;
  product: Product;
  rows: ProductSource[];
  initialSupplierId?: string;
}) {
  return (
    <Sheet open={open} onClose={onClose} title="가격 기록하기">
      {open && <PriceForm product={product} rows={rows} initialSupplierId={initialSupplierId} onDone={onClose} />}
    </Sheet>
  );
}

function PriceForm({
  product,
  rows,
  initialSupplierId,
  onDone,
}: {
  product: Product;
  rows: ProductSource[];
  initialSupplierId?: string;
  onDone: () => void;
}) {
  const toast = useToast();
  const refresh = useRefresh();
  const { data: suppliers = [] } = useSuppliers();
  const [supplierId, setSupplierId] = useState(initialSupplierId ?? product.supplier_id ?? "");
  const current = rows.find((r) => r.supplier_id === supplierId);
  const [price, setPrice] = useState(current?.price ?? 0);
  const [url, setUrl] = useState(current?.purchase_url ?? "");
  const [sku, setSku] = useState(current?.supplier_sku ?? "");
  const [memo, setMemo] = useState(current?.memo ?? "");
  const [setCost, setSetCost] = useState(supplierId === product.supplier_id);
  const [newSupplier, setNewSupplier] = useState(false);
  const [busy, setBusy] = useState(false);

  function pick(id: string) {
    setSupplierId(id);
    const row = rows.find((r) => r.supplier_id === id);
    setPrice(row?.price ?? 0);
    setUrl(row?.purchase_url ?? "");
    setSku(row?.supplier_sku ?? "");
    setMemo(row?.memo ?? "");
    setSetCost(id === product.supplier_id);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!supplierId) return toast("거래처를 골라 주세요", "sad");
    if (!price) return toast("개당 가격을 적어 주세요", "sad");
    setBusy(true);
    try {
      await store().recordPrice({
        product_id: product.id,
        supplier_id: supplierId,
        price,
        purchase_url: url.trim() || null,
        supplier_sku: sku.trim() || null,
        memo: memo.trim() || null,
        set_cost: setCost,
      });
      await refresh("sources", "products");
      toast("가격을 기록했어요", "wow");
      onDone();
    } catch (err) {
      toast(err instanceof Error ? err.message : "기록하지 못했어요", "sad");
    } finally {
      setBusy(false);
    }
  }

  const sorted = [...suppliers].sort((a, b) => Number(b.favorite) - Number(a.favorite) || a.name.localeCompare(b.name, "ko"));

  return (
    <form onSubmit={submit} className="space-y-4">
      <p className="rounded-2xl bg-cream px-3 py-2 text-sm">
        <span className="text-ink-soft">상품 </span>
        <b>{product.name}</b>
      </p>
      <Field label="거래처 *">
        {(id) => (
          <div className="flex gap-2">
            <select id={id} className="input flex-1" value={supplierId} onChange={(e) => pick(e.target.value)}>
              <option value="">고르기</option>
              {sorted.map((s) => {
                const row = rows.find((r) => r.supplier_id === s.id);
                return (
                  <option key={s.id} value={s.id}>
                    {s.favorite ? "⭐ " : ""}
                    {s.name}
                    {row?.price != null ? ` (지금 ${won(row.price)})` : ""}
                  </option>
                );
              })}
            </select>
            <button type="button" className="btn-soft px-3" aria-label="새 거래처" onClick={() => setNewSupplier(true)}>
              <Plus size={18} />
            </button>
          </div>
        )}
      </Field>
      <Field label="개당 가격 *" hint={current?.price != null ? `지난번 ${won(current.price)} (${relTime(current.price_at)})` : "배송비를 나눠 넣으면 더 정확해요"}>
        {(id) => <MoneyInput id={id} value={price} onChange={setPrice} />}
      </Field>
      <Field label="구매 링크" hint="이 거래처에서 이 상품을 다시 주문하는 주소">
        {(id) => <input id={id} className="input" inputMode="url" placeholder="https://" value={url} onChange={(e) => setUrl(e.target.value)} />}
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="거래처 상품명">
          {(id) => <input id={id} className="input" placeholder="옵션·품번" value={sku} onChange={(e) => setSku(e.target.value)} />}
        </Field>
        <Field label="메모">
          {(id) => <input id={id} className="input" placeholder="예: 50개 이상" value={memo} onChange={(e) => setMemo(e.target.value)} />}
        </Field>
      </div>
      <Toggle checked={setCost} onChange={setSetCost} label={`상품 원가도 ${j(price ? won(price) : "이 가격", "로")} 바꾸기`} />
      <button type="submit" className="btn-primary w-full" disabled={busy}>
        {busy ? "기록 중..." : "기록하기"}
      </button>
      <SupplierSheet
        open={newSupplier}
        onClose={() => setNewSupplier(false)}
        onSaved={(s) => pick(s.id)}
      />
    </form>
  );
}
