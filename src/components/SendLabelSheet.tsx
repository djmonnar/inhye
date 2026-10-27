"use client";

import { Send } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { IS_DEMO } from "@/lib/config";
import { useRefresh } from "@/lib/queries";
import { store } from "@/lib/store";
import type { PrintStyle, Product } from "@/lib/types";
import { useAuth, useToast } from "./providers";
import { Field, Segmented, Sheet, Stepper } from "./ui";

/** 폰에서 노트북 ‘인쇄 스테이션’으로 라벨을 보내요. */
export function SendLabelSheet({ product, open, onClose }: { product: Product; open: boolean; onClose: () => void }) {
  const toast = useToast();
  const refresh = useRefresh();
  const { user } = useAuth();
  const [copies, setCopies] = useState(1);
  const [style, setStyle] = useState<PrintStyle>("label");
  const [busy, setBusy] = useState(false);

  async function send() {
    setBusy(true);
    try {
      await store().addPrintJobs([{ product_id: product.id, copies, style }], user?.display_name ?? "");
      await refresh("print-jobs");
      toast(`${copies}장 노트북으로 보냈어요!`, "wow");
      onClose();
    } catch (e) {
      toast(e instanceof Error ? e.message : "보내지 못했어요", "sad");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title="노트북으로 라벨 보내기">
      <div className="space-y-4">
        <Segmented<PrintStyle>
          value={style}
          onChange={setStyle}
          options={[
            { value: "label", label: "🏷️ 바코드 라벨" },
            { value: "price", label: "💰 가격표" },
          ]}
        />
        <Field label="몇 장?">
          {(id) => (
            <>
              <Stepper id={id} value={copies} onChange={(n) => setCopies(Math.min(500, Math.max(1, n)))} min={1} />
              {product.stock_qty > 1 && (
                <button type="button" className="chip mt-2" onClick={() => setCopies(Math.min(500, product.stock_qty))}>
                  재고만큼 {product.stock_qty}장
                </button>
              )}
            </>
          )}
        </Field>
        {!product.barcode && style === "label" && (
          <p className="rounded-2xl bg-butter-100 p-3 text-sm text-butter-700">이 상품은 바코드가 없어요. 수정 화면에서 ‘매장용 바코드’를 먼저 만들어 주세요.</p>
        )}
        <button type="button" className="btn-primary w-full text-lg" disabled={busy} onClick={send}>
          <Send size={18} /> {busy ? "보내는 중..." : `${copies}장 보내기`}
        </button>
        <p className="text-center text-xs text-ink-soft">
          노트북에서{" "}
          <Link href="/print-station" className="font-semibold text-berry-600 underline">
            인쇄 스테이션
          </Link>
          을 켜두면 바로 나와요.{IS_DEMO && " (체험 모드는 같은 기기에서만)"}
        </p>
      </div>
    </Sheet>
  );
}
