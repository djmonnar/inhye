"use client";

import { MessageCircle, Send, ShoppingBag, Truck } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useToast } from "@/components/providers";
import { timeLabel } from "@/lib/day";
import { won } from "@/lib/format";
import { useRefresh } from "@/lib/queries";
import { store } from "@/lib/store";
import type { OrderChangeOp, OrderChatResult, OrderChatTurn, OrderMethod } from "@/lib/types";

/** 주문 비서 — 주문 화면과 홈의 떠 있는 버튼(시트)에서 같이 써요. 대화는 이 탭에서만 기억해요. */

export const WEEK = ["일", "월", "화", "수", "목", "금", "토"];
export const md = (day: string) => `${Number(day.slice(5, 7))}/${Number(day.slice(8, 10))}(${WEEK[new Date(`${day}T00:00:00Z`).getUTCDay()]})`;

const OP_LABEL: Record<OrderChangeOp, string> = {
  create: "등록",
  update: "수정",
  complete: "완료",
  reopen: "다시 진행",
  cancel: "취소",
};

const CHAT_KEY = "popo.orders.chat";
type ChatMsg = { role: "user" | "assistant"; text: string; result?: OrderChatResult };

function loadChat(): ChatMsg[] {
  try {
    return JSON.parse(sessionStorage.getItem(CHAT_KEY) ?? "[]") as ChatMsg[];
  } catch {
    return [];
  }
}

function saveChat(list: ChatMsg[]) {
  try {
    sessionStorage.setItem(CHAT_KEY, JSON.stringify(list.slice(-20)));
  } catch {
    /* 저장 못 해도 괜찮아요 */
  }
}

export function MethodChip({ method }: { method: OrderMethod }) {
  return method === "delivery" ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-soda-100 px-2 py-0.5 text-[11px] text-soda-700">
      <Truck size={12} /> 택배
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full bg-berry-100 px-2 py-0.5 text-[11px] text-berry-700">
      <ShoppingBag size={12} /> 픽업
    </span>
  );
}

/** 주문 비서 채팅. bare = 카드 테두리·제목 없이 (시트 안에 넣을 때) */
export function OrderChat({ bare = false }: { bare?: boolean }) {
  const toast = useToast();
  const refresh = useRefresh();
  const [msgs, setMsgs] = useState<ChatMsg[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 탭 안에서만 대화를 기억해요
    setMsgs(loadChat());
  }, []);
  useEffect(() => {
    // 새 메시지가 오면 맨 아래로 (scrollIntoView가 Promise를 돌려주는 브라우저가 있어서 값은 버려요)
    void endRef.current?.scrollIntoView({ block: "nearest" });
  }, [msgs]);

  async function send() {
    const message = text.trim();
    if (!message || busy) return;
    const history: OrderChatTurn[] = msgs.slice(-6).map((m) => ({ role: m.role, text: m.text }));
    const next = [...msgs, { role: "user" as const, text: message }];
    setMsgs(next);
    setText("");
    setBusy(true);
    try {
      const result = await store().orderChat(message, history);
      const done = [...next, { role: "assistant" as const, text: result.reply, result }];
      setMsgs(done);
      saveChat(done);
      if (result.changes.length) await refresh("orders");
    } catch (e) {
      toast(e instanceof Error ? e.message : "처리하지 못했어요", "sad");
      setMsgs(msgs);
      setText(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={bare ? "" : "card p-4"}>
      <div className={`mb-2 items-center gap-2 ${bare ? (msgs.length ? "flex justify-end" : "hidden") : "flex justify-between"}`}>
        {!bare && (
          <p className="flex items-center gap-1.5 font-cute text-lg">
            <MessageCircle size={18} className="text-berry-500" /> 주문 비서
          </p>
        )}
        {msgs.length > 0 && (
          <button
            type="button"
            className="btn-ghost btn-sm"
            onClick={() => {
              setMsgs([]);
              saveChat([]);
            }}
          >
            대화 지우기
          </button>
        )}
      </div>
      {msgs.length === 0 && (
        <p className="mb-3 whitespace-pre-line rounded-2xl bg-cream p-3 text-xs leading-relaxed text-ink-soft">
          {"주문을 그대로 붙여 넣으면 정리해서 등록해요. 수정·삭제·완료도 말로 해요.\n\n예) 11/11 수 오후 3시 픽업 김포포 하치와레 꽃다발 2.5만원\n예) 이토끼 픽업 4시 반으로 바꿔줘\n예) 박고양 택배 보냈어 → 완료\n예) 이번 주 주문 정리해줘"}
        </p>
      )}
      {msgs.length > 0 && (
        <div className="mb-3 max-h-80 space-y-2 overflow-y-auto">
          {msgs.map((m, i) =>
            m.role === "user" ? (
              <p key={i} className="ml-8 whitespace-pre-line rounded-2xl rounded-br-md bg-berry-100 px-3 py-2 text-sm">
                {m.text}
              </p>
            ) : (
              <div key={i} className="mr-6 rounded-2xl rounded-bl-md bg-cream px-3 py-2 text-sm">
                <p className="whitespace-pre-line">{m.text}</p>
                {m.result && m.result.changes.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {m.result.changes.map((c, j) => (
                      <li key={j} className="flex flex-wrap items-center gap-1 rounded-xl bg-white px-2 py-1 text-xs">
                        <span className="font-semibold text-matcha-700">✓ {OP_LABEL[c.op]}</span>
                        <span>
                          {md(c.order.due_date)}
                          {c.order.due_time ? ` ${timeLabel(c.order.due_time)}` : ""}
                        </span>
                        <MethodChip method={c.order.method} />
                        <span className="min-w-0 truncate">
                          {c.order.customer} · {c.order.item} · {won(c.order.price)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                {m.result?.skipped.map((s, j) => (
                  <p key={j} className="mt-1 text-xs text-danger">
                    ⚠️ {s}
                  </p>
                ))}
              </div>
            ),
          )}
          {busy && <p className="mr-6 rounded-2xl bg-cream px-3 py-2 text-sm text-ink-soft">정리하는 중...</p>}
          <div ref={endRef} />
        </div>
      )}
      <div className="flex items-end gap-2">
        <textarea
          className="input min-h-12 flex-1 resize-none py-2 text-sm"
          rows={Math.min(5, Math.max(2, text.split("\n").length))}
          placeholder="주문을 붙여 넣거나 말로 써 주세요"
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={busy}
        />
        <button type="button" className="btn-primary h-12 w-12 shrink-0 p-0" onClick={send} disabled={busy || !text.trim()} aria-label="보내기">
          <Send size={18} />
        </button>
      </div>
    </section>
  );
}
