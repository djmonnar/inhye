"use client";

import JsBarcode from "jsbarcode";
import { useEffect, useRef } from "react";
import { isValidEan13 } from "@/lib/format";

export function barcodeFormat(code: string): "EAN13" | "EAN8" | "CODE128" {
  if (isValidEan13(code)) return "EAN13";
  if (/^\d{8}$/.test(code)) return "EAN8";
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
