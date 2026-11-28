"use client";

import { Copy, Minus, Plus, Sparkles, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { readPref, writePref } from "@/components/labels";
import { useAuth, useToast } from "@/components/providers";
import { MoneyInput } from "@/components/ui";
import { cleanBarcodeInput, shortDate, STORE_CODE_LENGTHS, won, type StoreCodeLength } from "@/lib/format";
import { useRefresh } from "@/lib/queries";
import { store } from "@/lib/store";
import type { BarcodeIssue, Product } from "@/lib/types";

/** 라벨 인쇄 목록에서 ‘상품 없이 만든 바코드’를 상품처럼 다루려고 붙이는 id 앞글자 */
export const ISSUE_PREFIX = "issue:";
export const isIssueItem = (p: Pick<Product, "id">) => p.id.startsWith(ISSUE_PREFIX);

/** 상품 없이 만든 바코드 → 라벨 그리기용 상품 모양 (이름·바코드·가격만 써요) */
export function issueAsProduct(i: BarcodeIssue): Product {
  return {
    id: `${ISSUE_PREFIX}${i.id}`,
    name: i.name ?? "",
    category: "",
    barcode: i.code,
    kiosk_code: null,
    supplier_id: null,
    purchase_url: null,
    supplier_sku: null,
    cost_price: 0,
    sale_price: i.price ?? 0,
    stock_qty: 0,
    safety_stock: 0,
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
    kiosk_synced_at: null,
    kiosk_changed_at: i.created_at,
    created_at: i.created_at,
    updated_at: i.created_at,
  };
}

/**
 * 상품 등록 없이 매장용 바코드(200…)만 만들어 라벨로 뽑아요 — 빅솔론에 상품을 먼저 등록할 때.
 * 만든 번호는 DB에 남겨서(barcode_issues, v10) 나중에 다른 상품이 같은 번호를 받지 않아요.
 */
export function BarcodeMaker({
  issues,
  copies,
  setCopies,
}: {
  issues: BarcodeIssue[];
  copies: Record<string, number>;
  setCopies: (fn: (c: Record<string, number>) => Record<string, number>) => void;
}) {
  const toast = useToast();
  const refresh = useRefresh();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [name, setName] = useState("");
  const [price, setPrice] = useState(0);
  const [busy, setBusy] = useState(false);
  // 번호: 자동(다음 매장용 번호) 또는 직접 정하기
  const [mode, setMode] = useState<"auto" | "custom">("auto");
  const [customCode, setCustomCode] = useState("");
  /** 자동 번호로 몇 개 만들지 */
  const [count, setCount] = useState(1);
  /** 자동 번호 자릿수 (이 기기에 기억) */
  const [len, setLen] = useState<StoreCodeLength>(13);
  useEffect(() => {
    const saved = Number(readPref("popo.barcodeLength"));
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 기기에 기억한 자릿수는 화면이 뜬 뒤에만 읽을 수 있어요
    if ((STORE_CODE_LENGTHS as readonly number[]).includes(saved)) setLen(saved as StoreCodeLength);
  }, []);
  /** 한 개당 몇 장 뽑을지 */
  const [each, setEach] = useState(1);
  const [last, setLast] = useState<BarcodeIssue[]>([]);
  const [showAll, setShowAll] = useState(false);

  const key = (i: BarcodeIssue) => `${ISSUE_PREFIX}${i.id}`;
  const setN = (i: BarcodeIssue, n: number) => setCopies((c) => ({ ...c, [key(i)]: Math.max(0, Math.min(500, n)) }));

  const customOk = mode === "auto" || cleanBarcodeInput(customCode) !== null;

  async function make() {
    if (!customOk) {
      toast("번호는 숫자·영문으로 3~30자예요", "sad");
      return;
    }
    setBusy(true);
    try {
      const made = await store().issueBarcodes({
        name: name.trim() || null,
        price: price > 0 ? price : null,
        ...(mode === "custom" ? { code: customCode } : { count, length: len }),
      });
      setLast(made);
      setCopies((c) => ({ ...c, ...Object.fromEntries(made.map((i) => [key(i), each])) }));
      setName("");
      setPrice(0);
      setCustomCode("");
      await refresh("barcode-issues");
      toast(
        `바코드 ${made.length}개 × ${each}장 = ${made.length * each}장을 담았어요! 위에서 인쇄하고, 빅솔론 상품에도 번호를 넣어 주세요`,
        "wow",
      );
    } catch (e) {
      toast(e instanceof Error ? e.message : "바코드를 만들지 못했어요", "sad");
    } finally {
      setBusy(false);
    }
  }

  async function copy(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      toast(code.includes("\n") ? "번호를 모두 복사했어요 (한 줄에 하나씩)" : "번호를 복사했어요. 빅솔론 상품 바코드 칸에 붙여 넣으세요", "wink");
    } catch {
      toast("복사하지 못했어요. 번호를 보고 직접 넣어 주세요", "sad");
    }
  }

  /** 목록에서 지우기 (관리자) — 번호는 ‘쓴 번호’로 남겨서 다른 상품이 다시 받지 않아요 */
  async function hide(i: BarcodeIssue) {
    const label = i.name ? `‘${i.name}’ 바코드(${i.code})` : `바코드 ${i.code}`;
    if (!window.confirm(`목록에서 지울까요?\n${label}\n\n이 번호는 다시 쓰지 않아요 (이미 붙인 라벨과 겹치지 않게).`)) return;
    try {
      await store().hideBarcodeIssue(i.id);
      setCopies((c) => {
        const next = { ...c };
        delete next[key(i)];
        return next;
      });
      setLast((l) => l.filter((x) => x.id !== i.id));
      await refresh("barcode-issues");
      toast("목록에서 지웠어요", "wink");
    } catch (e) {
      toast(e instanceof Error ? e.message : "지우지 못했어요", "sad");
    }
  }

  const list = showAll ? issues : issues.slice(0, 5);

  return (
    <section className="card space-y-3 p-4">
      <div>
        <p className="font-cute text-lg">🆕 상품 없이 바코드만 만들기</p>
        <p className="text-xs text-ink-soft">
          빅솔론에 상품을 등록하기 전에 바코드부터 만들어 붙일 때 써요. 만든 번호는 기록해 둬서 다른 상품과 겹치지 않아요. 이름 · 가격은 라벨에 찍을 글이라 비워도 돼요.
        </p>
      </div>
      <div className="grid grid-cols-[1fr_8.5rem] gap-2">
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="이름 (선택)" aria-label="라벨에 찍을 이름" maxLength={40} />
        <MoneyInput value={price} onChange={setPrice} placeholder="가격 (선택)" />
      </div>
      <div className="flex gap-1.5">
        <button type="button" className="chip" data-on={mode === "auto"} onClick={() => setMode("auto")}>
          자동 번호
        </button>
        <button type="button" className="chip" data-on={mode === "custom"} onClick={() => setMode("custom")}>
          번호 직접 정하기
        </button>
      </div>
      {mode === "custom" ? (
        <div>
          <input
            className="input font-mono"
            value={customCode}
            onChange={(e) => setCustomCode(e.target.value)}
            placeholder="바코드 번호 (숫자·영문 3~30자)"
            aria-label="바코드 번호 직접 입력"
            inputMode="numeric"
            autoComplete="off"
            maxLength={30}
          />
          <p className={`mt-1 text-xs ${customCode && !customOk ? "text-danger" : "text-ink-faint"}`}>
            {customCode && !customOk
              ? "숫자·영문(그리고 -)으로 3~30자만 돼요"
              : "13자리 매장용(200…)이 아니면 일반 바코드(CODE128)로 그려요. 이미 있는 상품 바코드와 같으면 안 돼요."}
          </p>
        </div>
      ) : (
        <>
          <div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm">번호 자릿수</span>
              <div className="flex gap-1.5">
                {STORE_CODE_LENGTHS.map((n) => (
                  <button
                    key={n}
                    type="button"
                    className="chip"
                    data-on={len === n}
                    onClick={() => {
                      setLen(n);
                      writePref("popo.barcodeLength", String(n));
                    }}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
            <p className="mt-1 text-xs text-ink-faint">{LEN_HINT[len]}</p>
          </div>
          <Stepper label="몇 개 만들까요 (번호 각각 다르게)" value={count} min={1} max={50} onChange={setCount} />
        </>
      )}
      <Stepper label="한 개당 몇 장 뽑을까요" value={each} min={1} max={100} onChange={setEach} />

      <button type="button" className="btn-primary w-full" disabled={busy || !customOk || (mode === "custom" && !customCode.trim())} onClick={make}>
        <Sparkles size={18} />{" "}
        {busy
          ? "만드는 중..."
          : mode === "custom"
            ? `이 번호로 만들기 · ${each}장`
            : `새 바코드 ${count}개 만들기 · 모두 ${count * each}장`}
      </button>

      {last.length > 0 && (
        <div className="rounded-2xl bg-matcha-100 p-3 text-center text-matcha-700">
          <p className="text-xs">
            새 바코드 {last.length}개{last[0].name ? ` · ${last[0].name}` : ""}
          </p>
          {last.length === 1 ? (
            <p className="font-mono text-2xl tracking-wider text-ink">{last[0].code}</p>
          ) : (
            <p className="font-mono text-base text-ink">
              {last[0].code} ~ {last[last.length - 1].code}
            </p>
          )}
          <button type="button" className="btn-soft btn-sm mt-1" onClick={() => copy(last.map((i) => i.code).join("\n"))}>
            <Copy size={14} /> {last.length === 1 ? "번호 복사" : "번호 모두 복사"}
          </button>
        </div>
      )}

      {issues.length > 0 && (
        <div>
          <p className="mb-1 text-sm font-semibold">최근 만든 바코드 {issues.length}개</p>
          <ul className="divide-y-2 divide-dashed divide-line">
            {list.map((i) => {
              const n = copies[key(i)] ?? 0;
              return (
                <li key={i.id} className="flex items-center gap-2 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">
                      {i.name || <span className="text-ink-faint">(이름 없음)</span>}
                      {i.price ? <span className="ml-1 text-xs text-ink-soft">{won(i.price)}</span> : null}
                    </p>
                    <p className="font-mono text-xs text-ink-soft">
                      {i.code} · {shortDate(i.created_at)}
                    </p>
                  </div>
                  <button type="button" className="btn-ghost btn-sm h-8 w-8 px-0" aria-label={`${i.code} 번호 복사`} onClick={() => copy(i.code)}>
                    <Copy size={14} />
                  </button>
                  {isAdmin && (
                    <button type="button" className="btn-ghost btn-sm h-8 w-8 px-0 text-ink-faint" aria-label={`${i.code} 지우기`} onClick={() => void hide(i)}>
                      <Trash2 size={14} />
                    </button>
                  )}
                  <div className="flex items-center gap-1">
                    <button type="button" className="btn-soft btn-sm h-8 w-8 px-0" aria-label="한 장 빼기" disabled={n === 0} onClick={() => setN(i, n - 1)}>
                      <Minus size={14} />
                    </button>
                    <span className="w-6 text-center font-cute">{n}</span>
                    <button type="button" className="btn-soft btn-sm h-8 w-8 px-0" aria-label="한 장 더하기" onClick={() => setN(i, n + 1)}>
                      <Plus size={14} />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
          {issues.length > 5 && (
            <button type="button" className="btn-ghost btn-sm mt-1 w-full" onClick={() => setShowAll((v) => !v)}>
              {showAll ? "접기" : `${issues.length - 5}개 더 보기`}
            </button>
          )}
        </div>
      )}
    </section>
  );
}

const LEN_HINT: Record<StoreCodeLength, string> = {
  8: "8자리 짧은 표준 바코드(EAN-8) · 예: 2000001… — 작은 라벨에 좋아요",
  10: "10자리 일반 바코드(CODE128) · 예: 2000000001",
  12: "12자리 일반 바코드(CODE128) · 예: 200000000001",
  13: "13자리 매장용 표준 바코드(EAN-13) · 예: 2000000000015 — 기본",
};

/** − 숫자 + (직접 입력도 돼요) */
function Stepper({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (n: number) => void }) {
  const clamp = (n: number) => Math.max(min, Math.min(max, Number.isFinite(n) ? Math.round(n) : min));
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-sm">{label}</span>
      <div className="flex items-center gap-1">
        <button type="button" className="btn-soft btn-sm h-9 w-9 px-0" aria-label={`${label} 줄이기`} disabled={value <= min} onClick={() => onChange(clamp(value - 1))}>
          <Minus size={14} />
        </button>
        <input
          className="input h-9 w-14 px-1 text-center font-cute"
          inputMode="numeric"
          aria-label={label}
          value={value}
          onChange={(e) => onChange(clamp(Number(e.target.value.replace(/\D/g, "")) || min))}
        />
        <button type="button" className="btn-soft btn-sm h-9 w-9 px-0" aria-label={`${label} 늘리기`} disabled={value >= max} onClick={() => onChange(clamp(value + 1))}>
          <Plus size={14} />
        </button>
      </div>
    </div>
  );
}
