"use client";

import { Camera, CameraOff, Pencil, Plus, ShoppingBasket, Undo2 } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { BarcodeScanner, beep } from "@/components/BarcodeScanner";
import { Mascot } from "@/components/Mascot";
import { useToast } from "@/components/providers";
import { KIND_LABEL } from "@/components/SupplierSheet";
import { Loading, PageHeader, ProductThumb, Segmented, StockBadge } from "@/components/ui";
import { ensureUrl, num, won } from "@/lib/format";
import { useProducts, useRefresh, useSupplierMap } from "@/lib/queries";
import { store } from "@/lib/store";
import type { Product } from "@/lib/types";
import { useWedgeScanner } from "@/lib/useWedgeScanner";

type Mode = "find" | "in" | "out";

interface LogItem {
  key: number;
  product: Product;
  delta: number;
  stock: number;
  undone?: boolean;
}

const sameCode = (a: string, b: string) => a.replace(/^0+/, "") === b.replace(/^0+/, "");

function ScanInner() {
  const params = useSearchParams();
  const toast = useToast();
  const refresh = useRefresh();
  const { data: products, isLoading } = useProducts();
  const suppliers = useSupplierMap();
  const [mode, setMode] = useState<Mode>("find");
  const [camera, setCamera] = useState(true);
  const [manual, setManual] = useState("");
  const [result, setResult] = useState<{ code: string; product?: Product } | null>(null);
  const [log, setLog] = useState<LogItem[]>([]);
  const seq = useRef(0);
  const handledParam = useRef(false);

  const find = useCallback(
    (code: string) => (products ?? []).find((p) => p.barcode && sameCode(p.barcode, code)),
    [products],
  );

  const handle = useCallback(
    async (raw: string) => {
      const code = raw.trim();
      if (!code) return;
      const product = find(code);
      setResult({ code, product });
      if (!product || mode === "find") return;
      const delta = mode === "in" ? 1 : -1;
      try {
        const stock = await store().addMove({
          product_id: product.id,
          kind: mode,
          qty: delta,
          memo: "스캔",
        });
        setLog((l) => [{ key: ++seq.current, product, delta, stock }, ...l].slice(0, 50));
        void refresh("products", "moves");
      } catch (e) {
        toast(e instanceof Error ? e.message : "재고를 바꾸지 못했어요", "sad");
      }
    },
    [find, mode, refresh, toast],
  );

  useWedgeScanner((code) => {
    beep();
    void handle(code);
  });

  useEffect(() => {
    const code = params.get("code");
    if (code && products && !handledParam.current) {
      handledParam.current = true;
      void handle(code);
    }
  }, [params, products, handle]);

  async function undo(item: LogItem) {
    try {
      await store().addMove({
        product_id: item.product.id,
        kind: item.delta > 0 ? "out" : "in",
        qty: -item.delta,
        memo: "스캔 되돌리기",
      });
      setLog((l) => l.map((x) => (x.key === item.key ? { ...x, undone: true } : x)));
      void refresh("products", "moves");
    } catch (e) {
      toast(e instanceof Error ? e.message : "되돌리지 못했어요", "sad");
    }
  }

  const live = result?.product ? (products ?? []).find((p) => p.id === result.product?.id) ?? result.product : undefined;
  const supplier = live?.supplier_id ? suppliers.get(live.supplier_id) : undefined;
  const totals = log
    .filter((l) => !l.undone)
    .reduce<Map<string, { product: Product; qty: number }>>((acc, l) => {
      const cur = acc.get(l.product.id) ?? { product: l.product, qty: 0 };
      acc.set(l.product.id, { ...cur, qty: cur.qty + l.delta });
      return acc;
    }, new Map());

  if (isLoading) return <Loading />;

  return (
    <div>
      <PageHeader
        title="바코드 스캔"
        right={
          <button
            type="button"
            className="btn-soft btn-sm px-2.5"
            aria-label={camera ? "카메라 끄기" : "카메라 켜기"}
            onClick={() => setCamera((c) => !c)}
          >
            {camera ? <CameraOff size={18} /> : <Camera size={18} />}
          </button>
        }
      />
      <div className="space-y-3">
        <Segmented<Mode>
          value={mode}
          onChange={(m) => {
            setMode(m);
            setResult(null);
          }}
          options={[
            { value: "find", label: "🔍 상품 찾기" },
            { value: "in", label: "📦 입고 +1" },
            { value: "out", label: "🛍️ 출고 −1" },
          ]}
        />
        {mode !== "find" && (
          <p className="rounded-2xl bg-butter-100 px-3 py-2 text-center text-sm text-butter-700">
            {mode === "in" ? "찍을 때마다 재고가 1개씩 늘어나요" : "찍을 때마다 재고가 1개씩 줄어요"}
          </p>
        )}

        {camera && <BarcodeScanner className="aspect-[4/3] max-h-[46vh] w-full" onDetected={(c) => void handle(c)} />}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handle(manual);
            setManual("");
          }}
          className="flex gap-2"
        >
          <input
            className="input font-mono tabular-nums"
            inputMode="numeric"
            placeholder="바코드 직접 입력 · USB 스캐너도 OK"
            value={manual}
            onChange={(e) => setManual(e.target.value)}
          />
          <button type="submit" className="btn-primary shrink-0">
            찾기
          </button>
        </form>

        {result &&
          (live ? (
            <section className="card animate-pop-in p-3">
              <Link href={`/products/${live.id}`} className="flex items-center gap-3">
                <ProductThumb product={live} className="h-20 w-20" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-cute text-lg">{live.name}</p>
                  <p className="font-cute text-xl tabular-nums text-berry-600">{won(live.sale_price)}</p>
                  <div className="mt-0.5 flex items-center gap-1">
                    <StockBadge product={live} />
                    <span className="text-xs text-ink-faint">원가 {won(live.cost_price)}</span>
                  </div>
                </div>
              </Link>
              <div className="mt-3 rounded-2xl bg-cream p-3 text-sm">
                <span className="text-ink-soft">산 곳 </span>
                <b>{supplier ? `${supplier.name} (${KIND_LABEL[supplier.kind]})` : "미지정"}</b>
                {live.supplier_sku && <p className="mt-0.5 truncate text-xs text-ink-soft">{live.supplier_sku}</p>}
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {live.purchase_url ? (
                  <a href={ensureUrl(live.purchase_url)} target="_blank" rel="noreferrer" className="btn-primary btn-sm">
                    <ShoppingBasket size={16} /> 다시 주문
                  </a>
                ) : (
                  <Link href={`/products/${live.id}`} className="btn-primary btn-sm">
                    상세 보기
                  </Link>
                )}
                <Link href={`/products/${live.id}/edit`} className="btn-soft btn-sm">
                  <Pencil size={16} /> 수정
                </Link>
              </div>
            </section>
          ) : (
            <section className="card flex animate-pop-in flex-col items-center p-5 text-center">
              <Mascot mood="sad" size={72} />
              <p className="mt-2 font-cute text-lg">등록 안 된 바코드예요</p>
              <p className="font-mono text-sm text-ink-soft">{result.code}</p>
              <Link href={`/products/new?barcode=${encodeURIComponent(result.code)}`} className="btn-primary mt-3">
                <Plus size={18} /> 이 바코드로 새 상품 등록
              </Link>
            </section>
          ))}

        {totals.size > 0 && (
          <section className="card p-3">
            <p className="mb-2 font-cute">이번에 스캔한 것</p>
            <ul className="space-y-1.5 text-sm">
              {[...totals.values()].map((t) => (
                <li key={t.product.id} className="flex items-center gap-2">
                  <span className="flex-1 truncate">{t.product.name}</span>
                  <span className={`font-cute tabular-nums ${t.qty >= 0 ? "text-matcha-700" : "text-berry-600"}`}>
                    {t.qty > 0 ? "+" : ""}
                    {num(t.qty)}
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-3 border-t-2 border-dashed border-line pt-2">
              {log.slice(0, 5).map((l) => (
                <div key={l.key} className="flex items-center gap-2 py-1 text-xs text-ink-soft">
                  <span className={`flex-1 truncate ${l.undone ? "line-through" : ""}`}>
                    {l.product.name} {l.delta > 0 ? "+1" : "−1"} → {num(l.stock)}개
                  </span>
                  {!l.undone && (
                    <button type="button" className="flex items-center gap-0.5 text-berry-600" onClick={() => undo(l)}>
                      <Undo2 size={12} /> 되돌리기
                    </button>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

export default function ScanPage() {
  return (
    <Suspense fallback={<Loading />}>
      <ScanInner />
    </Suspense>
  );
}
