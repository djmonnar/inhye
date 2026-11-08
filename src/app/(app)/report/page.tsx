"use client";

import { ChevronRight, Copy, RefreshCw, Sparkles } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Mascot } from "@/components/Mascot";
import { useToast } from "@/components/providers";
import { Loading, PageHeader, Segmented } from "@/components/ui";
import { num, won } from "@/lib/format";
import { useMoves, useProducts, useSupplierMap } from "@/lib/queries";
import { buildReportFacts } from "@/lib/report";
import { store } from "@/lib/store";
import type { AiReport } from "@/lib/types";

type Period = "7" | "30";
const MOVES_LIMIT = 1000;

export default function ReportPage() {
  const toast = useToast();
  const { data: products, isLoading } = useProducts();
  const { data: moves = [], isLoading: movesLoading } = useMoves(undefined, MOVES_LIMIT);
  const suppliers = useSupplierMap();
  const [period, setPeriod] = useState<Period>("7");
  const [reports, setReports] = useState<Partial<Record<Period, AiReport>>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const facts = useMemo(
    () => buildReportFacts(products ?? [], moves, suppliers, Number(period)),
    [products, moves, suppliers, period],
  );
  // When the newest 1000 moves don't reach back to the period start, the counts are partial.
  const truncated =
    moves.length >= MOVES_LIMIT && new Date(moves[moves.length - 1].created_at) > new Date(facts.from);
  const report = reports[period];

  async function make() {
    setError("");
    setBusy(true);
    try {
      const r = await store().writeReport(facts);
      setReports((all) => ({ ...all, [period]: r }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "리포트를 만들지 못했어요.");
    } finally {
      setBusy(false);
    }
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast("복사했어요!", "wink");
    } catch {
      toast("복사하지 못했어요", "sad");
    }
  }

  if (isLoading || movesLoading) return <Loading />;
  const t = facts.totals;

  return (
    <div>
      <PageHeader back title="✨ AI 가게 리포트" sub={`${facts.from} ~ ${facts.to}`} />
      <div className="space-y-4">
        <Segmented
          value={period}
          onChange={setPeriod}
          options={[
            { value: "7", label: "최근 7일" },
            { value: "30", label: "최근 30일" },
          ]}
        />

        <section className="grid grid-cols-2 gap-2.5">
          <Stat label="출고 (판매 기록)" value={`${num(t.out_qty)}개`} sub={`예상 매출 ${won(t.est_revenue)}`} />
          <Stat label="예상 이익" value={won(t.est_profit)} sub={`평균 마진율 ${t.avg_margin_rate}%`} />
          <Stat label="입고" value={won(t.in_amount)} sub={`${num(t.in_qty)}개 들어옴`} />
          <Stat label="품절 · 임박" value={`${t.out_of_stock} · ${t.low_stock}개`} sub={`신상 ${t.new_products}개 등록`} />
        </section>
        <p className="text-xs text-ink-soft">
          💡 빅솔론 판매내역과 연결하기 전이라, 매출은 앱에 기록한 <b>출고(−1)</b> 기준으로 계산해요.
          {truncated && " 기록이 많아 최근 1,000건까지만 셌어요."}
        </p>

        {error && (
          <p className="rounded-2xl bg-danger/10 px-4 py-3 text-sm text-danger" role="alert">
            {error}
          </p>
        )}

        {busy ? (
          <div className="card flex flex-col items-center py-10 text-ink-soft">
            <Mascot mood="happy" size={72} className="animate-float" />
            <p className="mt-2 font-cute">AI가 리포트 쓰는 중...</p>
          </div>
        ) : !report ? (
          <button type="button" className="btn-primary w-full text-lg" onClick={make}>
            <Sparkles size={20} /> AI에게 리포트 받기
          </button>
        ) : (
          <>
            <section className="card space-y-2 bg-berry-50 p-4">
              <div className="flex items-center gap-3">
                <Mascot mood="wow" size={52} />
                <h2 className="font-cute text-xl leading-snug">{report.headline}</h2>
              </div>
              <p className="text-[15px] leading-relaxed">{report.summary}</p>
            </section>

            <ListCard title="👍 잘 된 점" items={report.good} />
            <ListCard title="👀 신경 쓸 점" items={report.watch} />

            {report.reorder.length > 0 && (
              <section className="card p-4">
                <div className="mb-2 flex items-center justify-between">
                  <p className="font-cute text-lg">📦 발주 추천</p>
                  <Link href="/reorder" className="flex items-center text-sm text-berry-600">
                    발주 목록 <ChevronRight size={16} />
                  </Link>
                </div>
                <ul className="divide-y-2 divide-dashed divide-line">
                  {report.reorder.map((r) => (
                    <li key={r.name} className="flex items-center gap-2 py-2.5 text-sm">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{r.name}</span>
                        <span className="block truncate text-xs text-ink-soft">{r.reason}</span>
                      </span>
                      <span className="font-cute text-lg tabular-nums text-berry-600">{num(r.qty)}개</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {report.todo.length > 0 && (
              <section className="card p-4">
                <p className="mb-2 font-cute text-lg">✅ 이번 주 할 일</p>
                <ol className="list-decimal space-y-1.5 pl-5 text-[15px]">
                  {report.todo.map((x) => (
                    <li key={x}>{x}</li>
                  ))}
                </ol>
              </section>
            )}

            {report.new_arrivals_post && (
              <section className="card space-y-3 p-4">
                <p className="font-cute text-lg">📸 신상 소개 글 (인스타)</p>
                <p className="whitespace-pre-wrap break-words rounded-2xl bg-cream p-3 text-[15px] leading-relaxed">
                  {report.new_arrivals_post}
                </p>
                <button type="button" className="btn-soft btn-sm w-full" onClick={() => copy(report.new_arrivals_post)}>
                  <Copy size={16} /> 복사하기
                </button>
              </section>
            )}

            <button type="button" className="btn-soft w-full" onClick={make}>
              <RefreshCw size={18} /> 다시 만들기
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="card p-3.5">
      <p className="text-xs text-ink-soft">{label}</p>
      <p className="mt-0.5 font-cute text-[22px] leading-tight tabular-nums">{value}</p>
      <p className="mt-0.5 truncate text-[11px] text-ink-faint">{sub}</p>
    </div>
  );
}

function ListCard({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <section className="card p-4">
      <p className="mb-2 font-cute text-lg">{title}</p>
      <ul className="space-y-1.5 text-[15px]">
        {items.map((x) => (
          <li key={x} className="flex gap-2">
            <span className="text-berry-400">•</span>
            <span>{x}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
