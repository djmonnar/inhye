"use client";

import { ChevronLeft, Minus, Plus, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useState, type ReactNode } from "react";
import { num, stockLevel } from "@/lib/format";
import { store } from "@/lib/store";
import type { Product } from "@/lib/types";
import { Mascot, type Mood } from "./Mascot";

export function PageHeader({
  title,
  back,
  right,
  sub,
}: {
  title: ReactNode;
  back?: boolean | string;
  right?: ReactNode;
  sub?: ReactNode;
}) {
  const router = useRouter();
  return (
    <header
      className="sticky top-0 z-30 -mx-4 mb-3 flex items-center gap-2 bg-cream/90 px-4 pb-2 backdrop-blur-md"
      style={{ paddingTop: "calc(env(safe-area-inset-top) + 0.75rem)" }}
    >
      {back &&
        (typeof back === "string" ? (
          <Link href={back} className="btn-ghost -ml-3 px-2" aria-label="뒤로">
            <ChevronLeft size={26} />
          </Link>
        ) : (
          <button
            type="button"
            onClick={() => (history.length > 1 ? router.back() : router.push("/"))}
            className="btn-ghost -ml-3 px-2"
            aria-label="뒤로"
          >
            <ChevronLeft size={26} />
          </button>
        ))}
      <div className="min-w-0 flex-1">
        <h1 className="truncate font-cute text-[22px] leading-tight">{title}</h1>
        {sub && <p className="truncate text-xs text-ink-soft">{sub}</p>}
      </div>
      {right}
    </header>
  );
}

export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
      <button
        type="button"
        aria-label="닫기"
        className="absolute inset-0 bg-ink/30 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <div
        className="relative max-h-[92dvh] w-full max-w-lg animate-slide-up overflow-y-auto rounded-t-[2rem] border-2 border-line bg-cream px-5 pt-3 sm:animate-pop-in sm:rounded-[2rem]"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 1.25rem)" }}
      >
        <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-line sm:hidden" />
        <div className="mb-3 flex items-center gap-2">
          <h2 className="flex-1 font-cute text-xl">{title}</h2>
          <button type="button" onClick={onClose} className="btn-ghost px-2" aria-label="닫기">
            <X size={22} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function ConfirmSheet({
  open,
  onClose,
  onConfirm,
  title,
  desc,
  confirmText = "확인",
  danger,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  desc?: ReactNode;
  confirmText?: string;
  danger?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <div className="flex flex-col items-center gap-3 pb-2 text-center">
        <Mascot mood={danger ? "sad" : "wow"} size={84} />
        {desc && <p className="text-ink-soft">{desc}</p>}
        <div className="mt-2 grid w-full grid-cols-2 gap-2">
          <button type="button" className="btn-soft" onClick={onClose}>
            취소
          </button>
          <button
            type="button"
            disabled={busy}
            className={danger ? "btn border-danger bg-danger text-white" : "btn-primary"}
            onClick={async () => {
              setBusy(true);
              try {
                await onConfirm();
                onClose();
              } finally {
                setBusy(false);
              }
            }}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </Sheet>
  );
}

export function EmptyState({
  mood = "sleep",
  title,
  desc,
  action,
}: {
  mood?: Mood;
  title: string;
  desc?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center px-6 py-10 text-center">
      <Mascot mood={mood} size={110} className="animate-float" />
      <p className="mt-3 font-cute text-lg">{title}</p>
      {desc && <p className="mt-1 text-sm text-ink-soft">{desc}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Loading({ text = "불러오는 중..." }: { text?: string }) {
  return (
    <div className="flex flex-col items-center py-16 text-ink-soft">
      <Mascot mood="happy" size={72} className="animate-float" />
      <p className="mt-2 font-cute">{text}</p>
    </div>
  );
}

export function Field({
  label,
  hint,
  children,
  className = "",
}: {
  label: ReactNode;
  hint?: ReactNode;
  children: (id: string) => ReactNode;
  className?: string;
}) {
  const id = useId();
  return (
    <div className={className}>
      <label htmlFor={id} className="label">
        {label}
      </label>
      {children(id)}
      {hint && <p className="mt-1 text-xs text-ink-soft">{hint}</p>}
    </div>
  );
}

export function MoneyInput({
  id,
  value,
  onChange,
  placeholder = "0",
  suffix = "원",
}: {
  id?: string;
  value: number;
  onChange: (n: number) => void;
  placeholder?: string;
  suffix?: string;
}) {
  return (
    <div className="relative">
      <input
        id={id}
        className="input pr-10 text-right font-semibold tabular-nums"
        inputMode="numeric"
        placeholder={placeholder}
        value={value ? num(value) : ""}
        onChange={(e) => {
          const digits = e.target.value.replace(/[^\d]/g, "");
          onChange(digits ? Math.min(Number(digits), 999_999_999) : 0);
        }}
      />
      <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-ink-soft">{suffix}</span>
    </div>
  );
}

export function Stepper({
  value,
  onChange,
  min = 0,
  id,
}: {
  value: number;
  onChange: (n: number) => void;
  min?: number;
  id?: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        className="btn-soft h-11 w-11 shrink-0 px-0"
        aria-label="하나 빼기"
        onClick={() => onChange(Math.max(min, value - 1))}
      >
        <Minus size={18} />
      </button>
      <input
        id={id}
        className="input text-center font-semibold tabular-nums"
        inputMode="numeric"
        value={String(value)}
        onChange={(e) => {
          const raw = e.target.value.replace(/[^\d-]/g, "");
          const n = Number(raw);
          onChange(Number.isFinite(n) ? Math.max(min, n) : min);
        }}
      />
      <button
        type="button"
        className="btn-soft h-11 w-11 shrink-0 px-0"
        aria-label="하나 더하기"
        onClick={() => onChange(value + 1)}
      >
        <Plus size={18} />
      </button>
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  desc,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: ReactNode;
  desc?: ReactNode;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-3 py-1">
      <span className="flex-1">
        <span className="block font-cute text-[15px]">{label}</span>
        {desc && <span className="block text-xs text-ink-soft">{desc}</span>}
      </span>
      <input
        type="checkbox"
        className="peer sr-only"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="relative h-7 w-12 shrink-0 rounded-full border-2 border-line bg-cream-deep transition peer-checked:border-berry-500 peer-checked:bg-berry-400 peer-focus-visible:ring-4 peer-focus-visible:ring-berry-100 after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow after:transition peer-checked:after:translate-x-5" />
    </label>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: ReactNode }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex gap-1 rounded-2xl border-2 border-line bg-cream-deep p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`flex-1 rounded-xl px-2 py-1.5 font-cute text-sm transition ${
            value === o.value ? "bg-white text-berry-600 shadow-sm" : "text-ink-soft"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

const CATEGORY_EMOJI: [RegExp, string][] = [
  [/키링|열쇠/, "🔑"],
  [/인형|봉제/, "🧸"],
  [/문구|펜|노트|볼펜/, "✏️"],
  [/스티커|씰/, "🌈"],
  [/헤어|머리|핀|곱창/, "🎀"],
  [/파우치|가방|지갑/, "👛"],
  [/액세서리|반지|목걸이|귀걸이/, "💍"],
  [/폰|케이스|그립/, "📱"],
  [/컵|그릇|머그|식기/, "☕"],
  [/향|캔들|초/, "🕯️"],
  [/간식|과자|사탕|젤리/, "🍬"],
  [/음료/, "🥤"],
  [/생활|리빙|거울/, "🏠"],
  [/양말|의류|옷/, "🧦"],
];

export function categoryEmoji(category: string): string {
  for (const [re, e] of CATEGORY_EMOJI) if (re.test(category)) return e;
  return "🎁";
}

export function ProductThumb({
  product,
  className = "h-16 w-16",
  frame = "rounded-2xl border-2",
}: {
  product: Pick<Product, "image_path" | "category" | "name">;
  className?: string;
  frame?: string;
}) {
  const url = store().imageUrl(product.image_path);
  return (
    <div className={`${className} ${frame} relative shrink-0 overflow-hidden border-line bg-berry-50`}>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={product.name} className="h-full w-full object-cover" loading="lazy" />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-[min(2.2rem,60%)]">
          <span className="text-2xl">{categoryEmoji(product.category)}</span>
        </div>
      )}
    </div>
  );
}

export function StockBadge({ product }: { product: Pick<Product, "stock_qty" | "safety_stock"> }) {
  const level = stockLevel(product);
  if (level === "out") return <span className="badge bg-danger/10 text-danger">품절</span>;
  if (level === "low")
    return <span className="badge bg-butter-100 text-butter-700">재고 {num(product.stock_qty)}</span>;
  return <span className="badge bg-matcha-100 text-matcha-700">재고 {num(product.stock_qty)}</span>;
}
