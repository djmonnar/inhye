"use client";

import { useState } from "react";
import { siteNameFromUrl } from "@/lib/format";
import { useRefresh } from "@/lib/queries";
import { store } from "@/lib/store";
import type { Supplier, SupplierInput, SupplierKind } from "@/lib/types";
import { useToast } from "./providers";
import { Field, Segmented, Sheet, Toggle } from "./ui";

export const KIND_LABEL: Record<SupplierKind, string> = {
  online: "온라인",
  wholesale: "도매",
  offline: "오프라인",
  etc: "기타",
};

export const KIND_STYLE: Record<SupplierKind, string> = {
  online: "bg-soda-100 text-soda-700",
  wholesale: "bg-berry-100 text-berry-700",
  offline: "bg-matcha-100 text-matcha-700",
  etc: "bg-butter-100 text-butter-700",
};

export function emptySupplier(partial: Partial<SupplierInput> = {}): SupplierInput {
  return {
    name: "",
    kind: "online",
    website: null,
    contact: null,
    phone: null,
    order_note: null,
    memo: null,
    favorite: false,
    ...partial,
  };
}

export function SupplierSheet({
  open,
  onClose,
  supplier,
  initial,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  supplier?: Supplier;
  initial?: Partial<SupplierInput>;
  onSaved?: (s: Supplier) => void;
}) {
  return (
    <Sheet open={open} onClose={onClose} title={supplier ? "구매처 수정" : "새 구매처"}>
      {open && (
        <SupplierForm
          supplier={supplier}
          initial={initial}
          onSaved={(s) => {
            onSaved?.(s);
            onClose();
          }}
        />
      )}
    </Sheet>
  );
}

function SupplierForm({
  supplier,
  initial,
  onSaved,
}: {
  supplier?: Supplier;
  initial?: Partial<SupplierInput>;
  onSaved: (s: Supplier) => void;
}) {
  const toast = useToast();
  const refresh = useRefresh();
  const [f, setF] = useState<SupplierInput>(() => {
    if (!supplier) return emptySupplier(initial);
    const { id: _id, created_at: _c, updated_at: _u, ...rest } = supplier;
    return rest;
  });
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof SupplierInput>(k: K, v: SupplierInput[K]) => setF((p) => ({ ...p, [k]: v }));
  const text = (v: string) => (v.trim() ? v.trim() : null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!f.name.trim()) {
      toast("구매처 이름을 적어 주세요", "sad");
      return;
    }
    setBusy(true);
    try {
      const saved = await store().saveSupplier({ ...f, name: f.name.trim() }, supplier?.id);
      await refresh("suppliers");
      toast(supplier ? "수정했어요" : "구매처를 추가했어요", "wow");
      onSaved(saved);
    } catch (err) {
      toast(err instanceof Error ? err.message : "저장하지 못했어요", "sad");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Segmented<SupplierKind>
        value={f.kind}
        onChange={(v) => set("kind", v)}
        options={(Object.keys(KIND_LABEL) as SupplierKind[]).map((k) => ({ value: k, label: KIND_LABEL[k] }))}
      />
      <Field label="이름 *">
        {(id) => (
          <input
            id={id}
            className="input"
            placeholder="예: 도매꾹, 남대문 OO상가"
            value={f.name}
            onChange={(e) => set("name", e.target.value)}
          />
        )}
      </Field>
      <Field label="사이트 주소" hint="주소를 붙여넣으면 이름을 자동으로 채워드려요">
        {(id) => (
          <input
            id={id}
            className="input"
            inputMode="url"
            placeholder="https://"
            value={f.website ?? ""}
            onChange={(e) => {
              const v = e.target.value;
              set("website", text(v));
              if (!f.name.trim()) {
                const guess = siteNameFromUrl(v);
                if (guess) set("name", guess);
              }
            }}
          />
        )}
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="담당자 / 카톡ID">
          {(id) => (
            <input id={id} className="input" value={f.contact ?? ""} onChange={(e) => set("contact", text(e.target.value))} />
          )}
        </Field>
        <Field label="전화번호">
          {(id) => (
            <input
              id={id}
              className="input"
              inputMode="tel"
              value={f.phone ?? ""}
              onChange={(e) => set("phone", text(e.target.value))}
            />
          )}
        </Field>
      </div>
      <Field label="주문 조건" hint="최소 주문금액, 배송비, 배송 기간 등">
        {(id) => (
          <input
            id={id}
            className="input"
            placeholder="예: 3만원 이상 무료배송 · 2일 소요"
            value={f.order_note ?? ""}
            onChange={(e) => set("order_note", text(e.target.value))}
          />
        )}
      </Field>
      <Field label="메모">
        {(id) => (
          <textarea
            id={id}
            className="input min-h-20"
            placeholder="예: 매장 위치, 영업시간, 결제 방법"
            value={f.memo ?? ""}
            onChange={(e) => set("memo", text(e.target.value))}
          />
        )}
      </Field>
      <Toggle checked={f.favorite} onChange={(v) => set("favorite", v)} label="⭐ 자주 쓰는 곳" />
      <button type="submit" className="btn-primary w-full" disabled={busy}>
        {busy ? "저장 중..." : "저장하기"}
      </button>
    </form>
  );
}
