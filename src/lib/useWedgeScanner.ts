"use client";

import { useEffect, useRef } from "react";

/**
 * USB / 블루투스 바코드 스캐너는 키보드처럼 아주 빠르게 숫자를 치고 Enter를 누릅니다.
 * 입력칸에 포커스가 없을 때 그 패턴을 잡아서 onScan으로 넘겨요.
 */
export function useWedgeScanner(onScan: (code: string) => void, enabled = true) {
  const cb = useRef(onScan);
  useEffect(() => {
    cb.current = onScan;
  });

  useEffect(() => {
    if (!enabled) return;
    let buf = "";
    let last = 0;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const now = performance.now();
      if (now - last > 80) buf = "";
      last = now;
      if (e.key === "Enter") {
        if (buf.length >= 6) {
          e.preventDefault();
          cb.current(buf);
        }
        buf = "";
        return;
      }
      if (e.key.length === 1) buf += e.key;
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled]);
}
