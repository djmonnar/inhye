"use client";

import { Printer, RotateCcw, Usb, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import {
  LabelPrintPortal,
  PresetPicker,
  buildUsbJobs,
  printNow,
  readPref,
  usePrintSettings,
  UsbSettingsPanel,
  writePref,
  type PrintItem,
} from "@/components/labels";
import { Mascot } from "@/components/Mascot";
import { useToast } from "@/components/providers";
import { PageHeader, ProductThumb, Segmented, Toggle } from "@/components/ui";
import { APP_NAME, IS_DEMO } from "@/lib/config";
import { relTime } from "@/lib/format";
import { renderTestCanvas } from "@/lib/labelCanvas";
import { usePrintJobs, useProducts, useRefresh } from "@/lib/queries";
import { store } from "@/lib/store";
import { buildTsplJob, canvasToMono, concatJobs } from "@/lib/tspl";
import type { PrintJob } from "@/lib/types";
import { deviceLabel, getPrinter, sendToPrinter, usbAvailable } from "@/lib/usbPrinter";

type Engine = "browser" | "usb";

let chimeCtx: AudioContext | null = null;
function chime() {
  try {
    chimeCtx ??= new AudioContext();
    const t = chimeCtx.currentTime;
    [988, 1319].forEach((f, i) => {
      const osc = chimeCtx!.createOscillator();
      const gain = chimeCtx!.createGain();
      osc.frequency.value = f;
      gain.gain.setValueAtTime(0.0001, t + i * 0.15);
      gain.gain.exponentialRampToValueAtTime(0.15, t + i * 0.15 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.15 + 0.35);
      osc.connect(gain).connect(chimeCtx!.destination);
      osc.start(t + i * 0.15);
      osc.stop(t + i * 0.15 + 0.4);
    });
  } catch {
    /* no audio */
  }
}

export default function PrintStationPage() {
  const toast = useToast();
  const refresh = useRefresh();
  const { data: products = [] } = useProducts();
  const [engine, setEngine] = useState<Engine>("browser");
  const [auto, setAuto] = useState(false);
  const settings = usePrintSettings(engine === "browser");
  const { preset, show, usb, updateUsb } = settings;
  const { data: pending = [] } = usePrintJobs("pending", 4000);
  const { data: recent = [] } = usePrintJobs("recent", 15000);
  const [batch, setBatch] = useState<PrintItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [device, setDevice] = useState<USBDevice | null>(null);
  const [usbOk, setUsbOk] = useState(false);
  const busyRef = useRef(false);
  const runRef = useRef<() => Promise<void>>(async () => {});
  const byId = new Map(products.map((p) => [p.id, p]));
  const waiting = pending.filter((j) => j.status === "pending");
  const waitingSheets = waiting.reduce((n, j) => n + j.copies, 0);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- per-device station prefs exist only after mount
    setUsbOk(usbAvailable());
    if (readPref("popo.stationEngine") === "usb" && usbAvailable()) setEngine("usb");
    void getPrinter(false).then((d) => d && setDevice(d)).catch(() => {});
  }, []);

  // 탭 제목에 대기 수 표시
  useEffect(() => {
    document.title = waitingSheets ? `(${waitingSheets}) 인쇄 스테이션 · ${APP_NAME}` : `인쇄 스테이션 · ${APP_NAME}`;
    return () => {
      document.title = APP_NAME;
    };
  }, [waitingSheets]);

  // 자동 인쇄 중엔 노트북 화면이 꺼지지 않게
  useEffect(() => {
    if (!auto || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    const acquire = async () => {
      try {
        lock = await navigator.wakeLock.request("screen");
      } catch {
        /* not allowed right now */
      }
    };
    void acquire();
    const onVisible = () => document.visibilityState === "visible" && void acquire();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      void lock?.release().catch(() => {});
    };
  }, [auto]);

  async function connect() {
    try {
      const d = await getPrinter(true);
      if (d) {
        setDevice(d);
        toast(`${deviceLabel(d)} 연결했어요`, "wow");
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : "프린터를 연결하지 못했어요", "sad");
    }
  }

  async function runPrint() {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    let jobs: PrintJob[] = [];
    try {
      jobs = await store().claimPrintJobs();
      if (!jobs.length) return;
      const fresh = new Map((await store().listProducts()).map((p) => [p.id, p]));
      const ready = jobs.filter((j) => fresh.has(j.product_id));
      const gone = jobs.filter((j) => !fresh.has(j.product_id)).map((j) => j.id);
      if (gone.length) await store().finishPrintJobs(gone, false, "상품이 삭제됐어요");
      if (!ready.length) return;

      if (engine === "usb") {
        const dev = device ?? (await getPrinter(false));
        if (!dev) throw new Error("USB 프린터가 연결되지 않았어요. ‘연결’을 눌러 주세요.");
        const data = await buildUsbJobs(
          ready.map((j) => ({ p: fresh.get(j.product_id)!, style: j.style, copies: j.copies })),
          { w: preset.w, h: preset.h },
          show,
          usb,
        );
        await sendToPrinter(dev, concatJobs(data));
      } else {
        flushSync(() =>
          setBatch(ready.flatMap((j) => Array.from({ length: j.copies }, () => ({ p: fresh.get(j.product_id)!, style: j.style })))),
        );
        await printNow();
        setBatch([]);
      }
      await store().finishPrintJobs(ready.map((j) => j.id), true);
      chime();
      toast(`${ready.reduce((n, j) => n + j.copies, 0)}장 인쇄했어요`, "wow");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "인쇄하지 못했어요";
      await store().finishPrintJobs(jobs.map((j) => j.id), false, msg).catch(() => {});
      toast(msg, "sad");
    } finally {
      busyRef.current = false;
      setBusy(false);
      void refresh("print-jobs");
    }
  }

  useEffect(() => {
    runRef.current = runPrint;
  });

  useEffect(() => {
    if (auto && waiting.length && !busyRef.current) void runRef.current();
  }, [auto, waiting.length, pending]);

  async function retry(job: PrintJob) {
    await store().addPrintJobs([{ product_id: job.product_id, copies: job.copies, style: job.style }], job.requested_by_name ?? "");
    void refresh("print-jobs");
  }

  async function cancel(job: PrintJob) {
    await store().deletePrintJob(job.id);
    void refresh("print-jobs");
  }

  function printTest() {
    void (async () => {
      if (!device) return connect();
      try {
        const bitmap = canvasToMono(await renderTestCanvas({ w: preset.w, h: preset.h }, usb.offsetMm));
        await sendToPrinter(
          device,
          buildTsplJob({ bitmap, widthMm: preset.w, heightMm: preset.h, gapMm: usb.gapMm, density: usb.density, direction: usb.direction, invert: usb.invert, copies: 1 }),
        );
      } catch (e) {
        toast(e instanceof Error ? e.message : "인쇄하지 못했어요", "sad");
      }
    })();
  }

  return (
    <div>
      <PageHeader back title="인쇄 스테이션" sub="프린터 꽂은 노트북에 띄워두세요" />
      <div className="space-y-4">
        <section className={`card p-4 ${auto ? "border-matcha-300 bg-matcha-100/60" : ""}`}>
          <div className="flex items-center gap-3">
            <Mascot mood={busy ? "wow" : auto ? "happy" : "sleep"} size={64} className={auto ? "animate-float" : ""} />
            <div className="flex-1">
              <p className="font-cute text-2xl">
                {busy ? "인쇄 중..." : waitingSheets ? `대기 ${waitingSheets}장` : "대기 없음"}
              </p>
              <p className="text-sm text-ink-soft">
                {auto ? "자동 인쇄 켜짐 · 폰에서 보내면 바로 나와요" : "자동 인쇄를 켜면 들어오는 대로 뽑아요"}
              </p>
            </div>
          </div>
          <div className="mt-3 rounded-2xl bg-white px-3">
            <Toggle
              checked={auto}
              onChange={(v) => {
                setAuto(v);
                if (v) chime();
              }}
              label="자동 인쇄"
              desc="이 창을 띄워두는 동안 4초마다 확인해요"
            />
          </div>
          <button
            type="button"
            className="btn-primary mt-3 w-full"
            disabled={busy || !waiting.length}
            onClick={() => void runPrint()}
          >
            <Printer size={18} /> 지금 모두 인쇄 {waitingSheets ? `(${waitingSheets}장)` : ""}
          </button>
          {IS_DEMO && (
            <p className="mt-2 text-center text-xs text-butter-700">체험 모드라 이 기기 안에서만 대기열이 보여요</p>
          )}
        </section>

        <section className="card space-y-3 p-4">
          <p className="label">인쇄 방식</p>
          <Segmented<Engine>
            value={engine}
            onChange={(v) => {
              setEngine(v);
              writePref("popo.stationEngine", v);
            }}
            options={[
              { value: "browser", label: "🖨️ 프린터 드라이버 (윈도우)" },
              { value: "usb", label: "🔌 USB 직접 (맥)" },
            ]}
          />
          {engine === "usb" ? (
            !usbOk ? (
              <p className="rounded-2xl bg-butter-100 p-3 text-sm text-butter-700">이 브라우저는 USB 직접 인쇄가 안 돼요. 크롬이나 엣지로 열어 주세요.</p>
            ) : (
              <>
                <div className="flex items-center gap-3">
                  <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${device ? "bg-matcha-100 text-matcha-700" : "bg-cream-deep text-ink-faint"}`}>
                    <Usb size={22} />
                  </span>
                  <p className="min-w-0 flex-1 truncate font-cute">{device ? deviceLabel(device) : "프린터 연결 안 됨"}</p>
                  <button type="button" className="btn-soft btn-sm" onClick={() => void connect()}>
                    {device ? "다시 선택" : "연결"}
                  </button>
                </div>
                <UsbSettingsPanel usb={usb} updateUsb={updateUsb} onTest={printTest} busy={busy} />
              </>
            )
          ) : (
            <details className="rounded-2xl bg-cream p-3 text-sm">
              <summary className="cursor-pointer list-none font-cute text-[15px]">💡 인쇄 창 없이 자동으로 나오게 하기 (윈도우, 한 번만)</summary>
              <ol className="mt-2 list-decimal space-y-1 pl-5 text-ink-soft">
                <li>Xprinter 드라이버 설치 → 설정 › 프린터에서 Xprinter를 <b>기본 프린터</b>로</li>
                <li>Xprinter ‘인쇄 기본 설정’에서 용지 크기를 라벨 크기(예: 40×30mm)로</li>
                <li>
                  바탕화면 크롬 아이콘 복사 → 속성 → ‘대상’ 맨 끝에 한 칸 띄고 <code className="rounded bg-white px-1">--kiosk-printing</code> 추가
                </li>
                <li>크롬을 모두 닫고, 그 아이콘으로 이 화면을 열어 ‘자동 인쇄’ 켜기</li>
                <li>노트북 전원 설정에서 전원 연결 시 ‘절전 안 함’</li>
              </ol>
              <p className="mt-2 text-xs text-ink-soft">이 설정 없이도 돼요. 그땐 인쇄할 때마다 인쇄 창이 떠서 Enter만 누르면 돼요.</p>
            </details>
          )}
          <PresetPicker settings={settings} />
        </section>

        <section className="card p-4">
          <p className="mb-2 font-cute text-lg">대기열</p>
          {pending.length === 0 ? (
            <p className="py-4 text-center text-sm text-ink-soft">폰에서 ‘📡 노트북으로’ 보내면 여기에 떠요</p>
          ) : (
            <ul className="divide-y-2 divide-dashed divide-line">
              {pending.map((j) => {
                const p = byId.get(j.product_id);
                return (
                  <li key={j.id} className="flex items-center gap-3 py-2">
                    {p ? <ProductThumb product={p} className="h-11 w-11" frame="rounded-xl border-2" /> : <span className="h-11 w-11" />}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{p?.name ?? "상품 불러오는 중"}</p>
                      <p className="text-xs text-ink-soft">
                        {j.style === "price" ? "가격표" : "라벨"} × {j.copies} · {j.requested_by_name || "누군가"} · {relTime(j.created_at)}
                      </p>
                    </div>
                    {j.status === "printing" ? (
                      <span className="badge bg-soda-100 text-soda-700">인쇄 중</span>
                    ) : (
                      <button type="button" className="p-2 text-ink-faint" aria-label="취소" onClick={() => void cancel(j)}>
                        <X size={18} />
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {recent.length > 0 && (
          <section className="card p-4">
            <p className="mb-2 font-cute text-lg">최근 인쇄</p>
            <ul className="divide-y-2 divide-dashed divide-line">
              {recent.map((j) => (
                <li key={j.id} className="flex items-center gap-2 py-2 text-sm">
                  <span className={`badge ${j.status === "done" ? "bg-matcha-100 text-matcha-700" : "bg-danger/10 text-danger"}`}>
                    {j.status === "done" ? "완료" : "실패"}
                  </span>
                  <span className="min-w-0 flex-1 truncate">
                    {byId.get(j.product_id)?.name ?? "삭제된 상품"} × {j.copies}
                    {j.error && <span className="block truncate text-xs text-danger">{j.error}</span>}
                  </span>
                  <span className="text-xs text-ink-faint">{relTime(j.printed_at)}</span>
                  <button type="button" className="p-1.5 text-berry-600" aria-label="다시 인쇄" onClick={() => void retry(j)}>
                    <RotateCcw size={16} />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      {engine === "browser" && <LabelPrintPortal items={batch} preset={preset} show={show} />}
    </div>
  );
}
