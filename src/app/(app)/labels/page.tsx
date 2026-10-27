"use client";

import { Printer, Search, Sparkles, X } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { BarcodeSvg } from "@/components/BarcodeSvg";
import { useToast } from "@/components/providers";
import { toInput } from "@/components/ProductForm";
import { Loading, PageHeader, ProductThumb, Segmented, Toggle } from "@/components/ui";
import { nextStoreBarcode, searchText, won } from "@/lib/format";
import { useProducts, useRefresh } from "@/lib/queries";
import { store } from "@/lib/store";
import type { Product } from "@/lib/types";

interface Preset {
  id: string;
  label: string;
  /** label size in mm */
  w: number;
  h: number;
  /** A4 sheet layout; absent = one label per page (라벨 프린터 롤) */
  sheet?: { cols: number; rows: number; top: number; left: number; gapX: number; gapY: number };
}

const PRESETS: Preset[] = [
  { id: "roll-40x30", label: "롤 40×30", w: 40, h: 30 },
  { id: "roll-50x30", label: "롤 50×30", w: 50, h: 30 },
  { id: "roll-60x40", label: "롤 60×40", w: 60, h: 40 },
  { id: "a4-21", label: "A4 21칸", w: 63.5, h: 38.1, sheet: { cols: 3, rows: 7, top: 15.1, left: 7.2, gapX: 2.5, gapY: 0 } },
  { id: "a4-40", label: "A4 40칸", w: 48.5, h: 25.4, sheet: { cols: 4, rows: 10, top: 21.5, left: 8, gapX: 0, gapY: 0 } },
];

type Style = "label" | "price";

function LabelFace({ p, preset, show, style }: { p: Product; preset: Preset; show: { name: boolean; price: boolean; barcode: boolean }; style: Style }) {
  const small = preset.h < 30;
  if (style === "price") {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center overflow-hidden px-[2mm] text-center text-black">
        {show.name && <div className={`line-clamp-2 font-semibold leading-tight ${small ? "text-[7pt]" : "text-[9pt]"}`}>{p.name}</div>}
        {show.price && <div className={`font-cute leading-none ${small ? "text-[14pt]" : "text-[20pt]"}`}>{won(p.sale_price)}</div>}
        {show.barcode && p.barcode && (
          <BarcodeSvg value={p.barcode} height={small ? 14 : 20} width={1} fontSize={8} displayValue={false} className="mt-[0.5mm] max-h-[6mm] max-w-full" />
        )}
      </div>
    );
  }
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-[0.6mm] overflow-hidden px-[1.5mm] py-[1mm] text-center text-black">
      {show.name && <div className={`line-clamp-1 w-full font-semibold leading-tight ${small ? "text-[6.5pt]" : "text-[8pt]"}`}>{p.name}</div>}
      {show.barcode && p.barcode ? (
        <BarcodeSvg value={p.barcode} height={small ? 26 : 40} width={1.3} fontSize={small ? 9 : 11} className="max-h-[70%] max-w-full" />
      ) : show.barcode ? (
        <div className="text-[6pt] text-gray-400">바코드 없음</div>
      ) : null}
      {show.price && <div className={`font-bold leading-none ${small ? "text-[8pt]" : "text-[10pt]"}`}>{won(p.sale_price)}</div>}
    </div>
  );
}

function LabelsInner() {
  const params = useSearchParams();
  const toast = useToast();
  const refresh = useRefresh();
  const { data: products = [], isLoading } = useProducts();
  const [copies, setCopies] = useState<Record<string, number>>({});
  const [q, setQ] = useState("");
  const [presetId, setPresetId] = useState("roll-40x30");
  const [style, setStyle] = useState<Style>("label");
  const [show, setShow] = useState({ name: true, price: true, barcode: true });
  const [mounted, setMounted] = useState(false);
  const [fixing, setFixing] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- portal target exists only after mount
    setMounted(true);
    try {
      const saved = localStorage.getItem("mongsil.labelPreset");
      if (saved && PRESETS.some((p) => p.id === saved)) setPresetId(saved);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    const ids = params.get("ids");
    if (ids) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- preselect from ?ids=
      setCopies(Object.fromEntries(ids.split(",").filter(Boolean).map((id) => [id, 1])));
    }
  }, [params]);

  const preset = PRESETS.find((p) => p.id === presetId) ?? PRESETS[0];
  const selected = products.filter((p) => copies[p.id] > 0);
  const missingBarcode = selected.filter((p) => !p.barcode);
  const labels = selected.flatMap((p) => Array.from({ length: copies[p.id] }, () => p));
  const results = useMemo(() => {
    const needle = searchText(q);
    return products.filter((p) => !needle || searchText(p.name, p.barcode, p.category).includes(needle)).slice(0, 60);
  }, [products, q]);

  async function fixBarcodes() {
    setFixing(true);
    try {
      let pool = [...products];
      for (const p of missingBarcode) {
        const code = nextStoreBarcode(pool);
        const saved = await store().saveProduct({ ...toInput(p), barcode: code }, p.id);
        pool = pool.map((x) => (x.id === p.id ? saved : x));
      }
      await refresh("products");
      toast(`${missingBarcode.length}개 상품에 바코드를 만들었어요`, "wow");
    } catch (e) {
      toast(e instanceof Error ? e.message : "바코드를 만들지 못했어요", "sad");
    } finally {
      setFixing(false);
    }
  }

  const pageCss = preset.sheet
    ? `@page { size: A4; margin: 0; }`
    : `@page { size: ${preset.w}mm ${preset.h}mm; margin: 0; }`;

  const sheets: Product[][] = [];
  if (preset.sheet) {
    const per = preset.sheet.cols * preset.sheet.rows;
    for (let i = 0; i < labels.length; i += per) sheets.push(labels.slice(i, i + per));
  }

  const printContent = preset.sheet ? (
    sheets.map((sheet, si) => (
      <div key={si} style={{ width: "210mm", height: "297mm", position: "relative", breakAfter: "page", overflow: "hidden" }}>
        {sheet.map((p, i) => {
          const s = preset.sheet!;
          const col = i % s.cols;
          const row = Math.floor(i / s.cols);
          return (
            <div
              key={i}
              style={{
                position: "absolute",
                left: `${s.left + col * (preset.w + s.gapX)}mm`,
                top: `${s.top + row * (preset.h + s.gapY)}mm`,
                width: `${preset.w}mm`,
                height: `${preset.h}mm`,
              }}
            >
              <LabelFace p={p} preset={preset} show={show} style={style} />
            </div>
          );
        })}
      </div>
    ))
  ) : (
    labels.map((p, i) => (
      <div key={i} style={{ width: `${preset.w}mm`, height: `${preset.h}mm`, breakAfter: "page", overflow: "hidden" }}>
        <LabelFace p={p} preset={preset} show={show} style={style} />
      </div>
    ))
  );

  if (isLoading) return <Loading />;

  return (
    <div>
      <PageHeader back title="라벨 · 가격표 인쇄" sub={labels.length ? `라벨 ${labels.length}장` : undefined} />
      <div className="space-y-4">
        <section className="card space-y-3 p-4">
          <Segmented<Style>
            value={style}
            onChange={setStyle}
            options={[
              { value: "label", label: "🏷️ 바코드 라벨" },
              { value: "price", label: "💰 가격표" },
            ]}
          />
          <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1">
            {PRESETS.map((p) => (
              <button
                type="button"
                key={p.id}
                className="chip"
                data-on={presetId === p.id}
                onClick={() => {
                  setPresetId(p.id);
                  try {
                    localStorage.setItem("mongsil.labelPreset", p.id);
                  } catch {
                    /* ignore */
                  }
                }}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-x-3">
            <Toggle checked={show.name} onChange={(v) => setShow((s) => ({ ...s, name: v }))} label="이름" />
            <Toggle checked={show.price} onChange={(v) => setShow((s) => ({ ...s, price: v }))} label="가격" />
            <Toggle checked={show.barcode} onChange={(v) => setShow((s) => ({ ...s, barcode: v }))} label="바코드" />
          </div>
        </section>

        {/* 미리보기 */}
        {labels.length > 0 && (
          <section className="card p-4">
            <p className="mb-2 font-cute">미리보기</p>
            <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
              {selected.map((p) => (
                <div
                  key={p.id}
                  className="shrink-0 rounded-md border border-dashed border-ink-faint bg-white"
                  style={{ width: `${preset.w}mm`, height: `${preset.h}mm` }}
                >
                  <LabelFace p={p} preset={preset} show={show} style={style} />
                </div>
              ))}
            </div>
            {missingBarcode.length > 0 && show.barcode && (
              <button type="button" className="btn-soft btn-sm mt-3 w-full" disabled={fixing} onClick={fixBarcodes}>
                <Sparkles size={16} /> 바코드 없는 {missingBarcode.length}개에 매장용 바코드 만들기
              </button>
            )}
            <button type="button" className="btn-primary mt-3 w-full text-lg" onClick={() => window.print()}>
              <Printer size={20} /> {labels.length}장 인쇄하기
            </button>
            <p className="mt-2 text-xs text-ink-soft">
              인쇄 창에서 프린터(빅솔론 등 라벨 프린터)와 용지 크기를 고르고, 배율은 ‘100%/실제 크기’로 맞춰 주세요.
            </p>
          </section>
        )}

        {/* 상품 고르기 */}
        <section className="card p-4">
          <p className="mb-2 font-cute">상품 고르기</p>
          <div className="relative mb-2">
            <Search size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-faint" />
            <input className="input pl-10" type="search" placeholder="상품 찾기" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <ul className="divide-y-2 divide-dashed divide-line">
            {results.map((p) => {
              const n = copies[p.id] ?? 0;
              return (
                <li key={p.id} className="flex items-center gap-3 py-2">
                  <ProductThumb product={p} className="h-11 w-11" frame="rounded-xl border-2" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{p.name}</p>
                    <p className="font-mono text-xs text-ink-faint">{p.barcode ?? "바코드 없음"}</p>
                  </div>
                  {n > 0 ? (
                    <div className="flex items-center gap-1">
                      <button type="button" className="btn-soft btn-sm h-8 w-8 px-0" aria-label="한 장 빼기" onClick={() => setCopies((c) => ({ ...c, [p.id]: n - 1 }))}>
                        {n === 1 ? <X size={14} /> : "−"}
                      </button>
                      <span className="w-7 text-center font-cute tabular-nums">{n}</span>
                      <button type="button" className="btn-soft btn-sm h-8 w-8 px-0" aria-label="한 장 더하기" onClick={() => setCopies((c) => ({ ...c, [p.id]: n + 1 }))}>
                        +
                      </button>
                    </div>
                  ) : (
                    <div className="flex gap-1">
                      <button type="button" className="chip" onClick={() => setCopies((c) => ({ ...c, [p.id]: 1 }))}>
                        1장
                      </button>
                      {p.stock_qty > 1 && (
                        <button type="button" className="chip" onClick={() => setCopies((c) => ({ ...c, [p.id]: p.stock_qty }))}>
                          재고만큼 {p.stock_qty}
                        </button>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      </div>

      {mounted &&
        createPortal(
          <div id="print-root">
            <style>{pageCss}</style>
            {printContent}
          </div>,
          document.body,
        )}
    </div>
  );
}

export default function LabelsPage() {
  return (
    <Suspense fallback={<Loading />}>
      <LabelsInner />
    </Suspense>
  );
}
