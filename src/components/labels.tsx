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
  { id: "roll-40x20", label: "롤 40×20 (매장)", w: 40, h: 20 },
  { id: "roll-40x30", label: "롤 40×30", w: 40, h: 30 },
  { id: "roll-50x25", label: "롤 50×25", w: 50, h: 25 },
  { id: "roll-50x30", label: "롤 50×30", w: 50, h: 30 },
  { id: "roll-60x30", label: "롤 60×30", w: 60, h: 30 },
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

/** 브라우저(드라이버) 인쇄 위치 미세 조정 — mm, 오른쪽·아래가 + */
export interface Nudge {
  x: number;
  y: number;
}
const NO_NUDGE: Nudge = { x: 0, y: 0 };

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
/** 매장 롤 라벨 크기 — 사장님 확인: 가로 4cm × 세로 2cm (2026-11-17) */
export const DEFAULT_PRESET = "roll-40x20";
/** 이 기본값으로 한 번 바꿔 줬는지 (예전에 다른 크기를 기억한 기기도 한 번은 40×20으로) */
const PRESET_DEFAULT_MARK = "popo.labelPresetDefault";

export function usePrintSettings(sheetsAllowed: boolean) {
  const [presetId, setPresetIdState] = useState(DEFAULT_PRESET);
  const [custom, setCustomState] = useState({ w: 40, h: 20 });
  const [show, setShowState] = useState<LabelShow>({ name: true, price: true, barcode: true });
  const [usb, setUsb] = useState<UsbSettings>(DEFAULT_USB);
  const [nudge, setNudgeState] = useState<Nudge>(NO_NUDGE);

  useEffect(() => {
    const saved = readPref("popo.labelPreset");
    if (readPref(PRESET_DEFAULT_MARK) !== DEFAULT_PRESET) {
      // 기본 크기가 바뀌었어요 → 이 기기도 한 번은 40×20으로 (그 뒤에 고른 건 기억해요)
      writePref(PRESET_DEFAULT_MARK, DEFAULT_PRESET);
      writePref("popo.labelPreset", DEFAULT_PRESET);
    } else if (saved && (saved === "custom" || PRESETS.some((p) => p.id === saved))) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- restore per-device preferences after mount
      setPresetIdState(saved);
    }
    setCustomState(readJson("popo.labelCustom", { w: 40, h: 20 }));
    setShowState(readJson("popo.labelShow", { name: true, price: true, barcode: true }));
    setUsb(readJson("popo.usbPrint", DEFAULT_USB));
    setNudgeState(readJson("popo.printNudge", NO_NUDGE));
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

  const setNudge = useCallback((patch: Partial<Nudge>) => {
    setNudgeState((cur) => {
      const next = { ...cur, ...patch };
      writePref("popo.printNudge", next);
      return next;
    });
  }, []);

  return { presets, preset, setPresetId, custom, setCustom, show, setShow, usb, updateUsb, nudge, setNudge };
}

export function LabelFace({ p, preset, show, style }: { p: Product; preset: Preset; show: LabelShow; style: LabelStyle }) {
  const small = preset.h < 30;
  if (style === "price") {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center overflow-hidden px-[2mm] text-center text-black">
        {show.name && p.name.trim() !== "" && <div className={`line-clamp-2 font-semibold leading-tight ${small ? "text-[7pt]" : "text-[9pt]"}`}>{p.name}</div>}
        {show.price && p.sale_price > 0 && <div className={`font-cute leading-none ${small ? "text-[14pt]" : "text-[20pt]"}`}>{won(p.sale_price)}</div>}
        {show.barcode && p.barcode && (
          <BarcodeSvg value={p.barcode} height={small ? 14 : 20} width={1} fontSize={8} displayValue={false} className="mt-[0.5mm] max-h-[6mm] max-w-full" />
        )}
      </div>
    );
  }
  // 바코드 라벨 (사장님 예시 라벨과 같게): 맨 위 한 줄 ‘이름 가격’ · 바코드 막대(가로 꽉) · 아래 큰 번호
  //   인쇄는 보통 labelCanvas 그림으로 해요 — 이건 그림이 아직 없을 때 쓰는 화면용
  const line = [show.name ? p.name.trim() : "", show.price && p.sale_price > 0 ? won(p.sale_price) : ""].filter(Boolean).join("  ");
  return (
    <div className="flex h-full w-full flex-col items-center justify-between overflow-hidden px-[1.5mm] py-[1mm] text-center text-black">
      {line && <div className={`line-clamp-1 w-full font-semibold leading-tight ${small ? "text-[8pt]" : "text-[11pt]"}`}>{line}</div>}
      {show.barcode && p.barcode ? (
        <>
          <BarcodeSvg value={p.barcode} height={small ? 26 : 40} width={1.6} displayValue={false} className="min-h-0 w-[88%] flex-1" />
          <div className={`font-semibold leading-none tracking-wide ${small ? "text-[8pt]" : "text-[10pt]"}`}>{p.barcode}</div>
        </>
      ) : show.barcode ? (
        <div className="text-[6pt] text-gray-400">바코드 없음</div>
      ) : null}
    </div>
  );
}

export interface PrintItem {
  p: Product;
  style: LabelStyle;
}

/** 라벨 그림을 찾는 열쇠 — 같은 이름·바코드·가격·모양이면 한 번만 그려요 */
export const labelKey = (p: Pick<Product, "name" | "barcode" | "sale_price">, style: LabelStyle) =>
  `${style}|${p.name}|${p.barcode ?? ""}|${p.sale_price}`;

/**
 * 브라우저 인쇄용 라벨 그림 — USB 직접 인쇄와 같은 203dpi 그림이라 라벨을 꽉 채워요.
 * (전엔 화면용 HTML이라 라벨이 커도 바코드·글자가 작게 가운데만 찍혔어요)
 */
export async function renderLabelImages(
  items: PrintItem[],
  size: { w: number; h: number },
  show: LabelShow,
  nudge: Nudge = NO_NUDGE,
): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const it of items) {
    const k = labelKey(it.p, it.style);
    if (out[k]) continue;
    const c = await renderLabelCanvas(it.p, size, show, it.style, nudge.x, nudge.y);
    out[k] = c.toDataURL("image/png");
  }
  return out;
}

/** 브라우저 인쇄용: <body> 바로 아래에 라벨만 그려두고, 인쇄할 때만 보여요. `images`가 있으면 그 그림으로 꽉 채워요. */
export function LabelPrintPortal({
  items,
  preset,
  show,
  images,
}: {
  items: PrintItem[];
  preset: Preset;
  show: LabelShow;
  images?: Record<string, string>;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- portal target exists only after mount
    setMounted(true);
  }, []);
  if (!mounted) return null;

  const pageCss = preset.sheet ? `@page { size: A4; margin: 0; }` : `@page { size: ${preset.w}mm ${preset.h}mm; margin: 0; }`;
  const face = (it: PrintItem) => {
    const src = images?.[labelKey(it.p, it.style)];
    return src ? (
      // eslint-disable-next-line @next/next/no-img-element -- 인쇄용 그림(data URL)
      <img src={src} alt="" style={{ display: "block", width: "100%", height: "100%", imageRendering: "pixelated" }} />
    ) : (
      <LabelFace p={it.p} preset={preset} show={show} style={it.style} />
    );
  };
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
            {face(it)}
          </div>
        ))}
      </div>
    ));
  } else {
    content = items.map((it, i) => (
      <div key={i} style={{ width: `${preset.w}mm`, height: `${preset.h}mm`, breakAfter: "page", overflow: "hidden" }}>
        {face(it)}
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
      {!preset.sheet && (
        <p className="rounded-2xl bg-cream px-3 py-2 text-xs text-ink-soft">
          📏 지금 <b className="text-ink">{preset.w}×{preset.h}mm</b> — 실제 라벨 한 칸(사이 간격 빼고) 크기, 인쇄 창의 ‘용지 크기’와 셋 다 같아야 꽉 차요. 자로 재서 없으면 ‘직접’으로 넣어요.
        </p>
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
 * 브라우저(윈도우 드라이버) 인쇄 맞추기: 크기 확인 테스트 + 위치 미세 조정 + 맞추는 순서.
 * 라벨이 작게·한쪽에·반쯤 내려가서 나오는 건 거의 다 ‘드라이버 용지 크기 ≠ 라벨’이라 그것부터 안내해요.
 */
export function BrowserFitPanel({ settings, onTest, busy }: { settings: ReturnType<typeof usePrintSettings>; onTest: () => void; busy?: boolean }) {
  const { preset, nudge, setNudge } = settings;
  if (preset.sheet) return null;
  const size = `${preset.w}×${preset.h}`;
  return (
    <details className="rounded-2xl bg-cream p-3 text-sm">
      <summary className="cursor-pointer list-none font-cute text-[15px]">📏 라벨 위치·크기 맞추기 (작게·한쪽에·밀려 나오면)</summary>
      <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-ink-soft">
        <li>
          윈도우 설정 › 프린터 › Xprinter › <b>인쇄 기본 설정</b> › 용지(Page Setup) › <b>새로 만들기</b>(또는 ‘USER’ 고치기): 이름 ‘라벨 {preset.w}x
          {preset.h}’, 가로 {preset.w} · 세로 {preset.h}mm → 확인. 송장용 용지(20센치송장 등)는 그대로 두세요.{" "}
          <b className="text-ink">이게 안 맞으면 라벨이 작게 줄거나 반쯤 내려가서 나와요.</b>
        </li>
        <li>프린터 FEED 버튼을 길게 눌러 라벨 사이 간격을 다시 익히게 해요 (라벨 몇 장이 그냥 나와요)</li>
        <li>
          크롬을 닫았다 다시 열고, 인쇄 창 ‘설정 더보기’: 프린터 Xprinter · 용지 크기 <b>방금 만든 {size}</b> · 여백 <b>없음</b> · 배율 <b>기본값</b>(맞춤 100도
          같아요) · 머리글/바닥글 끄기
        </li>
        <li>아래 테스트 1장 → 테두리가 라벨 가장자리에 맞으면 끝</li>
      </ol>
      <p className="mt-2 font-semibold text-ink">이렇게 나오면</p>
      <ul className="mt-1 list-disc space-y-1 pl-5 text-ink-soft">
        <li>
          <b className="text-ink">양옆이 6mm쯤 비고 전체가 70%쯤 작게</b> → 인쇄 창 여백이 ‘기본값/최소’예요. <b>여백 없음</b>으로 (그래도 같으면 ‘맞춤
          설정’에서 위·아래·왼쪽·오른쪽 모두 0)
        </li>
        <li>
          <b className="text-ink">한 장이 라벨 두 칸에 걸쳐 나오거나 빈 칸이 끼어요</b> → 인쇄 창 용지 크기가 {size}가 아니에요 (목록에 없으면 1번부터)
        </li>
        <li>
          <b className="text-ink">여러 장 뽑으면 아래로 내려가 번호가 라벨 사이에 걸림</b> → FEED 길게(라벨 길이 다시 익히기), 드라이버 용지 세로 {preset.h}mm ·
          용지 종류 ‘간격 있는 라벨’ · 간격 2~3mm 확인
        </li>
      </ul>
      <button type="button" className="btn-soft btn-sm mt-3 w-full" disabled={busy} onClick={onTest}>
        📏 크기 확인용 테스트 1장 뽑기 ({size}mm)
      </button>
      <p className="mt-3 text-xs text-ink-soft">테두리가 라벨 크기와 같은데 1~3mm 밀릴 때만 여기서 옮겨요 (오른쪽·아래가 +). 작게 나오면 1번부터.</p>
      <div className="mt-1.5 grid grid-cols-2 gap-2">
        <NumberField label="좌우 위치" unit="mm" step={0.5} min={-10} max={10} value={nudge.x} onChange={(x) => setNudge({ x })} />
        <NumberField label="위아래 위치" unit="mm" step={0.5} min={-10} max={10} value={nudge.y} onChange={(y) => setNudge({ y })} />
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
  // 라벨 그림이 다 그려진 뒤에 인쇄 창을 열어요 (안 그러면 빈 라벨이 나올 수 있어요)
  const imgs = [...document.querySelectorAll<HTMLImageElement>("#print-root img")];
  await Promise.all(imgs.map((i) => i.decode().catch(() => undefined)));
  window.print();
}
