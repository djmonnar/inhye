"use client";

import { Flashlight, SwitchCamera } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { IScannerControls } from "@zxing/browser";

let audioCtx: AudioContext | null = null;

/** Short "삑" so you know the scan landed without looking. */
export function beep() {
  try {
    audioCtx ??= new AudioContext();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = "sine";
    osc.frequency.value = 1320;
    gain.gain.setValueAtTime(0.12, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.12);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.13);
  } catch {
    /* audio unavailable */
  }
  navigator.vibrate?.(60);
}

export function BarcodeScanner({
  onDetected,
  paused = false,
  className = "",
}: {
  onDetected: (code: string) => void;
  paused?: boolean;
  className?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const lastRef = useRef<{ code: string; at: number }>({ code: "", at: 0 });
  const onDetectedRef = useRef(onDetected);
  const pausedRef = useRef(paused);
  const [error, setError] = useState("");
  const [torch, setTorch] = useState<boolean | null>(null);
  const [facing, setFacing] = useState<"environment" | "user">("environment");

  useEffect(() => {
    onDetectedRef.current = onDetected;
    pausedRef.current = paused;
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError("이 브라우저에서는 카메라를 쓸 수 없어요. 바코드를 직접 입력해 주세요.");
        return;
      }
      try {
        const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([
          import("@zxing/browser"),
          import("@zxing/library"),
        ]);
        const hints = new Map();
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [
          BarcodeFormat.EAN_13,
          BarcodeFormat.EAN_8,
          BarcodeFormat.UPC_A,
          BarcodeFormat.UPC_E,
          BarcodeFormat.CODE_128,
          BarcodeFormat.CODE_39,
          BarcodeFormat.ITF,
          BarcodeFormat.QR_CODE,
        ]);
        hints.set(DecodeHintType.TRY_HARDER, true);
        const reader = new BrowserMultiFormatReader(hints, {
          delayBetweenScanAttempts: 100,
          delayBetweenScanSuccess: 600,
        });
        if (cancelled || !videoRef.current) return;
        const controls = await reader.decodeFromConstraints(
          {
            audio: false,
            video: {
              facingMode: { ideal: facing },
              width: { ideal: 1280 },
              height: { ideal: 720 },
            },
          },
          videoRef.current,
          (result) => {
            if (!result || pausedRef.current) return;
            const code = result.getText().trim();
            const now = Date.now();
            // 같은 바코드가 계속 화면에 있으면 다시 세지 않아요. 화면에서 1.2초 이상 사라졌다가 다시 찍혀야 한 번 더.
            if (code === lastRef.current.code && now - lastRef.current.at < 1200) {
              lastRef.current.at = now;
              return;
            }
            lastRef.current = { code, at: now };
            beep();
            onDetectedRef.current(code);
          },
        );
        if (cancelled) {
          controls.stop();
          return;
        }
        controlsRef.current = controls;
        setError("");
        setTorch(controls.switchTorch ? false : null);
      } catch (e) {
        const name = e instanceof Error ? e.name : "";
        setError(
          name === "NotAllowedError"
            ? "카메라 권한이 꺼져 있어요. 브라우저 설정에서 카메라를 허용해 주세요."
            : name === "NotFoundError"
              ? "카메라를 찾을 수 없어요. 바코드를 직접 입력해 주세요."
              : "카메라를 켜지 못했어요. 다시 시도하거나 직접 입력해 주세요.",
        );
      }
    })();
    return () => {
      cancelled = true;
      controlsRef.current?.stop();
      controlsRef.current = null;
    };
  }, [facing]);

  return (
    <div className={`relative overflow-hidden rounded-3xl border-2 border-line bg-ink ${className}`}>
      <video ref={videoRef} className="h-full w-full object-cover" muted playsInline />
      {error ? (
        <div className="absolute inset-0 flex items-center justify-center bg-ink/80 p-6 text-center text-sm text-white">
          {error}
        </div>
      ) : (
        <>
          <div className="pointer-events-none absolute inset-x-[12%] top-1/2 h-[42%] -translate-y-1/2 rounded-2xl">
            {(["left-0 top-0 border-l-4 border-t-4 rounded-tl-2xl", "right-0 top-0 border-r-4 border-t-4 rounded-tr-2xl", "left-0 bottom-0 border-l-4 border-b-4 rounded-bl-2xl", "right-0 bottom-0 border-r-4 border-b-4 rounded-br-2xl"] as const).map((c) => (
              <span key={c} className={`absolute h-8 w-8 border-berry-300 ${c}`} />
            ))}
            <span className="absolute inset-x-3 top-1/2 h-0.5 animate-pulse rounded-full bg-berry-400 shadow-[0_0_12px_2px_rgba(255,148,175,0.8)]" />
          </div>
          <div className="absolute bottom-3 right-3 flex gap-2">
            {torch !== null && (
              <button
                type="button"
                className={`flex h-11 w-11 items-center justify-center rounded-full ${torch ? "bg-butter-300 text-ink" : "bg-white/80 text-ink"}`}
                aria-label="손전등"
                onClick={async () => {
                  const next = !torch;
                  await controlsRef.current?.switchTorch?.(next);
                  setTorch(next);
                }}
              >
                <Flashlight size={20} />
              </button>
            )}
            <button
              type="button"
              className="flex h-11 w-11 items-center justify-center rounded-full bg-white/80 text-ink"
              aria-label="카메라 전환"
              onClick={() => setFacing((f) => (f === "environment" ? "user" : "environment"))}
            >
              <SwitchCamera size={20} />
            </button>
          </div>
        </>
      )}
    </div>
  );
}
