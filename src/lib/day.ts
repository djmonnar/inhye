import type { Order } from "./types";
/** 한국 날짜(YYYY-MM-DD)·시각 도우미. 빅솔론은 한국 영업일 기준이라 기기 시간대와 상관없이 KST로 계산해요. */

const KST = "Asia/Seoul";

/** 오늘 한국 날짜 YYYY-MM-DD */
export const kstToday = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: KST, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

/** YYYY-MM-DD 에 n일 더하기 */
export function shiftDay(day: string, n: number) {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** "11월 10일 (화)" */
export const dayLabel = (day: string) =>
  new Intl.DateTimeFormat("ko-KR", { timeZone: "UTC", month: "long", day: "numeric", weekday: "short" }).format(
    new Date(`${day}T00:00:00Z`),
  );

/** 한국 시각의 시(0~23) */
export const kstHour = (iso: string) =>
  Number(new Intl.DateTimeFormat("en-US", { timeZone: KST, hour: "2-digit", hourCycle: "h23" }).format(new Date(iso)));

/** "14:05" (한국 시각) */
export const kstTime = (iso: string) =>
  new Intl.DateTimeFormat("ko-KR", { timeZone: KST, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(
    new Date(iso),
  );

/** DB의 "15:30:00" → "15:30", 이상하면 null */
export function normTime(t: string | null | undefined): string | null {
  if (!t) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(t);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, "0")}:${m[2]}`;
}

/** "15:30" → "오후 3:30", "15:00" → "오후 3시", "12:00" → "낮 12시" */
export function timeLabel(t: string | null | undefined): string {
  const n = normTime(t);
  if (!n) return "";
  const h = Number(n.slice(0, 2));
  const min = n.slice(3, 5);
  const ap = h === 0 ? "밤 12" : h < 12 ? `오전 ${h}` : h === 12 ? "낮 12" : `오후 ${h - 12}`;
  return min === "00" ? `${ap}시` : `${ap}:${min}`;
}

/**
 * 가게가 챙겨야 하는 날: 택배는 출고일(없으면 받는 날), 픽업은 픽업일.
 * D-day · 알림 · ‘7일 안에 보낼 택배’를 이 날짜로 계산해요.
 */
export function actDay(o: { method: string; due_date: string; ship_date?: string | null }): string {
  return o.method === "delivery" && o.ship_date ? o.ship_date : o.due_date;
}

/**
 * DB에서 읽은 주문을 고르게 — 시간은 "HH:MM", 예전 DB에 없던 칸(출고일 v7, 택배사·송장·로젠 v8)은 null.
 * 앱·서버·챗봇이 주문을 읽을 때 다 이걸 거쳐요.
 */
export function tidyOrder<T extends { due_time: string | null }>(o: T): T & OrderExtra {
  const x = o as T & Partial<OrderExtra>;
  return {
    ...o,
    due_time: normTime(o.due_time),
    ship_date: x.ship_date ?? null,
    carrier: x.carrier ?? null,
    tracking_no: x.tracking_no ?? null,
    logen_take_no: x.logen_take_no ?? null,
    logen_status: x.logen_status ?? null,
    logen_at: x.logen_at ?? null,
    logen_msg: x.logen_msg ?? null,
  };
}

type OrderExtra = Pick<Order, "ship_date" | "carrier" | "tracking_no" | "logen_take_no" | "logen_status" | "logen_at" | "logen_msg">;
