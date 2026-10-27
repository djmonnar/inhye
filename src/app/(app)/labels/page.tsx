"use client";

import { Printer, Search, SlidersHorizontal, Sparkles, Usb, X } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { BarcodeSvg } from "@/components/BarcodeSvg";
import { useToast } from "@/components/providers";
import { toInput } from "@/components/ProductForm";
import { Loading, PageHeader, ProductThumb, Segmented, Toggle } from "@/components/ui";
import { nextStoreBarcode, searchText, won } from "@/lib/format";
import { renderLabelCanvas, renderTestCanvas, type LabelShow, type LabelStyle } from "@/lib/labelCanvas";
import { useProducts, useRefresh } from "@/lib/queries";
import { store } from "@/lib/store";
import { buildTsplJob, canvasToMono, concatJobs } from "@/lib/tspl";
import type { Product } from "@/lib/types";
import { deviceLabel, getPrinter, sendToPrinter, usbAvailable } from "@/lib/usbPrinter";

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

type Method = "print" | "usb";

interface UsbSettings {
  gapMm: number;
  density: number;
  offsetMm: number;
  direction: 0 | 1;
  invert: boolean;
}

const DEFAULT_USB: UsbSettings = { gapMm: 2, density: 8, offsetMm: 0, direction: 0, invert: false };

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, typeof value === "string" ? value : JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

function LabelFace({ p, preset, show, style }: { p: Product; preset: Preset; show: LabelShow; style: LabelStyle }) {
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

function NumberField({ label, value, onChange, step = 1, min, max, unit }: { label: string; value: number; onChange: (n: number) => void; step?: number; min: number; max: number; unit?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-ink-soft">{label}</span>
      <span className="relative block">
        <input
          type="number"
          inputMode="decimal"
          className="input py-2 pr-10 text-center tabular-nums"
          value={value}
          step={step}
          min={min}
          max={max}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (Number.isFinite(n)) onChange(Math.min(max, Math.max(min, n)));
          }}
        />
        {unit && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-ink-soft">{unit}</span>}
      </span>
    </label>
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
  const [custom, setCustom] = useState({ w: 40, h: 30 });
  const [style, setStyle] = useState<LabelStyle>("label");
  const [show, setShow] = useState<LabelShow>({ name: true, price: true, barcode: true });
  const [method, setMethod] = useState<Method>("print");
  const [usb, setUsb] = useState<UsbSettings>(DEFAULT_USB);
  const [usbOk, setUsbOk] = useState(false);
  const [device, setDevice] = useState<USBDevice | null>(null);
  const [sending, setSending] = useState(false);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [mounted, setMounted] = useState(false);
  const [fixing, setFixing] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- portal target + device prefs exist only after mount
    setMounted(true);
    setUsbOk(usbAvailable());
    try {
      const saved = localStorage.getItem("popo.labelPreset");
      if (saved && (saved === "custom" || PRESETS.some((p) => p.id === saved))) setPresetId(saved);
      if (localStorage.getItem("popo.printMethod") === "usb" && usbAvailable()) setMethod("usb");
    } catch {
      /* ignore */
    }
    setCustom(readJson("popo.labelCustom", { w: 40, h: 30 }));
    setUsb(readJson("popo.usbPrint", DEFAULT_USB));
    void getPrinter(false).then((d) => d && setDevice(d)).catch(() => {});
    if (!usbAvailable()) return;
    const onDisconnect = (e: USBConnectionEvent) => setDevice((cur) => (cur === e.device ? null : cur));
    navigator.usb.addEventListener("disconnect", onDisconnect);
    return () => navigator.usb.removeEventListener("disconnect", onDisconnect);
  }, []);

  useEffect(() => {
    const ids = params.get("ids");
    if (ids) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- preselect from ?ids=
      setCopies(Object.fromEntries(ids.split(",").filter(Boolean).map((id) => [id, 1])));
    }
  }, [params]);

  const presets = useMemo(() => {
    const all = [...PRESETS, { id: "custom", label: `직접 ${custom.w}×${custom.h}`, w: custom.w, h: custom.h }];
    return method === "usb" ? all.filter((p) => !p.sheet) : all;
  }, [custom, method]);
  const preset = presets.find((p) => p.id === presetId) ?? presets[0];
  const size = { w: preset.w, h: preset.h };
  const selected = products.filter((p) => copies[p.id] > 0);
  const missingBarcode = selected.filter((p) => !p.barcode);
  const labels = selected.flatMap((p) => Array.from({ length: copies[p.id] }, () => p));
  const results = useMemo(() => {
    const needle = searchText(q);
    return products.filter((p) => !needle || searchText(p.name, p.barcode, p.category).includes(needle)).slice(0, 60);
  }, [products, q]);
  const previewKey = selected.map((p) => `${p.id}:${p.name}:${p.barcode}:${p.sale_price}`).join("|");

  // USB 방식은 프린터로 보낼 그림을 그대로 미리 보여줘요.
  useEffect(() => {
    if (method !== "usb" || !selected.length) return;
    let alive = true;
    (async () => {
      const out: Record<string, string> = {};
      for (const p of selected.slice(0, 8)) {
        const c = await renderLabelCanvas(p, size, show, style, usb.offsetMm);
        out[p.id] = c.toDataURL("image/png");
      }
      if (alive) setPreviews(out);
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [method, previewKey, size.w, size.h, show, style, usb.offsetMm]);

  function updateUsb(patch: Partial<UsbSettings>) {
    setUsb((cur) => {
      const next = { ...cur, ...patch };
      writeJson("popo.usbPrint", next);
      return next;
    });
  }

  async function connect(): Promise<USBDevice | null> {
    try {
      const d = await getPrinter(true);
      if (d) {
        setDevice(d);
        toast(`${deviceLabel(d)} 연결했어요`, "wow");
      }
      return d;
    } catch (e) {
      toast(e instanceof Error ? e.message : "프린터를 연결하지 못했어요", "sad");
      return null;
    }
  }

  async function send(makeJobs: () => Promise<Uint8Array<ArrayBuffer>[]>, count: number) {
    const dev = device ?? (await connect());
    if (!dev) return;
    setSending(true);
    try {
      await sendToPrinter(dev, concatJobs(await makeJobs()));
      toast(`${count}장 프린터로 보냈어요!`, "wow");
    } catch (e) {
      toast(e instanceof Error ? e.message : "인쇄하지 못했어요", "sad");
    } finally {
      setSending(false);
    }
  }

  const tsplOpts = { widthMm: size.w, heightMm: size.h, gapMm: usb.gapMm, density: usb.density, direction: usb.direction, invert: usb.invert };

  function printUsb() {
    void send(async () => {
      const jobs = [];
      for (const p of selected) {
        const c = await renderLabelCanvas(p, size, show, style, usb.offsetMm);
        jobs.push(buildTsplJob({ ...tsplOpts, bitmap: canvasToMono(c), copies: copies[p.id] }));
      }
      return jobs;
    }, labels.length);
  }

  function printTest() {
    void send(async () => [buildTsplJob({ ...tsplOpts, bitmap: canvasToMono(await renderTestCanvas(size, usb.offsetMm)), copies: 1 })], 1);
  }

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

  const pageCss = preset.sheet ? `@page { size: A4; margin: 0; }` : `@page { size: ${preset.w}mm ${preset.h}mm; margin: 0; }`;

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
          <div>
            <p className="label">인쇄 방법</p>
            <Segmented<Method>
              value={method}
              onChange={(m) => {
                setMethod(m);
                writeJson("popo.printMethod", m);
              }}
              options={[
                { value: "print", label: "🖨️ 인쇄 창 (PC)" },
                { value: "usb", label: "🔌 USB 바로 (폰)" },
              ]}
            />
          </div>
          <Segmented<LabelStyle>
            value={style}
            onChange={setStyle}
            options={[
              { value: "label", label: "🏷️ 바코드 라벨" },
              { value: "price", label: "💰 가격표" },
            ]}
          />
          <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1">
            {presets.map((p) => (
              <button
                type="button"
                key={p.id}
                className="chip"
                data-on={preset.id === p.id}
                onClick={() => {
                  setPresetId(p.id);
                  writeJson("popo.labelPreset", p.id);
                }}
              >
                {p.label}
              </button>
            ))}
          </div>
          {preset.id === "custom" && (
            <div className="grid grid-cols-2 gap-2">
              <NumberField label="가로" unit="mm" min={15} max={104} value={custom.w} onChange={(w) => setCustom((c) => { const n = { ...c, w }; writeJson("popo.labelCustom", n); return n; })} />
              <NumberField label="세로" unit="mm" min={10} max={200} value={custom.h} onChange={(h) => setCustom((c) => { const n = { ...c, h }; writeJson("popo.labelCustom", n); return n; })} />
            </div>
          )}
          <div className="grid grid-cols-3 gap-x-3">
            <Toggle checked={show.name} onChange={(v) => setShow((s) => ({ ...s, name: v }))} label="이름" />
            <Toggle checked={show.price} onChange={(v) => setShow((s) => ({ ...s, price: v }))} label="가격" />
            <Toggle checked={show.barcode} onChange={(v) => setShow((s) => ({ ...s, barcode: v }))} label="바코드" />
          </div>
        </section>

        {method === "usb" && (
          <section className="card space-y-3 p-4">
            {!usbOk ? (
              <div className="rounded-2xl bg-butter-100 p-3 text-sm text-butter-700">
                이 브라우저는 USB 직접 인쇄가 안 돼요. <b>안드로이드 폰·태블릿의 크롬</b>에서 열어 주세요. (아이폰은 불가, PC는
                ‘인쇄 창’ 방식)
              </div>
            ) : (
              <>
                <div className="flex items-center gap-3">
                  <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${device ? "bg-matcha-100 text-matcha-700" : "bg-cream-deep text-ink-faint"}`}>
                    <Usb size={22} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-cute text-[16px]">{device ? deviceLabel(device) : "프린터 연결 안 됨"}</p>
                    <p className="text-xs text-ink-soft">{device ? "연결됨 · 바로 인쇄할 수 있어요" : "OTG 젠더로 프린터를 폰에 꽂고 ‘연결’"}</p>
                  </div>
                  <button type="button" className="btn-soft btn-sm" onClick={() => void connect()}>
                    {device ? "다시 선택" : "연결"}
                  </button>
                </div>
                <details className="rounded-2xl bg-cream p-3">
                  <summary className="flex cursor-pointer list-none items-center gap-1.5 font-cute text-[15px]">
                    <SlidersHorizontal size={16} /> 인쇄 설정 <span className="text-xs text-ink-soft">(처음 한 번 맞추기)</span>
                  </summary>
                  <div className="mt-3 space-y-3">
                    <div className="grid grid-cols-3 gap-2">
                      <NumberField label="라벨 사이 간격" unit="mm" step={0.5} min={0} max={10} value={usb.gapMm} onChange={(gapMm) => updateUsb({ gapMm })} />
                      <NumberField label="진하기 (0~15)" min={0} max={15} value={usb.density} onChange={(density) => updateUsb({ density })} />
                      <NumberField label="좌우 위치" unit="mm" step={0.5} min={-10} max={10} value={usb.offsetMm} onChange={(offsetMm) => updateUsb({ offsetMm })} />
                    </div>
                    <Toggle checked={usb.direction === 1} onChange={(v) => updateUsb({ direction: v ? 1 : 0 })} label="위아래 뒤집기" desc="글자가 거꾸로 나오면 켜요" />
                    <Toggle checked={usb.invert} onChange={(v) => updateUsb({ invert: v })} label="흑백 반전" desc="바탕이 까맣게 나오면 켜요" />
                    <button type="button" className="btn-soft btn-sm w-full" disabled={sending} onClick={printTest}>
                      테스트 라벨 1장 (테두리·십자선)
                    </button>
                    <p className="text-xs text-ink-soft">
                      테두리가 라벨 안에 꽉 차게 나오면 맞은 거예요. 한쪽으로 치우치면 ‘좌우 위치’를, 라벨이 밀리면 ‘간격’을
                      조절해 주세요. 라벨 크기가 바뀌면 프린터의 FEED 버튼을 길게 눌러 용지를 다시 인식시켜 주세요.
                    </p>
                  </div>
                </details>
              </>
            )}
          </section>
        )}

        {/* 미리보기 */}
        {labels.length > 0 && (
          <section className="card p-4">
            <p className="mb-2 font-cute">미리보기 {method === "usb" && <span className="text-xs text-ink-soft">(프린터로 가는 그림 그대로)</span>}</p>
            <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
              {selected.map((p) =>
                method === "usb" ? (
                  previews[p.id] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={p.id}
                      src={previews[p.id]}
                      alt={`${p.name} 라벨`}
                      className="shrink-0 rounded-md border border-dashed border-ink-faint bg-white"
                      style={{ width: `${preset.w}mm`, height: `${preset.h}mm`, imageRendering: "pixelated" }}
                    />
                  ) : (
                    <div key={p.id} className="shrink-0 rounded-md border border-dashed border-ink-faint bg-white" style={{ width: `${preset.w}mm`, height: `${preset.h}mm` }} />
                  )
                ) : (
                  <div key={p.id} className="shrink-0 rounded-md border border-dashed border-ink-faint bg-white" style={{ width: `${preset.w}mm`, height: `${preset.h}mm` }}>
                    <LabelFace p={p} preset={preset} show={show} style={style} />
                  </div>
                ),
              )}
            </div>
            {missingBarcode.length > 0 && show.barcode && (
              <button type="button" className="btn-soft btn-sm mt-3 w-full" disabled={fixing} onClick={fixBarcodes}>
                <Sparkles size={16} /> 바코드 없는 {missingBarcode.length}개에 매장용 바코드 만들기
              </button>
            )}
            {method === "usb" ? (
              <button type="button" className="btn-primary mt-3 w-full text-lg" disabled={!usbOk || sending} onClick={printUsb}>
                <Usb size={20} /> {sending ? "보내는 중..." : `${labels.length}장 바로 인쇄`}
              </button>
            ) : (
              <>
                <button type="button" className="btn-primary mt-3 w-full text-lg" onClick={() => window.print()}>
                  <Printer size={20} /> {labels.length}장 인쇄하기
                </button>
                <p className="mt-2 text-xs text-ink-soft">
                  인쇄 창에서 프린터(Xprinter 등 라벨 프린터)와 용지 크기를 고르고, 배율은 ‘100%/실제 크기’로 맞춰 주세요.
                </p>
              </>
            )}
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
        method === "print" &&
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
