import { normTime, timeLabel } from "../day";
import { adminClient } from "./admin";
import { askJson, objectSchema, STRING } from "./openai";
import type { Order, OrderChangeOp, OrderChatResult, OrderChatTurn, OrderMethod } from "../types";

/**
 * 주문 비서: 사장님이 채팅으로 쓴 주문을 AI가 ‘할 일 목록(actions)’으로 바꾸고, 서버가 검사해서 DB에 반영해요.
 * - AI는 글만 정리하고, 실제로 바뀐 것은 서버가 확인한 결과(changes)로만 보여줘요.
 * - 삭제는 status 'canceled'(되살릴 수 있어요). 완료는 'done' → 알림에서 빠져요.
 */

const KST = "Asia/Seoul";
const WEEK = ["일", "월", "화", "수", "목", "금", "토"];

export const kstDate = (d = new Date()) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: KST, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

export function weekday(day: string) {
  return WEEK[new Date(`${day}T00:00:00Z`).getUTCDay()];
}

export function daysUntil(day: string, today = kstDate()) {
  return Math.round((Date.parse(`${day}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000);
}

const methodLabel = (m: OrderMethod) => (m === "delivery" ? "택배" : "픽업");
const statusLabel = { open: "진행중", done: "완료", canceled: "취소" } as const;

const NSTR = { type: ["string", "null"] } as const;
const ACTION = objectSchema({
  op: { type: "string", enum: ["create", "update", "complete", "reopen", "cancel"] },
  ref: NSTR,
  customer: NSTR,
  item: NSTR,
  price: { type: ["integer", "null"] },
  due_date: NSTR,
  due_time: NSTR,
  method: { type: ["string", "null"], enum: ["pickup", "delivery", null] },
  memo: NSTR,
  contact: NSTR,
  address: NSTR,
});
const SCHEMA = objectSchema({ reply: STRING, actions: { type: "array", items: ACTION } });

type Action = {
  op: OrderChangeOp;
  ref: string | null;
  customer: string | null;
  item: string | null;
  price: number | null;
  due_date: string | null;
  due_time: string | null;
  method: OrderMethod | null;
  memo: string | null;
  contact: string | null;
  address: string | null;
};

function instructions(today: string) {
  return `너는 무인 소품샵 ‘포포하우스’ 사장님의 주문 비서야. 사장님이 채팅으로 쓴 글을 보고 주문 목록을 바꿀 할 일(actions)과 짧은 답(reply)을 만들어.

오늘은 ${today} (${weekday(today)}요일, 한국 시간)이야.

[주문 한 줄 읽는 법] 예: "11/23 월 택배 박고양 하치와레 꽃다발 2.5만원 (라넌으로 변경)"
- 날짜(월/일, 요일은 참고용) → due_date "YYYY-MM-DD". 연도가 없으면 오늘 이후 가장 가까운 날로(오늘보다 2달 넘게 지난 날짜면 내년).
- 시간(주로 픽업 시간) → due_time "HH:MM" 24시간제. "오후 3시"→"15:00", "3시 반"→"15:30", "11시"→"11:00"(가게 시간이라 1~8시는 오후로: "4시"→"16:00"), "저녁 7시"→"19:00". 시간이 없으면 null.
- "픽업" → method "pickup", "택배"/"배송" → "delivery". 없으면 "pickup".
- 사람 이름 → customer, 상품 → item, 가격: "2.5만원"→25000, "3만"→30000, "25,000원"→25000.
- 괄호 안이나 덧붙인 말("라넌으로 변경", "리본 핑크", "선입금 완료") → memo. 전화번호 → contact, 주소 → address.
- 여러 줄이면 줄마다 create 하나씩.

[이미 있는 주문 바꾸기] 아래 ‘지금 주문 목록’의 #번호를 ref에 넣어.
- 수정(날짜·시간·가격·상품·메모 등) → op "update", 바꿀 칸만 넣고 나머지는 null. 시간을 지우라고 하면 due_time "".
- "완료", "보냈어", "픽업해 갔어", "끝" → op "complete". 완료 취소/다시 진행 → "reopen".
- "삭제", "취소", "빼줘" → op "cancel".
- 이름·날짜·상품으로 어떤 주문인지 하나로 정해지지 않으면 actions에 넣지 말고 reply에서 어느 주문인지 물어봐.
- 목록에 없는 주문을 바꾸라고 하면 reply로 못 찾았다고 말해.

[정리·질문] "이번 주 주문 정리해줘", "택배 뭐 남았어?" 같은 건 actions 없이 목록을 보고 reply로 짧게 정리해(날짜순, 날짜·요일·방법·이름·상품·가격).

[답(reply)] 한국어 해요체, 짧고 다정하게. 무엇을 했는지 한두 줄. 지어내지 말 것.
create일 때는 ref null, 모르는 칸은 null.`;
}

function orderLine(o: Order, ref: string) {
  return [
    `#${ref}`,
    `${o.due_date}(${weekday(o.due_date)})${o.due_time ? ` ${o.due_time}` : ""}`,
    methodLabel(o.method),
    o.customer || "-",
    o.item || "-",
    `${o.price}원`,
    statusLabel[o.status],
    o.memo ? `메모:${o.memo}` : "",
  ]
    .filter(Boolean)
    .join(" | ");
}

const clip = (v: string | null | undefined, max: number) => (v ? v.trim().slice(0, max) : "");
const validDay = (v: string | null) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) ? v : null);
/** AI 답에 그 칸이 있는지 (null = 안 바꿈, 빠진 칸도 안 바꿈) */
function has<T>(v: T | null | undefined): v is T {
  return v !== null && v !== undefined;
}
/** "15:30" 같은 시간만 (형식이 이상하면 null) */
const validTime = (v: string | null) => (v && /^\d{1,2}:\d{2}$/.test(v.trim()) ? normTime(v.trim()) : null);

export async function orderChat(
  message: string,
  history: OrderChatTurn[],
  callerId: string,
): Promise<OrderChatResult> {
  const db = adminClient();
  const today = kstDate();
  // 날짜만 (YYYY-MM-DD) — 필터 값에 특수문자가 없게
  const since = new Date(Date.now() - 60 * 86400000).toISOString().slice(0, 10);
  const { data, error } = await db
    .from("orders")
    .select("*")
    .or(`status.eq.open,updated_at.gte.${since}`)
    .order("due_date")
    .limit(300);
  if (error) {
    if (error.code === "PGRST205" || error.code === "42P01") {
      throw new Error("주문 표가 아직 없어요. 설정 화면(/setup)에서 ‘앱에서 바로 실행’을 눌러 DB를 업데이트해 주세요.");
    }
    throw new Error(error.message);
  }
  const orders = ((data ?? []) as Order[]).map((o) => ({ ...o, due_time: normTime(o.due_time) }));
  // AI에게는 짧은 번호(1, 2, 3...)만 보여주고, 서버가 진짜 id로 바꿔요
  const refs = new Map<string, Order>();
  const listText = orders.map((o, i) => {
    const ref = String(i + 1);
    refs.set(ref, o);
    return orderLine(o, ref);
  });

  const talk = history
    .slice(-6)
    .map((t) => `${t.role === "user" ? "사장님" : "비서"}: ${clip(t.text, 400)}`)
    .join("\n");

  const out = await askJson<{ reply: string; actions: Action[] }>({
    label: "orders",
    instructions: instructions(today),
    content: [
      {
        type: "input_text",
        text: `[지금 주문 목록]\n${listText.join("\n") || "(아직 없음)"}\n\n[최근 대화]\n${talk || "(없음)"}\n\n[사장님 새 메시지]\n${clip(message, 2000)}`,
      },
    ],
    schema: SCHEMA,
    maxOutputTokens: 3000,
  });

  const changes: OrderChatResult["changes"] = [];
  const skipped: string[] = [];
  for (const a of (out.actions ?? []).slice(0, 30)) {
    if (a.op === "create") {
      const due = validDay(a.due_date);
      if (!due) {
        skipped.push(`날짜를 못 읽어서 못 넣었어요: ${clip(a.customer, 20)} ${clip(a.item, 30)}`.trim());
        continue;
      }
      const row = {
        customer: clip(a.customer, 40),
        item: clip(a.item, 80),
        price: Math.max(0, Math.round(a.price ?? 0)),
        due_date: due,
        due_time: validTime(a.due_time),
        method: a.method === "delivery" ? "delivery" : "pickup",
        memo: clip(a.memo, 300) || null,
        contact: clip(a.contact, 40) || null,
        address: clip(a.address, 200) || null,
        source_text: clip(message, 1000),
        created_by: callerId,
      };
      const { data: created, error: e } = await db.from("orders").insert(row).select("*").single();
      if (e || !created) skipped.push(`저장하지 못했어요: ${row.customer} ${row.item}`);
      else changes.push({ op: "create", order: { ...(created as Order), due_time: normTime((created as Order).due_time) } });
      continue;
    }

    const target = a.ref ? refs.get(a.ref.replace(/^#/, "")) : undefined;
    if (!target) {
      skipped.push("어느 주문인지 못 찾았어요");
      continue;
    }
    const patch: Record<string, unknown> = {};
    if (a.op === "update") {
      if (has(a.customer)) patch.customer = clip(a.customer, 40);
      if (has(a.item)) patch.item = clip(a.item, 80);
      if (has(a.price)) patch.price = Math.max(0, Math.round(a.price));
      if (has(a.due_date)) {
        const due = validDay(a.due_date);
        if (due) patch.due_date = due;
        else skipped.push(`날짜를 못 읽었어요: ${target.customer}`);
      }
      if (has(a.due_time)) {
        if (a.due_time.trim() === "") patch.due_time = null;
        else {
          const t = validTime(a.due_time);
          if (t) patch.due_time = t;
          else skipped.push(`시간을 못 읽었어요: ${target.customer}`);
        }
      }
      if (has(a.method)) patch.method = a.method === "delivery" ? "delivery" : "pickup";
      if (has(a.memo)) patch.memo = clip(a.memo, 300) || null;
      if (has(a.contact)) patch.contact = clip(a.contact, 40) || null;
      if (has(a.address)) patch.address = clip(a.address, 200) || null;
      if (!Object.keys(patch).length) continue;
    } else if (a.op === "complete") {
      patch.status = "done";
      patch.done_at = new Date().toISOString();
    } else if (a.op === "reopen") {
      patch.status = "open";
      patch.done_at = null;
    } else if (a.op === "cancel") {
      patch.status = "canceled";
    }
    const { data: updated, error: e } = await db.from("orders").update(patch).eq("id", target.id).select("*").single();
    if (e || !updated) skipped.push(`바꾸지 못했어요: ${target.customer} ${target.item}`);
    else changes.push({ op: a.op, order: { ...(updated as Order), due_time: normTime((updated as Order).due_time) } });
  }

  return { reply: clip(out.reply, 1500) || "확인했어요.", changes, skipped };
}

// ---------------------------------------------------------------------------
// 매일 아침 알림 글: 택배는 D-7부터(지난 것 포함), 픽업은 오늘·내일. 완료/취소는 빠져요.
// 카카오톡 텍스트 메시지는 200자까지라 넘치면 ‘외 N건’으로 줄여요.
// ---------------------------------------------------------------------------

export function buildBrief(orders: Order[], today = kstDate()): string | null {
  const md = (day: string) => `${Number(day.slice(5, 7))}/${Number(day.slice(8, 10))}(${weekday(day)})`;
  const dLabel = (n: number) => (n === 0 ? "오늘" : n > 0 ? `D-${n}` : `${-n}일 지남`);
  const when = (o: Order) => `${o.due_date} ${normTime(o.due_time) ?? "99:99"}`;
  const open = orders.filter((o) => o.status === "open").sort((a, b) => when(a).localeCompare(when(b)));
  const ship = open.filter((o) => o.method === "delivery" && daysUntil(o.due_date, today) <= 7);
  const pick = open.filter((o) => o.method === "pickup" && [0, 1].includes(daysUntil(o.due_date, today)));
  if (!ship.length && !pick.length) return null;

  const lines: string[] = [];
  for (const o of ship) lines.push(`📦 ${md(o.due_date)} ${dLabel(daysUntil(o.due_date, today))} ${o.customer} ${o.item}`.trim());
  for (const o of pick) {
    const t = timeLabel(o.due_time);
    lines.push(`🛍 ${md(o.due_date)} ${daysUntil(o.due_date, today) === 0 ? "오늘" : "내일"}${t ? ` ${t}` : ""} 픽업 ${o.customer} ${o.item}`.trim());
  }

  const head = `🌸 포포하우스 주문 알림 ${md(today)}`;
  const tail = "완료하면 앱에서 ‘완료’를 눌러 주세요";
  const LIMIT = 200;
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const rest = lines.length - i - 1;
    const candidate = [head, ...out, lines[i], rest ? `외 ${rest}건` : "", tail].filter(Boolean).join("\n");
    if (candidate.length > LIMIT) {
      const more = lines.length - out.length;
      return [head, ...out, `외 ${more}건 더 있어요`, tail].join("\n").slice(0, LIMIT);
    }
    out.push(lines[i]);
  }
  return [head, ...out, tail].join("\n").slice(0, LIMIT);
}
