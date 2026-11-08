"use client";

import { useState } from "react";
import { won } from "@/lib/format";
import type { AiProductDraft, ProductInput } from "@/lib/types";
import { Mascot } from "./Mascot";
import { Sheet } from "./ui";

export type AiField = Exclude<keyof AiProductDraft, "note">;

const ROWS: [AiField, string][] = [
  ["name", "상품명"],
  ["category", "카테고리"],
  ["cost_price", "매입가 (원가)"],
  ["supplier_sku", "구매처 상품명 / 옵션"],
  ["tags", "태그"],
  ["description", "상품 설명"],
  ["name_en", "영어 이름"],
  ["name_zh", "중국어 이름"],
  ["name_ja", "일본어 이름"],
  ["description_en", "영어 설명"],
  ["description_zh", "중국어 설명"],
  ["description_ja", "일본어 설명"],
];

export const FOREIGN_KEYS: AiField[] = ["name_en", "name_zh", "name_ja", "description_en", "description_zh", "description_ja"];

/** Display text for a field; "" means empty (0원 counts as empty). */
function show(v: string | number | string[] | null | undefined): string {
  if (Array.isArray(v)) return v.join(", ");
  if (typeof v === "number") return v > 0 ? won(v) : "";
  return v ?? "";
}

/** Lets the owner pick which AI suggestions go into the form. Nothing is saved until they press 저장. */
export function AiFillSheet({
  draft,
  current,
  title = "✨ AI가 읽은 내용",
  onClose,
  onApply,
}: {
  draft: AiProductDraft | null;
  current: ProductInput;
  title?: string;
  onClose: () => void;
  onApply: (patch: Partial<ProductInput>, keys: AiField[]) => void;
}) {
  return (
    <Sheet open={draft !== null} onClose={onClose} title={title}>
      {draft && <AiFillBody draft={draft} current={current} onClose={onClose} onApply={onApply} />}
    </Sheet>
  );
}

function AiFillBody({
  draft,
  current,
  onClose,
  onApply,
}: {
  draft: AiProductDraft;
  current: ProductInput;
  onClose: () => void;
  onApply: (patch: Partial<ProductInput>, keys: AiField[]) => void;
}) {
  const rows = ROWS.filter(([k]) => show(draft[k]));
  // 비어 있는 칸만 미리 골라 둬요. 이미 적어 둔 값은 직접 체크해야 바뀌어요.
  const [picked, setPicked] = useState<Set<AiField>>(
    () => new Set(rows.filter(([k]) => !show(current[k])).map(([k]) => k)),
  );

  const toggle = (k: AiField) =>
    setPicked((s) => {
      const next = new Set(s);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });

  function apply() {
    const patch: Partial<ProductInput> = {};
    for (const k of picked) {
      if (k === "tags") patch.tags = draft.tags;
      else if (k === "cost_price") patch.cost_price = draft.cost_price ?? 0;
      else patch[k] = draft[k] ?? "";
    }
    onApply(patch, [...picked]);
  }

  if (!rows.length) {
    return (
      <div className="flex flex-col items-center gap-3 pb-2 text-center">
        <Mascot mood="sad" size={84} />
        <p className="text-ink-soft">{draft.note || "상품을 찾지 못했어요. 상품이 잘 보이게 다시 찍어 주세요."}</p>
        <button type="button" className="btn-soft w-full" onClick={onClose}>
          닫기
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3 pb-2">
      {draft.note && <p className="rounded-2xl bg-butter-100 px-4 py-3 text-sm">💡 {draft.note}</p>}
      <p className="text-sm text-ink-soft">채울 칸을 골라 주세요. 채운 뒤에도 고칠 수 있고, 저장해야 반영돼요.</p>
      <ul className="space-y-2">
        {rows.map(([k, label]) => {
          const now = show(current[k]);
          const next = show(draft[k]);
          return (
            <li key={k}>
              <label className="card flex cursor-pointer items-start gap-3 p-3">
                <input
                  type="checkbox"
                  className="mt-1 h-5 w-5 shrink-0 accent-berry-500"
                  checked={picked.has(k)}
                  onChange={() => toggle(k)}
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-xs text-ink-soft">{label}</span>
                  <span className="block break-words font-medium">{next}</span>
                  {now && now !== next && (
                    <span className="mt-0.5 block break-words text-xs text-ink-faint">지금: {now}</span>
                  )}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
      <div className="grid grid-cols-2 gap-2 pt-1">
        <button type="button" className="btn-soft" onClick={onClose}>
          취소
        </button>
        <button type="button" className="btn-primary" disabled={!picked.size} onClick={apply}>
          {picked.size}칸 채우기
        </button>
      </div>
    </div>
  );
}
