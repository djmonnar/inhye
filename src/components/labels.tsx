"use client";

import { SlidersHorizontal } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { won } from "@/lib/format";
import { renderLabelCanvas, type LabelShow, type LabelStyle } from "@/lib/labelCanvas";
import { buildTsplJob, canvasToMono } from "@/lib/tspl";
import type { Product } from "@/lib/types";
import { BarcodeSvg } from "./BarcodeSvg";
import { Toggle } from "./ui";

export interface Preset {
  id: string;
  label: string;
  /** label size in mm */
  w: number;
  h: number;
  /** A4 sheet layout; absent = one label per page (라벨 프린터 롤) */
  sheet?: { cols: number; rows: number; top: number; left: number; gapX: number; gapY: number };
}

export const PRESETS: Preset[] = [
  { id: "roll-40x30", label: "롤 40×30", w: 40, h: 30 },
  { id: "roll-50x30", label: "롤 50×30", w: 50, h: 30 },
  { id: "roll-60x40", label: "롤 60×40", w: 60, h: 40 },
  { id: "a4-21", label: "A4 21칸", w: 63.5, h: 38.1, sheet: { cols: 3, rows: 7, top: 15.1, left: 7.2, gapX: 2.5, gapY: 0 } },
  { id: "a4-40", label: "A4 40칸", w: 48.5, h: 25.4, sheet: { cols: 4, rows: 10, top: 21.5, left: 8, gapX: 0, gapY: 0 } },
];

export interface UsbSettings {
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

export function writePref(key: string, value: unknown) {
  try {
    localStorage.setItem(key, typeof value === "string" ? value : JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

export function readPref(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** 라벨 크기·표시 항목·USB 설정 — 기기마다 저장돼요 (라벨 화면과 인쇄 스테이션이 같이 씀). */
export function usePrintSettings(sheetsAllowed: boolean) {
  const [presetId, setPresetIdState] = useState("roll-40x30");
  const [custom, setCustomState] = useState({ w: 40, h: 30 });
  const [show, setShowState] = useState<LabelShow>({ name: true, price: true, barcode: true });
  const [usb, setUsb] = useState<UsbSettings>(DEFAULT_USB);

  useEffect(() => {
    const saved = readPref("popo.labelPreset");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- restore per-device preferences after mount
    if (saved && (saved === "custom" || PRESETS.some((p) => p.id === saved))) setPresetIdState(saved);
    setCustomState(readJson("popo.labelCustom", { w: 40, h: 30 }));
    setShowState(readJson("popo.labelShow", { name: true, price: true, barcode: true }));
    setUsb(readJson("popo.usbPrint", DEFAULT_USB));
  }, []);

  const presets = useMemo(() => {
    const all = [...PRESETS, { id: "custom", label: `직접 ${custom.w}×${custom.h}`, w: custom.w, h: custom.h }];
    return sheetsAllowed ? all : all.filter((p) => !p.sheet);
  }, [custom, sheetsAllowed]);
  const preset = presets.find((p) => p.id === presetId) ?? presets[0];

  const setPresetId = useCallback((id: string) => {
    setPresetIdState(id);
    writePref("popo.labelPreset", id);
  }, []);
  const setCustom = useCallback((patch: Partial<{ w: number; h: number }>) => {
    setCustomState((c) => {
      const next = { ...c, ...patch };
      writePref("popo.labelCustom", next);
      return next;
    });
  }, []);
  const setShow = useCallback((patch: Partial<LabelShow>) => {
    setShowState((s) => {
      const next = { ...s, ...patch };
      writePref("popo.labelShow", next);
      return next;
    });
  }, []);
  const updateUsb = useCallback((patch: Partial<UsbSettings>) => {
    setUsb((cur) => {
      const next = { ...cur, ...patch };
      writePref("popo.usbPrint", next);
      return next;
    });
  }, []);

  return { presets, preset, setPresetId, custom, setCustom, show, setShow, usb, updateUsb };
}

export function LabelFace({ p, preset, show, style }: { p: Product; preset: Preset; show: LabelShow; style: LabelStyle }) {
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

export interface PrintItem {
  p: Product;
  style: LabelStyle;
}

/** 브라우저 인쇄용: <body> 바로 아래에 라벨만 그려두고, 인쇄할 때만 보여요. */
export function LabelPrintPortal({ items, preset, show }: { items: PrintItem[]; preset: Preset; show: LabelShow }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- portal target exists only after mount
    setMounted(true);
  }, []);
  if (!mounted) return null;

  const pageCss = preset.sheet ? `@page { size: A4; margin: 0; }` : `@page { size: ${preset.w}mm ${preset.h}mm; margin: 0; }`;
  let content;
  if (preset.sheet) {
    const s = preset.sheet;
    const per = s.cols * s.rows;
    const sheets: PrintItem[][] = [];
    for (let i = 0; i < items.length; i += per) sheets.push(items.slice(i, i + per));
    content = sheets.map((sheet, si) => (
      <div key={si} style={{ width: "210mm", height: "297mm", position: "relative", breakAfter: "page", overflow: "hidden" }}>
        {sheet.map((it, i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              left: `${s.left + (i % s.cols) * (preset.w + s.gapX)}mm`,
              top: `${s.top + Math.floor(i / s.cols) * (preset.h + s.gapY)}mm`,
              width: `${preset.w}mm`,
              height: `${preset.h}mm`,
            }}
          >
            <LabelFace p={it.p} preset={preset} show={show} style={it.style} />
          </div>
        ))}
      </div>
    ));
  } else {
    content = items.map((it, i) => (
      <div key={i} style={{ width: `${preset.w}mm`, height: `${preset.h}mm`, breakAfter: "page", overflow: "hidden" }}>
        <LabelFace p={it.p} preset={preset} show={show} style={it.style} />
      </div>
    ));
  }
  return createPortal(
    <div id="print-root">
      <style>{pageCss}</style>
      {content}
    </div>,
    document.body,
  );
}

/** USB(TSPL)로 보낼 작업: 상품마다 그림 한 장 + 매수 */
export async function buildUsbJobs(
  items: { p: Product; style: LabelStyle; copies: number }[],
  size: { w: number; h: number },
  show: LabelShow,
  usb: UsbSettings,
): Promise<Uint8Array<ArrayBuffer>[]> {
  const jobs: Uint8Array<ArrayBuffer>[] = [];
  for (const it of items) {
    const canvas = await renderLabelCanvas(it.p, size, show, it.style, usb.offsetMm);
    jobs.push(
      buildTsplJob({
        bitmap: canvasToMono(canvas),
        widthMm: size.w,
        heightMm: size.h,
        gapMm: usb.gapMm,
        density: usb.density,
        direction: usb.direction,
        invert: usb.invert,
        copies: it.copies,
      }),
    );
  }
  return jobs;
}

export function NumberField({
  label,
  value,
  onChange,
  step = 1,
  min,
  max,
  unit,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  step?: number;
  min: number;
  max: number;
  unit?: string;
}) {
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

export function PresetPicker({ settings }: { settings: ReturnType<typeof usePrintSettings> }) {
  const { presets, preset, setPresetId, custom, setCustom, show, setShow } = settings;
  return (
    <>
      <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1">
        {presets.map((p) => (
          <button type="button" key={p.id} className="chip" data-on={preset.id === p.id} onClick={() => setPresetId(p.id)}>
            {p.label}
          </button>
        ))}
      </div>
      {preset.id === "custom" && (
        <div className="grid grid-cols-2 gap-2">
          <NumberField label="가로" unit="mm" min={15} max={104} value={custom.w} onChange={(w) => setCustom({ w })} />
          <NumberField label="세로" unit="mm" min={10} max={200} value={custom.h} onChange={(h) => setCustom({ h })} />
        </div>
      )}
      <div className="grid grid-cols-3 gap-x-3">
        <Toggle checked={show.name} onChange={(v) => setShow({ name: v })} label="이름" />
        <Toggle checked={show.price} onChange={(v) => setShow({ price: v })} label="가격" />
        <Toggle checked={show.barcode} onChange={(v) => setShow({ barcode: v })} label="바코드" />
      </div>
    </>
  );
}

export function UsbSettingsPanel({
  usb,
  updateUsb,
  onTest,
  busy,
}: {
  usb: UsbSettings;
  updateUsb: (patch: Partial<UsbSettings>) => void;
  onTest: () => void;
  busy: boolean;
}) {
  return (
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
        <button type="button" className="btn-soft btn-sm w-full" disabled={busy} onClick={onTest}>
          테스트 라벨 1장 (테두리·십자선)
        </button>
        <p className="text-xs text-ink-soft">
          테두리가 라벨 안에 꽉 차게 나오면 맞은 거예요. 한쪽으로 치우치면 ‘좌우 위치’를, 라벨이 밀리면 ‘간격’을 조절해 주세요.
          라벨 크기가 바뀌면 프린터의 FEED 버튼을 길게 눌러 용지를 다시 인식시켜 주세요.
        </p>
      </div>
    </details>
  );
}

/**
 * Waits for barcode SVGs to render, then opens the print dialog (blocks until it closes).
 * Uses a timer, not requestAnimationFrame: rAF pauses while the station window is behind
 * other windows, which would stall auto-printing.
 */
export async function printNow() {
  await new Promise((r) => setTimeout(r, 250));
  window.print();
}
