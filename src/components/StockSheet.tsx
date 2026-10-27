"use client";

import { useState } from "react";
import { num, won } from "@/lib/format";
import { useRefresh, useSuppliers } from "@/lib/queries";
import { store } from "@/lib/store";
import type { MoveKind, Product } from "@/lib/types";
import { useToast } from "./providers";
import { Field, MoneyInput, Segmented, Sheet, Stepper, Toggle } from "./ui";

type Mode = "in" | "out" | "set";

export function StockSheet({
  product,
  open,
  onClose,
  initialMode = "in",
  initialQty,
}: {
  product: Product;
  open: boolean;
  onClose: () => void;
  initialMode?: Mode;
  initialQty?: number;
}) {
  return (
    <Sheet open={open} onClose={onClose} title={`재고 · ${product.name}`}>
      {open && (
        <StockForm product={product} onDone={onClose} initialMode={initialMode} initialQty={initialQty} />
      )}
    </Sheet>
  );
}

function StockForm({
  product,
  onDone,
  initialMode,
  initialQty,
}: {
  product: Product;
  onDone: () => void;
  initialMode: Mode;
  initialQty?: number;
}) {
  const toast = useToast();
  const refresh = useRefresh();
  const { data: suppliers = [] } = useSuppliers();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [qty, setQty] = useState(initialQty ?? (initialMode === "set" ? product.stock_qty : 1));
  const [unitCost, setUnitCost] = useState(product.cost_price);
  const [supplierId, setSupplierId] = useState(product.supplier_id ?? "");
  const [updateCost, setUpdateCost] = useState(false);
  const [memo, setMemo] = useState("");
  const [busy, setBusy] = useState(false);

  const delta = mode === "in" ? qty : mode === "out" ? -qty : qty - product.stock_qty;
  const after = product.stock_qty + delta;

  async function submit() {
    if (delta === 0) {
      onDone();
      return;
    }
    setBusy(true);
    try {
      const kind: MoveKind = mode === "set" ? "adjust" : mode;
      const result = await store().addMove({
        product_id: product.id,
        kind,
        qty: delta,
        unit_cost: mode === "in" ? unitCost : null,
        supplier_id: mode === "in" ? supplierId || null : null,
        memo: memo.trim() || null,
        update_cost: mode === "in" && updateCost,
      });
      await refresh("products", "moves");
      toast(`재고 ${num(result)}개가 됐어요`, mode === "in" ? "wow" : "happy");
      onDone();
    } catch (e) {
      toast(e instanceof Error ? e.message : "저장하지 못했어요", "sad");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <Segmented<Mode>
        value={mode}
        onChange={(m) => {
          setMode(m);
          setQty(m === "set" ? product.stock_qty : 1);
        }}
        options={[
          { value: "in", label: "📦 입고" },
          { value: "out", label: "🛍️ 출고/판매" },
          { value: "set", label: "🔢 재고 맞추기" },
        ]}
      />
      <Field label={mode === "set" ? "실제 남은 개수" : "수량"}>
        {(id) => <Stepper id={id} value={qty} onChange={setQty} min={mode === "set" ? 0 : 1} />}
      </Field>

      {mode === "in" && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Field label="개당 매입가">
              {(id) => <MoneyInput id={id} value={unitCost} onChange={setUnitCost} />}
            </Field>
            <Field label="산 곳">
              {(id) => (
                <select id={id} className="input" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
                  <option value="">선택 안 함</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              )}
            </Field>
          </div>
          {unitCost !== product.cost_price && unitCost > 0 && (
            <Toggle
              checked={updateCost}
              onChange={setUpdateCost}
              label={`상품 원가도 ${won(unitCost)}으로 바꾸기`}
              desc={`지금 원가 ${won(product.cost_price)}`}
            />
          )}
          {unitCost > 0 && (
            <p className="text-right text-sm text-ink-soft">
              이번 입고 금액 <b className="text-ink">{won(unitCost * qty)}</b>
            </p>
          )}
        </>
      )}

      <Field label="메모 (선택)">
        {(id) => (
          <input
            id={id}
            className="input"
            placeholder={mode === "out" ? "예: 파손, 증정" : "예: 10/27 택배 도착"}
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
          />
        )}
      </Field>

      <div className="flex items-center justify-between rounded-2xl bg-white px-4 py-3">
        <span className="text-ink-soft">재고</span>
        <span className="font-cute text-xl tabular-nums">
          {num(product.stock_qty)} → <span className={after < 0 ? "text-danger" : "text-berry-600"}>{num(after)}</span>
        </span>
      </div>

      <button type="button" className="btn-primary w-full" disabled={busy} onClick={submit}>
        {busy ? "저장 중..." : "저장하기"}
      </button>
    </div>
  );
}
