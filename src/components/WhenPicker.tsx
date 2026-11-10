"use client";

import { useEffect, useRef } from "react";
import { dayLabel, normTime, shiftDay, timeLabel } from "@/lib/day";

/**
 * 휴대폰에서 손가락으로 톡톡 고르는 날짜·시간.
 * - 날짜: 오늘 / 내일 / 모레 / 다음 주 + 달력(직접)
 * - 시간: 시(오전 10시~오후 9시) 버튼 + 분(정각/15/30/45) 버튼 + 직접 입력, ‘시간 없음’
 */

const chip = (on: boolean) =>
  `shrink-0 whitespace-nowrap rounded-full border-2 px-3 py-1.5 font-cute text-sm transition ${
    on ? "border-berry-500 bg-berry-100 text-berry-700" : "border-line bg-white text-ink-soft"
  }`;

export function DayChips({ value, today, onChange }: { value: string; today: string; onChange: (day: string) => void }) {
  const quick: [string, number][] = [
    ["오늘", 0],
    ["내일", 1],
    ["모레", 2],
    ["다음 주", 7],
  ];
  return (
    <div className="space-y-2">
      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {quick.map(([label, n]) => {
          const day = shiftDay(today, n);
          return (
            <button key={label} type="button" className={chip(value === day)} onClick={() => onChange(day)}>
              {label}
            </button>
          );
        })}
      </div>
      <div className="flex items-center gap-2">
        <input
          type="date"
          className="input flex-1"
          value={value}
          onChange={(e) => e.target.value && onChange(e.target.value)}
          aria-label="날짜 직접 고르기"
        />
        <span className="shrink-0 text-sm text-ink-soft">{value ? dayLabel(value) : ""}</span>
      </div>
    </div>
  );
}

const HOURS = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21];
const MINUTES = [0, 15, 30, 45];
const pad = (n: number) => String(n).padStart(2, "0");
const hourChip = (h: number) => (h < 12 ? `오전 ${h}시` : h === 12 ? "낮 12시" : `오후 ${h - 12}시`);

export function TimeChips({ value, onChange }: { value: string | null; onChange: (time: string | null) => void }) {
  const t = normTime(value);
  const h = t ? Number(t.slice(0, 2)) : null;
  const m = t ? Number(t.slice(3, 5)) : null;
  const selected = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    // 고른 시 버튼이 보이게 가로로만 넘겨요 (scrollIntoView가 Promise를 주는 브라우저가 있어 값은 버려요)
    void selected.current?.scrollIntoView({ inline: "center", block: "nearest" });
  }, [h]);
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className={`font-cute text-lg ${t ? "text-berry-600" : "text-ink-faint"}`}>{t ? timeLabel(t) : "시간 없음"}</span>
        <div className="flex items-center gap-1.5">
          <input
            type="time"
            step={300}
            className="input w-36 py-1.5 text-sm"
            value={t ?? ""}
            onChange={(e) => onChange(normTime(e.target.value))}
            aria-label="시간 직접 입력"
          />
          {t && (
            <button type="button" className="btn-ghost btn-sm" onClick={() => onChange(null)}>
              지우기
            </button>
          )}
        </div>
      </div>
      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1" role="group" aria-label="시">
        {HOURS.map((hh) => (
          <button
            key={hh}
            ref={h === hh ? selected : undefined}
            type="button"
            className={chip(h === hh)}
            onClick={() => onChange(`${pad(hh)}:${pad(m ?? 0)}`)}
          >
            {hourChip(hh)}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-4 gap-1.5" role="group" aria-label="분">
        {MINUTES.map((mm) => (
          <button
            key={mm}
            type="button"
            className={`${chip(h !== null && m === mm)} disabled:opacity-40`}
            disabled={h === null}
            onClick={() => h !== null && onChange(`${pad(h)}:${pad(mm)}`)}
          >
            {mm === 0 ? "정각" : `${mm}분`}
          </button>
        ))}
      </div>
    </div>
  );
}
