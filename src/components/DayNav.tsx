"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { dayLabel, shiftDay } from "@/lib/day";

/** ‹ 11월 10일 (화) · 오늘 › — 오늘 이후로는 못 가요. */
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
  return (
    <div className="flex items-center justify-between rounded-2xl bg-cream px-1 py-1">
      <button type="button" className="btn-ghost btn-sm" aria-label="전날" onClick={() => onChange(shiftDay(day, -1))} disabled={disabled}>
        <ChevronLeft size={18} />
      </button>
      <span className="font-cute">
        {dayLabel(day)}
        {day === today ? " · 오늘" : ""}
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
