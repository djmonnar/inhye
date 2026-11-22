"use client";

import { Printer, Search, Send, Sparkles, Usb, X } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { flushSync } from "react-dom";
import { BarcodeMaker, isIssueItem, issueAsProduct } from "@/components/BarcodeMaker";
import { StationPicker, useSendStation } from "@/components/PrintStations";
import { BrowserFitPanel, LabelFace, LabelPrintPortal, PresetPicker, buildUsbJobs, labelKey, printNow, readPref, renderLabelImages, usePrintSettings, UsbSettingsPanel, writePref } from "@/components/labels";
import { useAuth, useToast } from "@/components/providers";
import { toInput } from "@/components/ProductForm";
import { Loading, PageHeader, ProductThumb, Segmented } from "@/components/ui";
import { IS_DEMO } from "@/lib/config";
import { isWebBarcode, nextStoreBarcode, searchText } from "@/lib/format";
import { renderLabelCanvas, renderTestCanvas, type LabelStyle } from "@/lib/labelCanvas";
import { useBarcodeIssues, useProducts, useRefresh } from "@/lib/queries";
import { store } from "@/lib/store";
import { buildTsplJob, canvasToMono, concatJobs } from "@/lib/tspl";
import { deviceLabel, getPrinter, sendToPrinter, usbAvailable } from "@/lib/usbPrinter";

type Method = "print" | "usb" | "send";

/** 크기 확인용 테스트 라벨 (테두리 + 크기 글자) — 상품처럼 인쇄 목록에 넣으려는 빈 모양 */
const SIZE_TEST = issueAsProduct({ id: "size-test", code: "", name: "", price: null, memo: null, product_id: null, created_at: "" });

function LabelsInner() {
  const params = useSearchParams();
  const toast = useToast();
  const refresh = useRefresh();
  const { user } = useAuth();
  const { data: products = [], isLoading } = useProducts();
  // 상품 없이 만든 바코드(v10)도 상품처럼 같이 뽑아요
  const { data: issues = [] } = useBarcodeIssues();
  const [copies, setCopies] = useState<Record<string, number>>({});
  const [q, setQ] = useState("");
  const [style, setStyle] = useState<LabelStyle>("label");
  const [method, setMethod] = useState<Method>("print");
  const settings = usePrintSettings(method === "print");
  const { preset, show, usb, updateUsb, nudge } = settings;
  const [usbOk, setUsbOk] = useState(false);
  const [device, setDevice] = useState<USBDevice | null>(null);
  const [sending, setSending] = useState(false);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  // 이 기기 인쇄: 라벨을 프린터 해상도 그림으로 미리 그려 둬요 (라벨을 꽉 채우게) — 어떤 선택으로 그렸는지 같이 기억
  const [printImages, setPrintImages] = useState<{ key: string; images: Record<string, string> }>({ key: "", images: {} });
  const [fixing, setFixing] = useState(false);
  const sendStation = useSendStation();
  const [testImage, setTestImage] = useState<string | null>(null);

  useEffect(() => {
    const hasUsb = usbAvailable();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- device capabilities/prefs exist only after mount
    setUsbOk(hasUsb);
    const saved = readPref("popo.printMethod") as Method | null;
    const touch = window.matchMedia("(pointer: coarse)").matches;
    if (saved === "usb" && hasUsb) setMethod("usb");
    else if (saved === "send" || (!saved && touch && !hasUsb)) setMethod("send");
    void getPrinter(false).then((d) => d && setDevice(d)).catch(() => {});
    if (!hasUsb) return;
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

  const size = { w: preset.w, h: preset.h };
  const pool = useMemo(() => [...products, ...issues.map(issueAsProduct)], [products, issues]);
  const selected = pool.filter((p) => copies[p.id] > 0);
  // 바코드가 없거나 웹 주소(QR)인 상품 — 매장용 바코드를 만들어 줘요
  const missingBarcode = selected.filter((p) => !isIssueItem(p) && (!p.barcode || isWebBarcode(p.barcode)));
  const total = selected.reduce((n, p) => n + copies[p.id], 0);
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

  async function sendUsb(makeJobs: () => Promise<Uint8Array<ArrayBuffer>[]>, count: number) {
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

  /** 브라우저 인쇄: 지금 라벨 크기로 테두리 + 크기 글자 한 장 — 실제 라벨·용지 크기와 맞는지 보기 */
  async function printSizeTest() {
    try {
      const c = await renderTestCanvas(size, nudge.x, nudge.y);
      flushSync(() => setTestImage(c.toDataURL("image/png")));
      await printNow();
    } finally {
      setTestImage(null);
    }
  }

  function printTest() {
    void sendUsb(async () => {
      const bitmap = canvasToMono(await renderTestCanvas(size, usb.offsetMm));
      return [buildTsplJob({ bitmap, widthMm: size.w, heightMm: size.h, gapMm: usb.gapMm, density: usb.density, direction: usb.direction, invert: usb.invert, copies: 1 })];
    }, 1);
  }

  async function sendToLaptop() {
    // 노트북 인쇄 대기열은 상품에 묶여 있어서, 상품 없이 만든 바코드는 노트북에서 직접 뽑아요
    const real = selected.filter((p) => !isIssueItem(p));
    if (!real.length) {
      toast("상품 없이 만든 바코드는 노트북에서 이 화면을 열어 바로 인쇄해 주세요", "sad");
      return;
    }
    if (real.length < selected.length) toast("상품 없이 만든 바코드는 빼고 보낼게요 (노트북에서 직접 인쇄)", "wink");
    setSending(true);
    try {
      await store().addPrintJobs(
        real.map((p) => ({ product_id: p.id, copies: copies[p.id], style })),
        user?.display_name ?? "",
        sendStation.target?.id,
      );
      await refresh("print-jobs");
      toast(`${real.reduce((n, p) => n + copies[p.id], 0)}장 노트북으로 보냈어요!`, "wow");
      setCopies({});
    } catch (e) {
      toast(e instanceof Error ? e.message : "보내지 못했어요", "sad");
    } finally {
      setSending(false);
    }
  }

  async function fixBarcodes() {
    setFixing(true);
    try {
      let pool = [...products];
      const issued = (await store().listBarcodeIssues().catch(() => [])).map((i) => i.code);
      for (const p of missingBarcode) {
        const code = nextStoreBarcode(pool, issued);
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

  const imagesKey = `${previewKey}|${style}|${size.w}x${size.h}|${JSON.stringify(show)}|${nudge.x},${nudge.y}`;
  const imagesReady = printImages.key === imagesKey;

  useEffect(() => {
    if (method !== "print" || !selected.length) return;
    let alive = true;
    const key = imagesKey;
    void renderLabelImages(
      selected.map((p) => ({ p, style })),
      size,
      show,
      nudge,
    ).then((images) => alive && setPrintImages({ key, images }));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [method, imagesKey]);

  if (isLoading) return <Loading />;

  const printItems = selected.flatMap((p) => Array.from({ length: copies[p.id] }, () => ({ p, style })));

  return (
    <div>
      <PageHeader back title="라벨 · 가격표 인쇄" sub={total ? `라벨 ${total}장` : undefined} />
      <div className="space-y-4">
        <section className="card space-y-3 p-4">
          <div>
            <p className="label">인쇄 방법</p>
            <Segmented<Method>
              value={method}
              onChange={(m) => {
                setMethod(m);
                writePref("popo.printMethod", m);
              }}
              options={[
                { value: "print", label: "🖨️ 이 기기" },
                { value: "usb", label: "🔌 USB 직접" },
                { value: "send", label: "📡 노트북으로" },
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
          {method === "send" ? (
            <p className="rounded-2xl bg-soda-100 p-3 text-sm text-soda-700">
              노트북의{" "}
              <Link href="/print-station" className="font-semibold underline">
                인쇄 스테이션
              </Link>
              으로 보내요. 라벨 크기·표시 항목은 노트북 설정을 따라가요.
              {IS_DEMO && " (체험 모드에서는 같은 기기 안에서만 보여요)"}
            </p>
          ) : (
            <PresetPicker settings={settings} />
          )}
          {method === "send" && <StationPicker {...sendStation} />}
          {method === "print" && <BrowserFitPanel settings={settings} onTest={() => void printSizeTest()} />}
        </section>

        {method === "usb" && (
          <section className="card space-y-3 p-4">
            {!usbOk ? (
              <div className="rounded-2xl bg-butter-100 p-3 text-sm text-butter-700">
                이 브라우저는 USB 직접 인쇄가 안 돼요. <b>안드로이드 크롬</b>이나 맥에서 열거나, ‘📡 노트북으로’ 보내 주세요. (아이폰은
                모든 브라우저가 불가)
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
                <UsbSettingsPanel usb={usb} updateUsb={updateUsb} onTest={printTest} busy={sending} />
              </>
            )}
          </section>
        )}

        {/* 미리보기 */}
        {total > 0 && (
          <section className="card p-4">
            <p className="mb-2 font-cute">
              미리보기 {method !== "send" && <span className="text-xs text-ink-soft">(프린터로 가는 그림 그대로)</span>}
            </p>
            <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
              {selected.map((p) =>
                (method === "usb" ? previews[p.id] : method === "print" && imagesReady ? printImages.images[labelKey(p, style)] : undefined) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={p.id}
                    src={method === "usb" ? previews[p.id] : printImages.images[labelKey(p, style)]}
                    alt={`${p.name} 라벨`}
                    className="shrink-0 rounded-md border border-dashed border-ink-faint bg-white"
                    style={{ width: `${preset.w}mm`, height: `${preset.h}mm`, imageRendering: "pixelated" }}
                  />
                ) : (
                  <div key={p.id} className="shrink-0 rounded-md border border-dashed border-ink-faint bg-white" style={{ width: `${preset.w}mm`, height: `${preset.h}mm` }}>
                    {method !== "usb" && <LabelFace p={p} preset={preset} show={show} style={style} />}
                  </div>
                ),
              )}
            </div>
            {missingBarcode.length > 0 && show.barcode && (
              <button type="button" className="btn-soft btn-sm mt-3 w-full" disabled={fixing} onClick={fixBarcodes}>
                <Sparkles size={16} /> 바코드 없는(웹 주소 포함) {missingBarcode.length}개에 매장용 바코드 만들기
              </button>
            )}
            {method === "usb" ? (
              <button
                type="button"
                className="btn-primary mt-3 w-full text-lg"
                disabled={!usbOk || sending}
                onClick={() =>
                  void sendUsb(() => buildUsbJobs(selected.map((p) => ({ p, style, copies: copies[p.id] })), size, show, usb), total)
                }
              >
                <Usb size={20} /> {sending ? "보내는 중..." : `${total}장 바로 인쇄`}
              </button>
            ) : method === "send" ? (
              <button type="button" className="btn-primary mt-3 w-full text-lg" disabled={sending} onClick={sendToLaptop}>
                <Send size={20} /> {sending ? "보내는 중..." : `${total}장 노트북으로 보내기`}
              </button>
            ) : (
              <>
                <button type="button" className="btn-primary mt-3 w-full text-lg" disabled={!imagesReady} onClick={() => void printNow()}>
                  <Printer size={20} /> {imagesReady ? `${total}장 인쇄하기` : "라벨 그리는 중..."}
                </button>
                <p className="mt-2 text-xs text-ink-soft">
                  인쇄 창에서 프린터(Xprinter 등 라벨 프린터)와 용지 크기를 고르고, 배율은 ‘100%/실제 크기’로 맞춰 주세요.
                </p>
              </>
            )}
          </section>
        )}

        <BarcodeMaker issues={issues} copies={copies} setCopies={setCopies} sendMode={method === "send"} />

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

      {method === "print" &&
        (testImage ? (
          <LabelPrintPortal items={[{ p: SIZE_TEST, style: "label" }]} preset={preset} show={show} images={{ [labelKey(SIZE_TEST, "label")]: testImage }} />
        ) : (
          <LabelPrintPortal items={printItems} preset={preset} show={show} images={imagesReady ? printImages.images : undefined} />
        ))}
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
