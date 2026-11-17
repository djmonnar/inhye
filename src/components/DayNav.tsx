"use client";

import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { useRef } from "react";
import { dayLabel, shiftDay } from "@/lib/day";

/**
 * ‹ 11월 10일 (화) · 오늘 › — 가운데 날짜를 누르면 달력이 떠요. 오늘 이후로는 못 가요.
 * (정산 · 매출 · 영수증 화면 공용)
 */
export function DayNav({
  day,
  today,
  onChange,
  disabled,
}: {
  day: string;
  today: string;
  onChange: (day: string) => void;
  disabled?: boolean;
}) {
  const picker = useRef<HTMLInputElement>(null);

  function openCalendar() {
    const el = picker.current;
    if (!el || disabled) return;
    try {
      el.showPicker();
    } catch {
      // showPicker를 못 쓰는 브라우저는 입력 칸을 눌러 달력을 열어요
      el.focus();
      el.click();
    }
  }

  return (
    <div className="flex items-center justify-between rounded-2xl bg-cream px-1 py-1">
      <button type="button" className="btn-ghost btn-sm" aria-label="전날" onClick={() => onChange(shiftDay(day, -1))} disabled={disabled}>
        <ChevronLeft size={18} />
      </button>
      <span className="relative">
        <button type="button" className="flex items-center gap-1.5 rounded-xl px-2 py-1 font-cute active:scale-95" onClick={openCalendar} disabled={disabled} aria-label="달력에서 날짜 고르기">
          <CalendarDays size={16} className="text-berry-500" />
          {dayLabel(day)}
          {day === today ? " · 오늘" : ""}
        </button>
        <input
          ref={picker}
          type="date"
          tabIndex={-1}
          aria-hidden
          className="pointer-events-none absolute inset-0 h-full w-full opacity-0"
          value={day}
          max={today}
          onChange={(e) => {
            const v = e.target.value;
            if (v && v <= today) onChange(v);
          }}
        />
      </span>
      <button
        type="button"
        className="btn-ghost btn-sm"
        aria-label="다음 날"
        onClick={() => onChange(shiftDay(day, 1))}
        disabled={disabled || day >= today}
      >
        <ChevronRight size={18} />
      </button>
    </div>
  );
}
