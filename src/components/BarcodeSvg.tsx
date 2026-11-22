"use client";

import JsBarcode from "jsbarcode";
import { useEffect, useRef } from "react";
import { isValidEan13 } from "@/lib/format";

/** 8자리 EAN-8 검사 숫자가 맞는지 (안 맞으면 EAN-8로 못 그려서 CODE128로) */
function isValidEan8(code: string): boolean {
  if (!/^\d{8}$/.test(code)) return false;
  const sum = [...code.slice(0, 7)].reduce((n, d, i) => n + Number(d) * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === Number(code[7]);
}

export function barcodeFormat(code: string): "EAN13" | "EAN8" | "CODE128" {
  if (isValidEan13(code)) return "EAN13";
  if (isValidEan8(code)) return "EAN8";
  return "CODE128";
}

export function BarcodeSvg({
  value,
  height = 48,
  width = 1.6,
  fontSize = 14,
  displayValue = true,
  className = "",
}: {
  value: string;
  height?: number;
  width?: number;
  fontSize?: number;
  displayValue?: boolean;
  className?: string;
}) {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => {
    if (!ref.current || !value) return;
    try {
      JsBarcode(ref.current, value, {
        format: barcodeFormat(value),
        height,
        width,
        fontSize,
        margin: 0,
        displayValue,
        background: "transparent",
        lineColor: "#000",
        font: "Pretendard Variable, sans-serif",
      });
    } catch {
      try {
        JsBarcode(ref.current, value, { format: "CODE128", height, width, fontSize, margin: 0, displayValue });
      } catch {
        ref.current.innerHTML = "";
      }
    }
  }, [value, height, width, fontSize, displayValue]);
  return <svg ref={ref} className={className} />;
}
