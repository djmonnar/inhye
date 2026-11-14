"use client";

import { useQuery } from "@tanstack/react-query";
import { ChevronDown, Copy, Download, RefreshCw } from "lucide-react";
import { useMemo, useState } from "react";
import { useToast } from "@/components/providers";
import { EmptyState, Loading, PageHeader, Segmented } from "@/components/ui";
import { kstToday, shiftDay } from "@/lib/day";
import { num, relTime, won } from "@/lib/format";
import { groupLabel, OTHER, settle, settleText, type SettleGroup } from "@/lib/settle";
import { store } from "@/lib/store";

/**
 * A/B 정산 — 빅솔론 상품 분류명 앞글자(A·B)로 기간 매출을 나눠 봐요.
 * 빅솔론에서 바로 받아요(저장 없음, 최대 31일). 엑셀로 받거나 카톡용 글로 복사할 수 있어요.
 */

type Period = "this" | "last" | "custom";
const MAX_DAYS = 31;

const monthStart = (day: string) => `${day.slice(0, 8)}01`;
const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;
const spanDays = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000) + 1;

function rangeOf(p: Period, today: string, custom: { start: string; end: string }) {
  if (p === "this") return { start: monthStart(today), end: today };
  if (p === "last") {
    const end = shiftDay(monthStart(today), -1);
    return { start: monthStart(end), end };
  }
  return custom;
}

function GroupTile({ g, total }: { g: SettleGroup; total: number }) {
  const share = total > 0 ? Math.round((g.amount / total) * 100) : 0;
  return (
    <div className="rounded-3xl border-2 border-line bg-white p-3">
      <p className="flex items-baseline justify-between gap-2">
        <span className="font-cute text-lg">{groupLabel(g.key)}</span>
        <span className="text-xs text-ink-soft">{share}%</span>
      </p>
      <p className="mt-1 font-cute text-2xl text-ink">{won(g.amount)}</p>
      <p className="text-xs text-ink-soft">
        {num(g.qty)}개 · 분류 {num(g.categories.length)}개
      </p>
    </div>
  );
}

function GroupDetail({ g }: { g: SettleGroup }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <section className="card p-4">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <p className="font-cute text-lg">{g.key === OTHER ? "기타 (A·B가 없는 분류)" : groupLabel(g.key)}</p>
        <p className="text-sm font-semibold">{won(g.amount)}</p>
      </div>
      {g.key === OTHER && (
        <p className="mb-2 rounded-2xl bg-butter-100 px-3 py-2 text-xs text-butter-700">
          분류명 앞이나 뒤에 A·B가 없는 상품이에요. 빅솔론에서 분류명에 ‘A’ / ‘B’를 붙이면 그 묶음으로 들어가요.
        </p>
      )}
      <ul className="divide-y-2 divide-dashed divide-line">
        {g.categories.map((c) => {
          const isOpen = open === c.name;
          return (
            <li key={c.name}>
              <button
                type="button"
                className="flex w-full items-center gap-2 py-2.5 text-left"
                aria-expanded={isOpen}
                onClick={() => setOpen(isOpen ? null : c.name)}
              >
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{c.name}</span>
                <span className="shrink-0 text-xs text-ink-soft">{num(c.qty)}개</span>
                <span className="w-24 shrink-0 text-right text-sm">{won(c.amount)}</span>
                <ChevronDown size={16} className={`shrink-0 text-ink-faint transition ${isOpen ? "rotate-180" : ""}`} />
              </button>
              {isOpen && (
                <ul className="mb-2 space-y-1 rounded-2xl bg-cream px-3 py-2">
                  {c.items.map((it, i) => (
                    <li key={`${it.code ?? it.name}-${i}`} className="flex items-center gap-2 text-xs">
                      <span className="min-w-0 flex-1 truncate">{it.name}</span>
                      <span className="shrink-0 text-ink-soft">{num(it.qty)}개</span>
                      <span className="w-20 shrink-0 text-right">{won(it.amount)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export default function SettlePage() {
  const toast = useToast();
  const [today] = useState(kstToday);
  const [period, setPeriod] = useState<Period>("this");
  const [custom, setCustom] = useState(() => ({ start: monthStart(today), end: today }));
  const { start, end } = rangeOf(period, today, custom);
  const days = spanDays(start, end);
  const invalid = !start || !end || start > end || end > today ? "시작일 ≤ 끝날 ≤ 오늘로 골라 주세요." : days > MAX_DAYS ? `한 번에 ${MAX_DAYS}일까지 볼 수 있어요.` : null;

  const q = useQuery({
    queryKey: ["pos", "settle", start, end],
    queryFn: () => store().posSettle(start, end),
    enabled: !invalid,
    staleTime: 60_000,
    retry: false,
  });
  const result = useMemo(() => (q.data ? settle(q.data.items) : null), [q.data]);

  async function copyText() {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(settleText(result, start, end, won, num));
      toast("정산 요약을 복사했어요. 카톡에 붙여 넣으세요!", "wink");
    } catch {
      toast("복사하지 못했어요", "sad");
    }
  }

  async function downloadExcel() {
    if (!result) return;
    try {
      const { buildSettleWorkbook, download } = await import("@/lib/excel");
      download(await buildSettleWorkbook(result, start, end), `포포하우스_정산_${start}_${end}.xlsx`);
    } catch {
      toast("엑셀을 만들지 못했어요", "sad");
    }
  }

  return (
    <div>
      <PageHeader back title="A/B 정산" sub="A = 인혜 · B = 경령 (빅솔론 분류명의 A·B)" />
      <div className="space-y-4">
        <section className="card space-y-3 p-4">
          <Segmented<Period>
            options={[
              { value: "this", label: "이번 달" },
              { value: "last", label: "지난달" },
              { value: "custom", label: "직접" },
            ]}
            value={period}
            onChange={setPeriod}
          />
          {period === "custom" && (
            <div className="grid grid-cols-2 gap-2">
              <label className="text-xs text-ink-soft">
                시작
                <input
                  type="date"
                  className="input mt-1"
                  value={custom.start}
                  max={today}
                  onChange={(e) => e.target.value && setCustom((c) => ({ ...c, start: e.target.value }))}
                />
              </label>
              <label className="text-xs text-ink-soft">
                끝
                <input
                  type="date"
                  className="input mt-1"
                  value={custom.end}
                  max={today}
                  onChange={(e) => e.target.value && setCustom((c) => ({ ...c, end: e.target.value }))}
                />
              </label>
            </div>
          )}
          <div className="flex items-center justify-between gap-2 text-xs text-ink-soft">
            <span>
              {md(start)} ~ {md(end)} · {num(days)}일{q.data ? ` · ${relTime(q.data.fetchedAt)} 받음` : ""}
            </span>
            <button type="button" className="btn-ghost btn-sm" disabled={!!invalid || q.isFetching} onClick={() => q.refetch()}>
              <RefreshCw size={14} className={q.isFetching ? "animate-spin" : ""} /> 새로 받기
            </button>
          </div>
          {invalid && (
            <p className="text-sm text-danger" role="alert">
              {invalid}
            </p>
          )}
        </section>

        {q.data?.sample && (
          <p className="rounded-2xl bg-butter-100 px-3 py-2 text-xs text-butter-700">체험 모드라 샘플 숫자예요. 빅솔론을 연결하면 실제 매출로 나눠요.</p>
        )}

        {invalid ? null : q.isLoading ? (
          <Loading text="빅솔론에서 받는 중..." />
        ) : q.error ? (
          <p className="rounded-2xl bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">
            {q.error instanceof Error ? q.error.message : "빅솔론에서 받아오지 못했어요."}
          </p>
        ) : !result || result.groups.length === 0 ? (
          <EmptyState mood="sleep" title="이 기간엔 판매가 없어요" desc="다른 기간을 골라 보세요." />
        ) : (
          <>
            <section className="card p-4">
              <div className="mb-3 flex items-baseline justify-between gap-2">
                <p className="font-cute text-lg">합계</p>
                <p className="text-sm">
                  <b className="font-cute text-xl">{won(result.amount)}</b> <span className="text-ink-soft">· {num(result.qty)}개</span>
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {result.groups.map((g) => (
                  <GroupTile key={g.key} g={g} total={result.amount} />
                ))}
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button type="button" className="btn-soft btn-sm" onClick={copyText}>
                  <Copy size={16} /> 카톡용 복사
                </button>
                <button type="button" className="btn-soft btn-sm" onClick={downloadExcel}>
                  <Download size={16} /> 엑셀로 받기
                </button>
              </div>
              <p className="mt-2 text-[11px] text-ink-faint">
                금액은 빅솔론 상품별 결제 금액(할인 반영) 기준이에요. 오늘 판매는 10분쯤 늦게 반영돼요.
              </p>
            </section>
            {result.groups.map((g) => (
              <GroupDetail key={g.key} g={g} />
            ))}
          </>
        )}
      </div>
    </div>
  );
}
