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
    // 바코드 양옆에 스캐너용 빈 공간(약 9모듈씩)을 남기고, 막대 굵기는 정수 점으로 (선명하게).
    let moduleWidth = Math.max(1, Math.min(4, Math.floor(maxWidth / (modules + 18))));
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
): Promise<HTMLCanvasElement> {
  const W = Math.round(size.w * DOTS_PER_MM);
  const H = Math.round(size.h * DOTS_PER_MM);
  const pad = Math.round(1.5 * DOTS_PER_MM);
  const inner = W - pad * 2;
  const price = won(p.sale_price);

  const nameSize = Math.max(16, Math.round(H * (style === "price" ? 0.12 : 0.1)));
  const priceSize = Math.max(18, Math.round(H * (style === "price" ? 0.3 : 0.13)));
  const digitSize = Math.max(14, Math.round(H * 0.085));
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
  ctx.translate(Math.round(offsetXmm * DOTS_PER_MM), 0);
  ctx.fillStyle = "#000";
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";

  let top = pad;
  let bottom = H - pad;

  if (show.name) {
    const f = fitText(ctx, p.name, nameSize, inner);
    ctx.font = `700 ${f.size}px ${FONT}`;
    ctx.fillText(f.text, W / 2, top + f.size * 0.92);
    top += Math.round(f.size * 1.2);
  }

  if (style === "price") {
    const barH = show.barcode && p.barcode ? Math.round(H * 0.16) : 0;
    if (barH) {
      const bc = barcodeCanvas(p.barcode as string, inner, barH, null);
      if (bc) {
        ctx.drawImage(bc, Math.round((W - bc.width) / 2), bottom - bc.height);
        bottom -= bc.height + Math.round(DOTS_PER_MM * 0.8);
      }
    }
    if (show.price) {
      const f = fitText(ctx, price, priceSize, inner);
      ctx.font = `800 ${f.size}px ${FONT}`;
      const mid = (top + bottom) / 2;
      ctx.fillText(f.text, W / 2, mid + f.size * 0.36);
    }
    return canvas;
  }

  if (show.price) {
    const f = fitText(ctx, price, priceSize, inner);
    ctx.font = `800 ${f.size}px ${FONT}`;
    ctx.fillText(f.text, W / 2, bottom - f.size * 0.08);
    bottom -= Math.round(f.size * 1.15);
  }

  if (show.barcode && p.barcode) {
    const gap = Math.round(DOTS_PER_MM * 0.5);
    const avail = bottom - top - gap * 2;
    const bc = barcodeCanvas(p.barcode, inner, avail - Math.round(digitSize * 1.1), digitSize);
    if (bc) {
      const y = top + gap + Math.max(0, Math.round((avail - bc.height) / 2));
      ctx.drawImage(bc, Math.round((W - bc.width) / 2), y);
    }
  }
  return canvas;
}

/** 위치·크기 맞추기용: 테두리 + 십자선 + 글자 */
export async function renderTestCanvas(size: { w: number; h: number }, offsetXmm = 0): Promise<HTMLCanvasElement> {
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
  ctx.translate(Math.round(offsetXmm * DOTS_PER_MM), 0);
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
