"use client";

import { RefreshCw } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { DayNav } from "@/components/DayNav";
import { useAuth, useToast } from "@/components/providers";
import { Loading, PageHeader } from "@/components/ui";
import { kstHour, kstTime, kstToday } from "@/lib/day";
import { num, relTime, won } from "@/lib/format";
import { useProducts, useRefresh } from "@/lib/queries";
import { store } from "@/lib/store";
import type { PosReceipt, PosReceiptsDay } from "@/lib/types";

const STATUS: Record<string, { label: string; tone: string }> = {
  PAID: { label: "결제", tone: "bg-matcha-100 text-matcha-700" },
  VOID: { label: "취소", tone: "bg-cream-deep text-ink-soft" },
  RETURNED: { label: "반품", tone: "bg-butter-100 text-butter-700" },
};
const isPaid = (r: PosReceipt) => r.status === "PAID";
const statusOf = (s: string) => STATUS[s] ?? { label: s, tone: "bg-cream-deep text-ink-soft" };

type HourStat = { count: number; amount: number };

/** 시간대별 매출 막대 (한 가지 값이라 색 하나, 누르거나 올리면 그 시간 숫자가 위에 보여요). */
function HourChart({ byHour, lo, hi }: { byHour: HourStat[]; lo: number; hi: number }) {
  const [sel, setSel] = useState<number | null>(null);
  const hours = Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
  const max = Math.max(1, ...hours.map((h) => byHour[h].amount));
  const peak = hours.reduce((best, h) => (byHour[h].amount > byHour[best].amount ? h : best), hours[0]);
  const shown = sel ?? (byHour[peak].amount ? peak : null);

  return (
    <section className="card p-4">
      <p className="font-cute text-lg">시간대별 매출</p>
      <p className="mb-3 min-h-5 text-sm text-ink-soft" aria-live="polite">
        {shown === null
          ? "막대를 누르면 그 시간 매출이 보여요"
          : `${shown}시 · ${num(byHour[shown].count)}건 · ${won(byHour[shown].amount)}${sel === null ? " (가장 많이 판 시간)" : ""}`}
      </p>
      <div className="flex h-32 items-end gap-[2px] border-b-2 border-line" onMouseLeave={() => setSel(null)}>
        {hours.map((h) => (
          <button
            key={h}
            type="button"
            aria-label={`${h}시 ${byHour[h].count}건 ${won(byHour[h].amount)}`}
            onMouseEnter={() => setSel(h)}
            onFocus={() => setSel(h)}
            onClick={() => setSel(h)}
            className="flex h-full min-w-0 flex-1 items-end justify-center"
          >
            <span
              className={`block w-full max-w-6 rounded-t-[4px] ${h === shown ? "bg-berry-600" : "bg-berry-300"}`}
              style={{ height: byHour[h].amount ? `${Math.max(3, (byHour[h].amount / max) * 100)}%` : 0 }}
            />
          </button>
        ))}
      </div>
      <div className="mt-1 flex gap-[2px] text-[10px] text-ink-faint" aria-hidden="true">
        {hours.map((h) => (
          <span key={h} className="min-w-0 flex-1 text-center">
            {h % 3 === 0 ? h : ""}
          </span>
        ))}
      </div>
    </section>
  );
}

function Receipts() {
  const params = useSearchParams();
  const { user } = useAuth();
  const toast = useToast();
  const refresh = useRefresh();
  const { data: products = [] } = useProducts();
  const [today] = useState(kstToday);
  const initial = params.get("day");
  const [day, setDay] = useState(() => (initial && /^\d{4}-\d{2}-\d{2}$/.test(initial) && initial <= today ? initial : today));
  const [data, setData] = useState<PosReceiptsDay | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const byCode = useMemo(
    () => new Map(products.filter((p) => p.kiosk_code).map((p) => [p.kiosk_code as string, p])),
    [products],
  );

  const load = useCallback(
    async (d: string) => {
      setLoading(true);
      setError("");
      try {
        const r = await store().posReceipts(d);
        setData(r);
        if (r.linked) {
          await refresh("products");
          toast(`이름이 같은 상품 ${r.linked}개에 빅솔론 코드를 붙였어요`, "wow");
        }
      } catch (e) {
        setData(null);
        setError(e instanceof Error ? e.message : "빅솔론에서 받아오지 못했어요.");
      } finally {
        setLoading(false);
      }
    },
    [refresh, toast],
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 날짜를 바꾸면 그날 영수증을 받아와요
    void load(day);
  }, [day, load]);

  const stats = useMemo(() => {
    const receipts = [...(data?.receipts ?? [])].sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""));
    const paid = receipts.filter(isPaid);
    const total = paid.reduce((n, r) => n + r.paymentAmount, 0);
    const voided = receipts.filter((r) => !isPaid(r));
    const byHour: HourStat[] = Array.from({ length: 24 }, () => ({ count: 0, amount: 0 }));
    for (const r of paid) {
      if (!r.at) continue;
      const h = kstHour(r.at);
      byHour[h].count += 1;
      byHour[h].amount += r.paymentAmount;
    }
    const used = byHour.map((s, h) => (s.count ? h : -1)).filter((h) => h >= 0);
    const lo = Math.min(10, ...used);
    const hi = Math.max(20, ...used);
    const methods = new Map<string, HourStat>();
    for (const r of paid) {
      for (const p of r.payments) {
        const cur = methods.get(p.method) ?? { count: 0, amount: 0 };
        cur.count += 1;
        cur.amount += p.amount;
        methods.set(p.method, cur);
      }
    }
    const methodTotal = [...methods.values()].reduce((n, m) => n + m.amount, 0);
    return {
      receipts,
      total,
      count: paid.length,
      avg: paid.length ? Math.round(total / paid.length) : 0,
      voidCount: voided.length,
      voidAmount: voided.reduce((n, r) => n + r.paymentAmount, 0),
      byHour,
      lo,
      hi,
      methods: [...methods.entries()].sort((a, b) => b[1].amount - a[1].amount),
      methodTotal,
    };
  }, [data]);

  return (
    <div>
      <PageHeader
        back="/sales"
        title="영수증별 매출"
        sub="빅솔론에서 바로 · 보기만 해요"
        right={
          <button type="button" className="btn-ghost btn-sm" onClick={() => void load(day)} disabled={loading} aria-label="새로고침">
            <RefreshCw size={18} className={loading ? "animate-spin" : ""} />
          </button>
        }
      />
      <div className="space-y-4">
        <DayNav day={day} today={today} onChange={setDay} disabled={loading} />
        {data?.sample && <p className="rounded-xl bg-butter-100 px-3 py-1.5 text-xs">체험 모드 샘플이에요</p>}

        {error ? (
          <p className="rounded-2xl bg-danger/10 px-4 py-3 text-sm text-danger" role="alert">
            {error}
          </p>
        ) : !data ? (
          <Loading />
        ) : stats.receipts.length === 0 ? (
          <p className="card p-6 text-center text-sm text-ink-soft">이날은 아직 영수증이 없어요</p>
        ) : (
          <>
            <section className="grid grid-cols-2 gap-2.5">
              <div className="card p-3">
                <p className="text-xs text-ink-soft">결제 금액</p>
                <p className="font-cute text-xl tabular-nums">{won(stats.total)}</p>
                <p className="text-[11px] text-ink-faint">영수증 {num(stats.count)}건</p>
              </div>
              <div className="card p-3">
                <p className="text-xs text-ink-soft">객단가 (1건 평균)</p>
                <p className="font-cute text-xl tabular-nums">{won(stats.avg)}</p>
                <p className="text-[11px] text-ink-faint">
                  취소·반품 {num(stats.voidCount)}건{stats.voidCount ? ` · ${won(stats.voidAmount)}` : ""}
                </p>
              </div>
            </section>

            <HourChart byHour={stats.byHour} lo={stats.lo} hi={stats.hi} />

            {stats.methods.length > 0 && (
              <section className="card p-4">
                <p className="mb-3 font-cute text-lg">결제수단별</p>
                <ul className="space-y-2.5">
                  {stats.methods.map(([method, m]) => {
                    const share = stats.methodTotal ? Math.round((m.amount / stats.methodTotal) * 100) : 0;
                    return (
                      <li key={method} className="text-sm">
                        <div className="mb-1 flex items-baseline justify-between gap-2">
                          <span className="truncate">{method}</span>
                          <span className="shrink-0 tabular-nums">
                            <b>{won(m.amount)}</b> <span className="text-xs text-ink-faint">· {num(m.count)}건 · {share}%</span>
                          </span>
                        </div>
                        <span className="block h-2 rounded-full bg-cream-deep">
                          <span className="block h-2 rounded-full bg-berry-300" style={{ width: `${Math.max(2, share)}%` }} />
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}

            <section className="card p-4">
              <p className="mb-1 font-cute text-lg">영수증 {num(stats.receipts.length)}건</p>
              <p className="mb-2 text-xs text-ink-soft">누르면 산 상품과 결제수단이 보여요.</p>
              <ul className="divide-y-2 divide-dashed divide-line">
                {stats.receipts.map((r) => {
                  const st = statusOf(r.status);
                  return (
                    <li key={r.id}>
                      <details className="group py-2">
                        <summary className="flex cursor-pointer list-none items-center gap-2">
                          <span className="w-12 shrink-0 font-mono text-sm tabular-nums">{r.at ? kstTime(r.at) : "--:--"}</span>
                          <span className="min-w-0 flex-1 truncate text-sm">
                            {r.goods[0]?.name || "상품"}
                            {r.goods.length > 1 ? ` 외 ${r.goods.length - 1}개` : ""}
                            <span className="block truncate text-[11px] text-ink-faint">
                              {[r.billNo && `No.${r.billNo}`, r.device].filter(Boolean).join(" · ")}
                            </span>
                          </span>
                          {!isPaid(r) && <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] ${st.tone}`}>{st.label}</span>}
                          <span className={`shrink-0 font-cute tabular-nums ${isPaid(r) ? "" : "text-ink-faint line-through"}`}>
                            {won(r.paymentAmount)}
                          </span>
                        </summary>
                        <div className="mt-2 space-y-1 rounded-2xl bg-cream p-3 text-sm">
                          {r.goods.map((g, i) => {
                            const p = g.code ? byCode.get(g.code) : undefined;
                            return (
                              <div key={i} className="flex items-baseline justify-between gap-2">
                                {p ? (
                                  <Link href={`/products/${p.id}`} className="min-w-0 truncate text-berry-600 underline">
                                    {p.name}
                                  </Link>
                                ) : (
                                  <span className="min-w-0 truncate">{g.name || g.code || "상품"}</span>
                                )}
                                <span className="shrink-0 tabular-nums text-ink-soft">
                                  × {num(g.qty)} · {won(g.amount)}
                                </span>
                              </div>
                            );
                          })}
                          {r.discountAmount > 0 && (
                            <div className="flex justify-between text-ink-soft">
                              <span>할인</span>
                              <span className="tabular-nums">−{won(r.discountAmount)}</span>
                            </div>
                          )}
                          {r.payments.length > 0 && (
                            <div className="border-t-2 border-dashed border-line pt-1 text-ink-soft">
                              {r.payments.map((p, i) => (
                                <div key={i} className="flex justify-between">
                                  <span>{p.method}</span>
                                  <span className="tabular-nums">{won(p.amount)}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </details>
                    </li>
                  );
                })}
              </ul>
              <p className="mt-2 text-center text-[11px] text-ink-faint">{relTime(data.fetchedAt)} 받아왔어요 · 같은 날짜는 1분 동안 같은 결과예요</p>
            </section>

            {user?.role === "admin" && data.fieldKeys && (
              <details className="rounded-2xl border-2 border-dashed border-line p-3 text-xs text-ink-soft">
                <summary className="cursor-pointer">빅솔론 칸 이름 보기 (개발용)</summary>
                <p className="mt-2 break-all">영수증: {data.fieldKeys.receipt.join(", ") || "-"}</p>
                <p className="mt-1 break-all">상품: {data.fieldKeys.goods.join(", ") || "-"}</p>
                <p className="mt-1 break-all">결제: {data.fieldKeys.payments.join(", ") || "-"}</p>
              </details>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default function ReceiptsPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Receipts />
    </Suspense>
  );
}
