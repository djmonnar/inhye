"use client";

import { Copy, RefreshCw, Sparkles } from "lucide-react";
import { useState } from "react";
import { store } from "@/lib/store";
import type { Product, PromoDraft } from "@/lib/types";
import { Mascot } from "./Mascot";
import { useToast } from "./providers";
import { Segmented, Sheet } from "./ui";

type Channel = "instagram" | "daangn" | "kakao";

const FOCUS_CHIPS = ["오늘 입고", "재입고", "선물 추천", "한정 수량", "시즌 신상"];

function promoText(promo: PromoDraft, channel: Channel): string {
  if (channel === "instagram") {
    const tags = promo.instagram.hashtags.map((t) => `#${t}`).join(" ");
    return tags ? `${promo.instagram.text}\n\n${tags}` : promo.instagram.text;
  }
  if (channel === "daangn") return `${promo.daangn.title}\n\n${promo.daangn.text}`;
  return promo.kakao.text;
}

/** Writes Instagram / 당근 / 카톡 채널 posts for one product. */
export function PromoSheet({ product, open, onClose }: { product: Product; open: boolean; onClose: () => void }) {
  const toast = useToast();
  const [focus, setFocus] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [promo, setPromo] = useState<PromoDraft | null>(null);
  const [channel, setChannel] = useState<Channel>("instagram");

  async function write() {
    setError("");
    setBusy(true);
    try {
      const url = store().imageUrl(product.image_path);
      const image = url ? await fetch(url).then((r) => (r.ok ? r.blob() : null)).catch(() => null) : null;
      setPromo(
        await store().writePromo(
          {
            name: product.name,
            category: product.category,
            sale_price: product.sale_price,
            tags: product.tags,
            description: product.description,
            focus: focus.trim(),
          },
          image,
        ),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "글을 쓰지 못했어요.");
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!promo) return;
    try {
      await navigator.clipboard.writeText(promoText(promo, channel));
      toast("복사했어요! 붙여넣기만 하면 돼요", "wink");
    } catch {
      toast("복사하지 못했어요", "sad");
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title="✨ 홍보 글 쓰기">
      <div className="space-y-3 pb-2">
        {error && (
          <p className="rounded-2xl bg-danger/10 px-4 py-3 text-sm text-danger" role="alert">
            {error}
          </p>
        )}

        {busy ? (
          <div className="flex flex-col items-center py-8 text-ink-soft">
            <Mascot mood="happy" size={72} className="animate-float" />
            <p className="mt-2 font-cute">AI가 글 쓰는 중...</p>
          </div>
        ) : promo ? (
          <>
            <Segmented
              value={channel}
              onChange={setChannel}
              options={[
                { value: "instagram", label: "인스타" },
                { value: "daangn", label: "당근" },
                { value: "kakao", label: "카톡 채널" },
              ]}
            />
            <div className="card whitespace-pre-wrap break-words p-4 text-[15px] leading-relaxed">
              {channel === "daangn" && <p className="mb-2 font-cute text-lg">{promo.daangn.title}</p>}
              {channel === "instagram" && promo.instagram.text}
              {channel === "daangn" && promo.daangn.text}
              {channel === "kakao" && promo.kakao.text}
              {channel === "instagram" && promo.instagram.hashtags.length > 0 && (
                <p className="mt-3 text-sm text-berry-600">{promo.instagram.hashtags.map((t) => `#${t}`).join(" ")}</p>
              )}
            </div>
            {channel === "instagram" && (
              <p className="text-xs text-ink-soft">📷 인스타에는 상품 사진을 같이 올려 주세요.</p>
            )}
            <button type="button" className="btn-primary w-full" onClick={copy}>
              <Copy size={18} /> 복사하기
            </button>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" className="btn-soft btn-sm" onClick={write}>
                <RefreshCw size={16} /> 다시 쓰기
              </button>
              <button type="button" className="btn-soft btn-sm" onClick={() => setPromo(null)}>
                강조할 점 바꾸기
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-ink-soft">
              ‘{product.name}’ 소개 글을 인스타그램 · 당근 · 카카오톡 채널용으로 한 번에 써 드려요. 가격과 태그도 넣어요.
            </p>
            <div>
              <label htmlFor="promo-focus" className="label">
                강조할 점 <span className="text-xs text-ink-soft">(선택)</span>
              </label>
              <input
                id="promo-focus"
                className="input"
                placeholder="예: 오늘 입고, 1+1, 선물 추천"
                value={focus}
                maxLength={100}
                onChange={(e) => setFocus(e.target.value)}
              />
              <div className="no-scrollbar -mx-1 mt-2 flex gap-1.5 overflow-x-auto px-1 pb-1">
                {FOCUS_CHIPS.map((c) => (
                  <button type="button" key={c} className="chip" data-on={focus === c} onClick={() => setFocus(focus === c ? "" : c)}>
                    {c}
                  </button>
                ))}
              </div>
            </div>
            <button type="button" className="btn-primary w-full" onClick={write}>
              <Sparkles size={18} /> 홍보 글 쓰기
            </button>
          </>
        )}
      </div>
    </Sheet>
  );
}
