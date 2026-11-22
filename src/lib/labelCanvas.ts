import JsBarcode from "jsbarcode";
import { barcodeFormat } from "@/components/BarcodeSvg";
import { won } from "./format";
import type { Product } from "./types";

/** 203dpi 라벨 프린터 = 1mm에 8점 */
export const DOTS_PER_MM = 8;

export type LabelStyle = "label" | "price";
export interface LabelShow {
  name: boolean;
  price: boolean;
  barcode: boolean;
}

const FONT = '"Pretendard Variable", Pretendard, sans-serif';

async function ensureFont(sizePx: number, text: string) {
  try {
    await document.fonts.load(`700 ${sizePx}px ${FONT}`, text);
  } catch {
    /* fall back to whatever is available */
  }
}

/** Shrinks (down to 70%) then truncates with … so the text fits maxWidth. */
function fitText(ctx: CanvasRenderingContext2D, text: string, size: number, maxWidth: number): { text: string; size: number } {
  let s = size;
  ctx.font = `700 ${s}px ${FONT}`;
  while (ctx.measureText(text).width > maxWidth && s > size * 0.7) {
    s -= 1;
    ctx.font = `700 ${s}px ${FONT}`;
  }
  if (ctx.measureText(text).width <= maxWidth) return { text, size: s };
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > maxWidth) t = t.slice(0, -1);
  return { text: `${t}…`, size: s };
}

/** 바코드 양옆에 남길 빈 공간(모듈 수, 한쪽) — 라벨 가장자리까지 포함 */
const QUIET_MODULES = 5;

function barcodeCanvas(value: string, maxWidth: number, barHeight: number, digits: number | null): HTMLCanvasElement | null {
  const format = barcodeFormat(value);
  const draw = (moduleWidth: number, height: number, withDigits: boolean) => {
    const c = document.createElement("canvas");
    JsBarcode(c, value, {
      format,
      width: moduleWidth,
      height,
      margin: 0,
      displayValue: withDigits,
      fontSize: digits ?? 0,
      textMargin: 0,
      font: FONT,
      background: "#ffffff",
      lineColor: "#000000",
    });
    return c;
  };
  try {
    const modules = draw(1, 1, false).width;
    // 라벨 가로를 거의 꽉 채워요 (사장님 요청 2026-11-17): 양옆 빈 공간은 5모듈씩만 — maxWidth는 라벨 전체 폭.
    // 막대 굵기는 정수 점으로 (선명하게, 스캔 잘 되게). 40mm 라벨: 8자리 4점(약 84%), 13자리 3점(약 89%).
    let moduleWidth = Math.max(1, Math.min(4, Math.floor(maxWidth / (modules + QUIET_MODULES * 2))));
    let c = draw(moduleWidth, Math.max(8, barHeight), digits !== null);
    while (c.width > maxWidth && moduleWidth > 1) {
      moduleWidth -= 1;
      c = draw(moduleWidth, Math.max(8, barHeight), digits !== null);
    }
    return c;
  } catch {
    return null;
  }
}

export async function renderLabelCanvas(
  p: Pick<Product, "name" | "barcode" | "sale_price">,
  size: { w: number; h: number },
  show: LabelShow,
  style: LabelStyle,
  offsetXmm = 0,
  offsetYmm = 0,
): Promise<HTMLCanvasElement> {
  const W = Math.round(size.w * DOTS_PER_MM);
  const H = Math.round(size.h * DOTS_PER_MM);
  const pad = Math.round(1.5 * DOTS_PER_MM);
  const inner = W - pad * 2;
  const price = won(p.sale_price);
  // 이름이 비었거나 가격이 0원이면 안 찍어요 (상품 없이 만든 바코드 라벨 등) — 그만큼 바코드가 커져요
  const showName = show.name && p.name.trim() !== "";
  const showPrice = show.price && p.sale_price > 0;

  const nameSize = Math.max(16, Math.round(H * (style === "price" ? 0.12 : 0.1)));
  const priceSize = Math.max(18, Math.round(H * (style === "price" ? 0.3 : 0.13)));
  await ensureFont(nameSize, p.name);
  await ensureFont(priceSize, `${price}0123456789`);

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas unavailable");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, W, H);
  ctx.imageSmoothingEnabled = false;
  ctx.translate(Math.round(offsetXmm * DOTS_PER_MM), Math.round(offsetYmm * DOTS_PER_MM));
  ctx.fillStyle = "#000";
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";

  let top = pad;
  let bottom = H - pad;

  if (style === "price") {
    if (showName) {
      const f = fitText(ctx, p.name, nameSize, inner);
      ctx.font = `700 ${f.size}px ${FONT}`;
      ctx.fillText(f.text, W / 2, top + f.size * 0.92);
      top += Math.round(f.size * 1.2);
    }
    const barH = show.barcode && p.barcode ? Math.round(H * 0.16) : 0;
    if (barH) {
      const bc = barcodeCanvas(p.barcode as string, W, barH, null);
      if (bc) {
        ctx.drawImage(bc, Math.round((W - bc.width) / 2), bottom - bc.height);
        bottom -= bc.height + Math.round(DOTS_PER_MM * 0.8);
      }
    }
    if (showPrice) {
      const f = fitText(ctx, price, priceSize, inner);
      ctx.font = `800 ${f.size}px ${FONT}`;
      const mid = (top + bottom) / 2;
      ctx.fillText(f.text, W / 2, mid + f.size * 0.36);
    }
    return canvas;
  }

  // 바코드 라벨 (사장님 예시 라벨과 같게, 2026-11-17):
  //   맨 위 한 줄 ‘이름 가격’ (크게) · 가운데 바코드 막대 (가로 꽉) · 아래 바코드 번호 (크게, 가운데)
  const line = [showName ? p.name.trim() : "", showPrice ? price : ""].filter(Boolean).join("  ");
  const lineSize = Math.max(18, Math.round(H * 0.19));
  const codeSize = Math.max(16, Math.round(H * 0.15));
  await ensureFont(lineSize, line || "0");
  if (line) {
    const f = fitText(ctx, line, lineSize, inner);
    ctx.font = `700 ${f.size}px ${FONT}`;
    ctx.fillText(f.text, W / 2, top + f.size * 0.9);
    top += Math.round(f.size * 1.12);
  }

  if (show.barcode && p.barcode) {
    const code = p.barcode;
    const fc = fitText(ctx, code, codeSize, inner);
    ctx.font = `600 ${fc.size}px ${FONT}`;
    ctx.fillText(fc.text, W / 2, bottom - fc.size * 0.1);
    bottom -= Math.round(fc.size * 1.05);
    const gap = Math.round(DOTS_PER_MM * 0.4);
    const barH = bottom - top - gap * 2;
    const bc = barcodeCanvas(code, W, barH, null);
    if (bc) ctx.drawImage(bc, Math.round((W - bc.width) / 2), top + gap + Math.max(0, Math.round((barH - bc.height) / 2)));
  }
  return canvas;
}

/** 위치·크기 맞추기용: 테두리 + 십자선 + 글자 */
export async function renderTestCanvas(size: { w: number; h: number }, offsetXmm = 0, offsetYmm = 0): Promise<HTMLCanvasElement> {
  const W = Math.round(size.w * DOTS_PER_MM);
  const H = Math.round(size.h * DOTS_PER_MM);
  const fontSize = Math.max(16, Math.round(H * 0.12));
  await ensureFont(fontSize, "포포하우스 테스트 0123456789×mm");
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas unavailable");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, W, H);
  ctx.translate(Math.round(offsetXmm * DOTS_PER_MM), Math.round(offsetYmm * DOTS_PER_MM));
  ctx.strokeStyle = "#000";
  ctx.lineWidth = 3;
  ctx.strokeRect(4, 4, W - 8, H - 8);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(W / 2, 4);
  ctx.lineTo(W / 2, H - 4);
  ctx.moveTo(4, H / 2);
  ctx.lineTo(W - 4, H / 2);
  ctx.stroke();
  ctx.fillStyle = "#000";
  ctx.textAlign = "center";
  ctx.font = `700 ${fontSize}px ${FONT}`;
  ctx.fillText("포포하우스 테스트", W / 2, H / 2 - fontSize * 0.4);
  ctx.fillText(`${size.w}×${size.h}mm`, W / 2, H / 2 + fontSize * 1.2);
  return canvas;
}
