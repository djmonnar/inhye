"use client";

import { Camera, ImagePlus, Link2, Plus, ScanBarcode, Sparkles, Star, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { compressImage } from "@/lib/image";
import {
  ensureUrl,
  hostOf,
  margin,
  nextStoreBarcode,
  normalizeBarcode,
  num,
  siteNameFromUrl,
  suggestPrices,
  won,
} from "@/lib/format";
import { useCategories, useProducts, useRefresh, useSuppliers } from "@/lib/queries";
import { store } from "@/lib/store";
import type { Product, ProductInput, Supplier, SupplierInput } from "@/lib/types";
import { BarcodeScanner } from "./BarcodeScanner";
import { readPref, writePref } from "./labels";
import { useAuth, useToast } from "./providers";
import { SupplierSheet } from "./SupplierSheet";
import { Field, MoneyInput, PageHeader, Sheet, Stepper, Toggle } from "./ui";

export function emptyProduct(partial: Partial<ProductInput> = {}): ProductInput {
  return {
    name: "",
    category: "",
    barcode: null,
    kiosk_code: null,
    supplier_id: null,
    purchase_url: null,
    supplier_sku: null,
    cost_price: 0,
    sale_price: 0,
    stock_qty: 0,
    safety_stock: 3,
    kiosk_track_stock: false,
    is_active: true,
    image_path: null,
    tags: [],
    memo: null,
    name_en: null,
    name_zh: null,
    name_ja: null,
    description: null,
    description_en: null,
    description_zh: null,
    description_ja: null,
    ...partial,
  };
}

export function toInput(p: Product): ProductInput {
  const {
    id: _id,
    created_at: _c,
    updated_at: _u,
    kiosk_synced_at: _k,
    kiosk_changed_at: _kc,
    ...rest
  } = p;
  return rest;
}

const text = (v: string) => (v.trim() ? v : null);

export function ProductForm({ product, initial }: { product?: Product; initial?: Partial<ProductInput> }) {
  const router = useRouter();
  const toast = useToast();
  const refresh = useRefresh();
  const { data: products = [] } = useProducts();
  const { data: suppliers = [] } = useSuppliers();
  const categories = useCategories();

  const [f, setF] = useState<ProductInput>(() => (product ? toInput(product) : emptyProduct(initial)));
  const [initialStock, setInitialStock] = useState(initial?.stock_qty ?? 0);
  const { user } = useAuth();
  const [sendLabel, setSendLabel] = useState(false);
  const [photo, setPhoto] = useState<{ blob: Blob; url: string } | null>(null);
  const [photoRemoved, setPhotoRemoved] = useState(false);
  const [compressing, setCompressing] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [supplierSheet, setSupplierSheet] = useState<Partial<SupplierInput> | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const set = <K extends keyof ProductInput>(k: K, v: ProductInput[K]) => setF((p) => ({ ...p, [k]: v }));

  useEffect(() => () => {
    if (photo) URL.revokeObjectURL(photo.url);
  }, [photo]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- remembered per device
    if (!product) setSendLabel(readPref("popo.autoSendLabel") === "1");
  }, [product]);

  const m = margin(f.cost_price, f.sale_price);
  const duplicate = useMemo(() => {
    const code = normalizeBarcode(f.barcode);
    return code ? products.find((p) => p.barcode === code && p.id !== product?.id) : undefined;
  }, [f.barcode, products, product?.id]);

  const supplierByHost = useMemo(() => {
    const host = hostOf(f.purchase_url);
    return host ? suppliers.find((s) => hostOf(s.website) === host) : undefined;
  }, [f.purchase_url, suppliers]);

  const sortedSuppliers = useMemo(
    () => [...suppliers].sort((a, b) => Number(b.favorite) - Number(a.favorite) || a.name.localeCompare(b.name, "ko")),
    [suppliers],
  );

  const previewUrl = photo?.url ?? (photoRemoved ? null : store().imageUrl(f.image_path));

  async function onPickFile(file: File | undefined) {
    if (!file) return;
    setCompressing(true);
    try {
      const blob = await compressImage(file);
      setPhoto({ blob, url: URL.createObjectURL(blob) });
      setPhotoRemoved(false);
    } catch {
      toast("사진을 불러오지 못했어요", "sad");
    } finally {
      setCompressing(false);
    }
  }

  function onPurchaseUrl(v: string) {
    set("purchase_url", text(v));
    if (f.supplier_id) return;
    const host = hostOf(v);
    const match = host ? suppliers.find((s) => hostOf(s.website) === host) : undefined;
    if (match) {
      set("supplier_id", match.id);
      toast(`‘${match.name}’ 구매처로 연결했어요`, "wink");
    }
  }

  async function save() {
    setError("");
    if (!f.name.trim()) {
      setError("상품명을 적어 주세요.");
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    if (duplicate) {
      setError(`이 바코드는 ‘${duplicate.name}’에 이미 등록돼 있어요.`);
      return;
    }
    setBusy(true);
    const oldImage = product?.image_path ?? null;
    let uploaded: string | null = null;
    try {
      let image_path = photoRemoved ? null : f.image_path;
      if (photo) {
        uploaded = await store().uploadImage(photo.blob);
        image_path = uploaded;
      }
      const input: ProductInput = {
        ...f,
        name: f.name.trim(),
        category: f.category.trim() || "기타",
        barcode: normalizeBarcode(f.barcode),
        purchase_url: f.purchase_url ? ensureUrl(f.purchase_url.trim()) : null,
        image_path,
        stock_qty: product ? product.stock_qty : 0,
      };
      const saved = await store().saveProduct(input, product?.id);
      if (!product && initialStock > 0) {
        await store().addMove({
          product_id: saved.id,
          kind: "in",
          qty: initialStock,
          unit_cost: input.cost_price || null,
          supplier_id: input.supplier_id,
          memo: "처음 등록",
        });
      }
      if (oldImage && oldImage !== image_path) await store().removeImage(oldImage).catch(() => {});
      let sent = 0;
      if (!product && sendLabel && saved.barcode) {
        sent = Math.min(500, Math.max(1, initialStock));
        await store()
          .addPrintJobs([{ product_id: saved.id, copies: sent, style: "label" }], user?.display_name ?? "")
          .catch(() => (sent = 0));
      }
      await refresh("products", "moves", "print-jobs");
      toast(
        product ? "수정했어요!" : sent ? `등록 완료! 라벨 ${sent}장 노트북으로 보냈어요` : "새 상품을 등록했어요!",
        "wow",
      );
      router.replace(`/products/${saved.id}`);
    } catch (e) {
      if (uploaded) await store().removeImage(uploaded).catch(() => {});
      setError(e instanceof Error ? e.message : "저장하지 못했어요.");
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader
        back
        title={product ? "상품 수정" : "새 상품 등록"}
        right={
          <button type="button" className="btn-primary btn-sm" onClick={save} disabled={busy || compressing}>
            {busy ? "저장 중" : "저장"}
          </button>
        }
      />

      <div className="space-y-4">
        {error && (
          <p className="rounded-2xl bg-danger/10 px-4 py-3 text-sm text-danger" role="alert">
            {error}
          </p>
        )}

        {/* 사진 */}
        <section className="card overflow-hidden">
          <div className="relative aspect-[4/3] bg-berry-50 sm:aspect-[16/9]">
            {previewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={previewUrl} alt="상품 사진" className="h-full w-full object-contain" />
            ) : (
              <div className="dotted-bg flex h-full flex-col items-center justify-center text-ink-soft">
                <Camera size={40} className="text-berry-300" />
                <p className="mt-2 font-cute">사진을 넣으면 어떤 상품인지 한눈에!</p>
              </div>
            )}
            {compressing && (
              <div className="absolute inset-0 flex items-center justify-center bg-white/70 font-cute">사진 줄이는 중...</div>
            )}
            {previewUrl && (
              <button
                type="button"
                className="absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-danger shadow"
                aria-label="사진 지우기"
                onClick={() => {
                  setPhoto(null);
                  setPhotoRemoved(true);
                }}
              >
                <Trash2 size={18} />
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2 p-3">
            <label className="btn-soft cursor-pointer">
              <Camera size={18} /> 사진 찍기
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="sr-only"
                onChange={(e) => {
                  void onPickFile(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
            </label>
            <label className="btn-soft cursor-pointer">
              <ImagePlus size={18} /> 앨범에서
              <input
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={(e) => {
                  void onPickFile(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
            </label>
          </div>
        </section>

        {/* 기본 정보 */}
        <section className="card space-y-4 p-4">
          <Field label="상품명 *">
            {(id) => (
              <input
                id={id}
                className="input"
                placeholder="예: 곰돌이 털 키링"
                value={f.name}
                onChange={(e) => set("name", e.target.value)}
              />
            )}
          </Field>
          <Field label="카테고리" hint="빅솔론 엑셀의 ‘상품 분류명’으로 들어가요">
            {(id) => (
              <>
                <input
                  id={id}
                  className="input"
                  placeholder="예: 키링, 문구, 헤어"
                  value={f.category}
                  onChange={(e) => set("category", e.target.value)}
                />
                {categories.length > 0 && (
                  <div className="no-scrollbar -mx-1 mt-2 flex gap-1.5 overflow-x-auto px-1 pb-1">
                    {categories.map((c) => (
                      <button
                        type="button"
                        key={c}
                        className="chip"
                        data-on={f.category === c}
                        onClick={() => set("category", c)}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </Field>
          <Field
            label="바코드"
            hint={
              duplicate ? (
                <span className="text-danger">
                  이미 등록된 바코드예요 →{" "}
                  <Link href={`/products/${duplicate.id}`} className="underline">
                    {duplicate.name}
                  </Link>
                </span>
              ) : (
                "바코드가 없는 상품은 ‘자동 만들기’로 매장용 바코드를 만들 수 있어요"
              )
            }
          >
            {(id) => (
              <div className="space-y-2">
                <div className="flex gap-2">
                  <input
                    id={id}
                    className="input font-mono tabular-nums"
                    inputMode="numeric"
                    placeholder="스캔하거나 입력"
                    value={f.barcode ?? ""}
                    onChange={(e) => set("barcode", text(e.target.value))}
                  />
                  <button
                    type="button"
                    className="btn-soft shrink-0 px-3"
                    aria-label="카메라로 바코드 스캔"
                    onClick={() => setScanOpen(true)}
                  >
                    <ScanBarcode size={20} />
                  </button>
                </div>
                {!f.barcode && (
                  <button
                    type="button"
                    className="btn-ghost btn-sm text-berry-600"
                    onClick={() => set("barcode", nextStoreBarcode(products))}
                  >
                    <Sparkles size={16} /> 매장용 바코드 자동 만들기
                  </button>
                )}
              </div>
            )}
          </Field>
        </section>

        {/* 가격 */}
        <section className="card space-y-4 p-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="매입가 (원가)">
              {(id) => <MoneyInput id={id} value={f.cost_price} onChange={(v) => set("cost_price", v)} />}
            </Field>
            <Field label="판매가 *">
              {(id) => <MoneyInput id={id} value={f.sale_price} onChange={(v) => set("sale_price", v)} />}
            </Field>
          </div>
          {f.cost_price > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-ink-soft">추천 판매가</span>
              {suggestPrices(f.cost_price).map((s) => (
                <button
                  type="button"
                  key={s.label}
                  className="chip"
                  data-on={f.sale_price === s.price}
                  onClick={() => set("sale_price", s.price)}
                >
                  {s.label} {num(s.price)}
                </button>
              ))}
            </div>
          )}
          {f.sale_price > 0 && (
            <div
              className={`flex items-center justify-between rounded-2xl px-4 py-3 ${
                m.amount < 0 ? "bg-danger/10" : m.rate >= 50 ? "bg-matcha-100" : "bg-butter-100"
              }`}
            >
              <span className="font-cute">{m.amount < 0 ? "앗, 손해예요" : "개당 남는 돈"}</span>
              <span className="text-right">
                <b className="font-cute text-xl tabular-nums">{won(m.amount)}</b>
                <span className="ml-2 text-sm text-ink-soft tabular-nums">
                  마진 {m.rate.toFixed(0)}%{m.markup ? ` · ${m.markup.toFixed(1)}배` : ""}
                </span>
              </span>
            </div>
          )}
        </section>

        {/* 구매처 */}
        <section className="card space-y-4 p-4">
          <div>
            <p className="label">어디서 샀나요?</p>
            <div className="flex flex-wrap gap-1.5">
              {sortedSuppliers.map((s) => (
                <button
                  type="button"
                  key={s.id}
                  className="chip"
                  data-on={f.supplier_id === s.id}
                  onClick={() => set("supplier_id", f.supplier_id === s.id ? null : s.id)}
                >
                  {s.favorite && <Star size={12} className="fill-butter-300 text-butter-500" />}
                  {s.name}
                </button>
              ))}
              <button
                type="button"
                className="chip border-dashed text-berry-600"
                onClick={() => setSupplierSheet({})}
              >
                <Plus size={14} /> 새 구매처
              </button>
            </div>
          </div>
          <Field label="구매 링크" hint="상품 페이지 주소를 붙여넣으면 다음에 바로 다시 주문할 수 있어요">
            {(id) => (
              <div className="relative">
                <Link2 size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-faint" />
                <input
                  id={id}
                  className="input pl-10"
                  inputMode="url"
                  placeholder="https://..."
                  value={f.purchase_url ?? ""}
                  onChange={(e) => onPurchaseUrl(e.target.value)}
                />
              </div>
            )}
          </Field>
          {f.purchase_url && !supplierByHost && !f.supplier_id && hostOf(f.purchase_url) && (
            <button
              type="button"
              className="btn-soft btn-sm w-full"
              onClick={() => {
                const url = ensureUrl(f.purchase_url ?? "");
                setSupplierSheet({
                  name: siteNameFromUrl(url) ?? "",
                  website: new URL(url).origin,
                });
              }}
            >
              <Plus size={16} /> ‘{siteNameFromUrl(f.purchase_url)}’ 새 구매처로 저장
            </button>
          )}
          <Field label="구매처 상품명 / 옵션 / 상품번호">
            {(id) => (
              <input
                id={id}
                className="input"
                placeholder="예: [A-123] 곰돌이 키링 브라운"
                value={f.supplier_sku ?? ""}
                onChange={(e) => set("supplier_sku", text(e.target.value))}
              />
            )}
          </Field>
        </section>

        {/* 재고 */}
        <section className="card space-y-4 p-4">
          <div className="grid grid-cols-2 gap-3">
            {product ? (
              <div>
                <p className="label">지금 재고</p>
                <p className="flex min-h-11 items-center font-cute text-2xl tabular-nums">{num(product.stock_qty)}개</p>
                <p className="text-xs text-ink-soft">입고·출고는 상품 화면에서</p>
              </div>
            ) : (
              <Field label="처음 재고">
                {(id) => <Stepper id={id} value={initialStock} onChange={setInitialStock} />}
              </Field>
            )}
            <Field label="품절 알림 기준" hint="이 개수 이하면 발주 목록에 떠요">
              {(id) => <Stepper id={id} value={f.safety_stock} onChange={(v) => set("safety_stock", v)} />}
            </Field>
          </div>
          {!product && (
            <Toggle
              checked={sendLabel}
              onChange={(v) => {
                setSendLabel(v);
                writePref("popo.autoSendLabel", v ? "1" : "0");
              }}
              label="등록하면 라벨도 노트북으로 보내기"
              desc={f.barcode ? `처음 재고만큼 (${Math.max(1, initialStock)}장)` : "바코드가 있을 때만 보내요"}
            />
          )}
        </section>

        {/* 빅솔론 */}
        <section className="card space-y-2 p-4">
          <p className="label">빅솔론 설정</p>
          <Toggle
            checked={f.is_active}
            onChange={(v) => set("is_active", v)}
            label="판매 중"
            desc="끄면 빅솔론 엑셀에 ‘사용 N’으로 나가요"
          />
          <Toggle
            checked={f.kiosk_track_stock}
            onChange={(v) => set("kiosk_track_stock", v)}
            label="빅솔론 재고 사용"
            desc="빅솔론 키오스크에서도 재고를 빼고 싶을 때 켜요"
          />
          <Field label="빅솔론 상품 코드" hint="빅솔론에 이미 등록된 상품을 엑셀로 수정할 때만 (예: S000005)" className="pt-2">
            {(id) => (
              <input
                id={id}
                className="input font-mono"
                value={f.kiosk_code ?? ""}
                onChange={(e) => set("kiosk_code", text(e.target.value))}
              />
            )}
          </Field>
          <details className="group pt-2">
            <summary className="cursor-pointer list-none font-cute text-[15px] text-berry-600">
              🌏 외국어 이름 · 설명 <span className="text-xs text-ink-soft">(선택)</span>
            </summary>
            <div className="mt-3 space-y-3">
              <Field label="상품 설명">
                {(id) => (
                  <textarea
                    id={id}
                    className="input min-h-16"
                    value={f.description ?? ""}
                    onChange={(e) => set("description", text(e.target.value))}
                  />
                )}
              </Field>
              {(
                [
                  ["name_en", "영어 이름"],
                  ["name_zh", "중국어 이름"],
                  ["name_ja", "일본어 이름"],
                  ["description_en", "영어 설명"],
                  ["description_zh", "중국어 설명"],
                  ["description_ja", "일본어 설명"],
                ] as const
              ).map(([k, label]) => (
                <Field key={k} label={label}>
                  {(id) => (
                    <input id={id} className="input" value={f[k] ?? ""} onChange={(e) => set(k, text(e.target.value))} />
                  )}
                </Field>
              ))}
            </div>
          </details>
        </section>

        {/* 메모 */}
        <section className="card space-y-4 p-4">
          <Field label="태그" hint="쉼표로 구분 (예: 신상, 인기, 시즌)">
            {(id) => (
              <input
                id={id}
                className="input"
                value={f.tags.join(", ")}
                onChange={(e) =>
                  set(
                    "tags",
                    e.target.value
                      .split(",")
                      .map((t) => t.trim())
                      .filter((t, i, arr) => t || i === arr.length - 1),
                  )
                }
                onBlur={() => set("tags", f.tags.filter(Boolean))}
              />
            )}
          </Field>
          <Field label="메모">
            {(id) => (
              <textarea
                id={id}
                className="input min-h-20"
                placeholder="예: 진열 위치, 색상 옵션, 재주문 주의사항"
                value={f.memo ?? ""}
                onChange={(e) => set("memo", text(e.target.value))}
              />
            )}
          </Field>
        </section>

        <button type="button" className="btn-primary w-full text-lg" onClick={save} disabled={busy || compressing}>
          {busy ? "저장 중..." : product ? "수정 완료" : "등록하기"}
        </button>
      </div>

      <Sheet open={scanOpen} onClose={() => setScanOpen(false)} title="바코드 스캔">
        {scanOpen && (
          <BarcodeScanner
            className="aspect-[4/3]"
            onDetected={(code) => {
              set("barcode", code);
              setScanOpen(false);
            }}
          />
        )}
        <p className="mt-3 text-center text-sm text-ink-soft">바코드를 네모 칸 안에 맞춰 주세요</p>
      </Sheet>

      <SupplierSheet
        open={supplierSheet !== null}
        onClose={() => setSupplierSheet(null)}
        initial={supplierSheet ?? undefined}
        onSaved={(s: Supplier) => set("supplier_id", s.id)}
      />
    </div>
  );
}
