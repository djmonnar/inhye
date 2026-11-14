"use client";

import { Check, ChevronRight, CircleHelp, Plus, ReceiptText, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { DayNav } from "@/components/DayNav";
import { useAuth, useToast } from "@/components/providers";
import { EmptyState, Loading, PageHeader, ProductThumb } from "@/components/ui";
import { IS_DEMO } from "@/lib/config";
import { kstToday, shiftDay } from "@/lib/day";
import { num, relTime, shortDate, won } from "@/lib/format";
import { usePosRuns, usePosSales, usePosStatus, useProducts, useRefresh } from "@/lib/queries";
import { store } from "@/lib/store";
import type { PosLive, Product } from "@/lib/types";

const startOfDay = (d = new Date()) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

function Step({ done, title, desc }: { done: boolean; title: string; desc: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span
        className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
          done ? "bg-matcha-500 text-white" : "bg-cream-deep text-ink-faint"
        }`}
      >
        {done ? <Check size={16} /> : <CircleHelp size={16} />}
      </span>
      <div className="min-w-0">
        <p className="font-cute text-[15px]">{title}</p>
        <div className="text-xs text-ink-soft">{desc}</div>
      </div>
    </li>
  );
}

/** 빅솔론 하루치 판매를 바로 받아 보여주기만 해요 (저장·재고 차감 없음 — DB 표가 없어도 돼요). */
function LiveSales({ products }: { products: Product[] }) {
  const toast = useToast();
  const refresh = useRefresh();
  const [today] = useState(kstToday);
  const [day, setDay] = useState(today);
  useEffect(() => {
    // 카톡 챗봇 ‘어제 매출’ 버튼처럼 ?day=YYYY-MM-DD 로 들어오면 그날을 보여줘요
    const d = new URLSearchParams(window.location.search).get("day");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 주소의 날짜는 화면이 뜬 뒤에만 읽을 수 있어요
    if (d && /^\d{4}-\d{2}-\d{2}$/.test(d) && d <= today) setDay(d);
  }, [today]);
  const [data, setData] = useState<PosLive | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const byCode = useMemo(
    () => new Map(products.filter((p) => p.kiosk_code).map((p) => [p.kiosk_code as string, p])),
    [products],
  );

  const load = useCallback(async (d: string) => {
    setLoading(true);
    setError("");
    try {
      const live = await store().posLive(d);
      setData(live);
      if (live.linked || live.created) {
        // 코드를 붙였거나 빅솔론 상품을 자동 등록했어요 → 상품 목록을 새로 받아 바로 연결돼 보이게
        await refresh("products");
        toast(
          [
            live.created ? `빅솔론 상품 ${live.created}개를 앱에 자동 등록했어요` : "",
            live.linked ? `이름이 같은 상품 ${live.linked}개에 빅솔론 코드를 붙였어요` : "",
          ]
            .filter(Boolean)
            .join(" · "),
          "wow",
        );
      }
    } catch (e) {
      setData(null);
      setError(e instanceof Error ? e.message : "빅솔론에서 받아오지 못했어요.");
    } finally {
      setLoading(false);
    }
  }, [refresh, toast]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 날짜를 바꾸면 그날 판매를 받아와요
    void load(day);
  }, [day, load]);

  const items = useMemo(() => [...(data?.items ?? [])].sort((a, b) => b.qty - a.qty), [data]);
  const totalQty = items.reduce((n, it) => n + it.qty, 0);
  const totalAmount = items.reduce((n, it) => n + it.amount, 0);

  return (
    <section className="card p-4">
      <div className="mb-1 flex items-center justify-between gap-2">
        <p className="font-cute text-lg">빅솔론 판매 바로 보기</p>
        <button type="button" className="btn-ghost btn-sm" onClick={() => void load(day)} disabled={loading}>
          <RefreshCw size={16} className={loading ? "animate-spin" : ""} /> 새로고침
        </button>
      </div>
      <p className="mb-3 text-xs text-ink-soft">
        빅솔론에서 바로 받아 보여주기만 해요 (저장·재고 차감은 안 해요). 판매 후 최대 10분 뒤에 잡혀요.
      </p>
      {data?.sample && <p className="mb-2 rounded-xl bg-butter-100 px-3 py-1.5 text-xs">체험 모드 샘플이에요</p>}

      <div className="mb-3">
        <DayNav day={day} today={today} onChange={setDay} disabled={loading} />
      </div>

      {error ? (
        <p className="rounded-2xl bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">
          {error}
        </p>
      ) : !data ? (
        <p className="py-4 text-center text-sm text-ink-soft">불러오는 중...</p>
      ) : items.length === 0 ? (
        <p className="py-4 text-center text-sm text-ink-soft">이날은 아직 판매가 없어요</p>
      ) : (
        <>
          <div className="mb-2 grid grid-cols-2 gap-2">
            <div className="rounded-2xl bg-berry-50 p-3">
              <p className="text-xs text-ink-soft">판매 수량</p>
              <p className="font-cute text-xl tabular-nums">{num(totalQty)}개</p>
            </div>
            <div className="rounded-2xl bg-berry-50 p-3">
              <p className="text-xs text-ink-soft">결제 금액</p>
              <p className="font-cute text-xl tabular-nums">{won(totalAmount)}</p>
            </div>
          </div>
          <ul className="divide-y-2 divide-dashed divide-line">
            {items.map((it) => {
              const p = it.code ? byCode.get(it.code) : undefined;
              return (
                <li key={`${it.code}-${it.name}`} className="flex items-center gap-3 py-2">
                  {p ? (
                    <ProductThumb product={p} className="h-10 w-10" frame="rounded-xl border-2" />
                  ) : (
                    <span className="h-10 w-10 shrink-0 rounded-xl border-2 border-dashed border-line" />
                  )}
                  <div className="min-w-0 flex-1">
                    {p ? (
                      <Link href={`/products/${p.id}`} className="block truncate text-sm font-medium">
                        {p.name}
                      </Link>
                    ) : (
                      <p className="truncate text-sm font-medium text-ink-soft">{it.name}</p>
                    )}
                    <p className="truncate text-xs text-ink-faint">
                      {it.code && <span className="font-mono">{it.code} · </span>}
                      {p ? `앱 재고 ${num(p.stock_qty)}` : "앱에 없는 상품"}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-cute tabular-nums">{num(it.qty)}개</p>
                    <p className="text-xs tabular-nums text-ink-soft">{won(it.amount)}</p>
                  </div>
                  {!p && (
                    <Link
                      href={`/products/new?${new URLSearchParams({ ...(it.code ? { code: it.code } : {}), name: it.name }).toString()}`}
                      className="btn-soft btn-sm shrink-0"
                      aria-label={`${it.name} 등록`}
                    >
                      <Plus size={14} />
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
          <p className="mt-2 text-center text-[11px] text-ink-faint">{relTime(data.fetchedAt)} 받아왔어요</p>
        </>
      )}
      <Link href={`/sales/receipts?day=${day}`} className="btn-soft btn-sm mt-3 w-full">
        <ReceiptText size={16} /> 영수증별로 보기 (시간대 · 결제수단 · 취소) <ChevronRight size={16} />
      </Link>
    </section>
  );
}

export default function SalesPage() {
  const { user } = useAuth();
  const toast = useToast();
  const refresh = useRefresh();
  const [since] = useState(() => {
    const d = startOfDay();
    d.setDate(d.getDate() - 31);
    return d.toISOString();
  });
  const { data: sales = [], isLoading } = usePosSales(since);
  const { data: runs = [] } = usePosRuns();
  const { data: status } = usePosStatus();
  const { data: products = [] } = useProducts();
  const [syncing, setSyncing] = useState(false);
  const [today] = useState(kstToday);
  const [fromDay, setFromDay] = useState(today);

  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  const stats = useMemo(() => {
    const today = startOfDay().getTime();
    const week = today - 6 * 86400000;
    const month = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();
    const sum = (from: number) => {
      const list = sales.filter((s) => new Date(s.sold_at).getTime() >= from);
      return { amount: list.reduce((n, s) => n + s.amount, 0), qty: list.reduce((n, s) => n + s.qty, 0) };
    };
    const top = new Map<string, { key: string; name: string; productId: string | null; qty: number; amount: number }>();
    for (const s of sales) {
      if (new Date(s.sold_at).getTime() < week) continue;
      const key = s.product_id ?? `code:${s.product_code ?? s.product_name}`;
      const cur = top.get(key) ?? { key, name: s.product_name, productId: s.product_id, qty: 0, amount: 0 };
      cur.qty += s.qty;
      cur.amount += s.amount;
      top.set(key, cur);
    }
    const unmatched = new Map<string, { code: string | null; name: string; qty: number }>();
    for (const s of sales) {
      if (s.product_id) continue;
      const key = s.product_code ?? s.barcode ?? s.product_name;
      const cur = unmatched.get(key) ?? { code: s.product_code, name: s.product_name, qty: 0 };
      cur.qty += s.qty;
      unmatched.set(key, cur);
    }
    return {
      today: sum(today),
      week: sum(week),
      month: sum(month),
      top: [...top.values()].sort((a, b) => b.qty - a.qty).slice(0, 8),
      unmatched: [...unmatched.values()].sort((a, b) => b.qty - a.qty),
    };
  }, [sales]);

  const connected = runs.some((r) => r.ok);

  async function sync() {
    setSyncing(true);
    try {
      // 처음 가져올 때만 시작 날짜를 보내요 (그다음부터는 서버가 알아서 이어 받아요)
      const r = await store().posSync(connected ? undefined : fromDay);
      await refresh("pos", "products", "moves");
      toast(
        `${r.days?.length ?? 1}일치 ${r.fetched}개 상품 · 재고 반영 ${r.applied}건${r.linked ? ` · 이름으로 코드 연결 ${r.linked}개` : ""}${r.created ? ` · 앱에 자동 등록 ${r.created}개` : ""}`,
        "wow",
      );
    } catch (e) {
      toast(e instanceof Error ? e.message : "가져오지 못했어요", "sad");
      await refresh("pos");
    } finally {
      setSyncing(false);
    }
  }

  const keysReady = Boolean(status?.apiKey);
  const ready = keysReady && Boolean(status?.serviceKey);
  const lastRun = runs[0];
  const maxTop = Math.max(1, ...stats.top.map((t) => t.qty));

  return (
    <div>
      <PageHeader
        back
        title="매출"
        sub="빅솔론 판매 → 재고 자동 반영"
        right={
          <Link href="/sales/settle" className="btn-soft btn-sm">
            A/B 정산
          </Link>
        }
      />
      <div className="space-y-4">
        <section className="card p-4">
          <p className="mb-3 font-cute text-lg">빅솔론 연동 준비</p>
          <ol className="space-y-3">
            <Step
              done={!IS_DEMO && Boolean(status?.serviceKey)}
              title="1. Supabase 연결"
              desc={
                IS_DEMO ? (
                  <>
                    아직 체험 모드예요.{" "}
                    <Link href="/setup" className="font-semibold text-berry-600 underline">
                      연결 방법
                    </Link>
                  </>
                ) : status?.serviceKey ? (
                  "연결됐어요"
                ) : (
                  "Vercel에 SUPABASE_SERVICE_ROLE_KEY가 필요해요"
                )
              }
            />
            <Step
              done={keysReady}
              title="2. 빅솔론 매장키 저장"
              desc={
                keysReady ? (
                  "매장키가 서버에 저장돼 있어요 (값은 화면에 안 보여요)"
                ) : (
                  <>
                    빅솔론 ASP ‘외부 연결 관리 → 연동 키 발급’에서 받은 키를 Vercel → Settings → Environment Variables에{" "}
                    <code className="rounded bg-cream px-1">BIXOLON_API_KEY</code>로 넣고 Redeploy. 키는 채팅에 보내지 마세요.
                  </>
                )
              }
            />
            <Step
              done={connected}
              title="3. 첫 가져오기로 연결 확인"
              desc={
                connected
                  ? "연결됐어요. 매일 가져오면 팔린 만큼 재고가 빠져요."
                  : keysReady
                    ? "처음엔 아래에서 고른 날부터 판매를 받아 재고를 빼요. 앱에 실제 재고를 넣은 날을 골라 주세요 (그 전 판매는 안 빠져요). 판매 후 최대 10분 뒤에 잡혀요."
                    : "키를 저장하면 눌러서 확인할 수 있어요."
              }
            />
          </ol>
          {user?.role === "admin" && !connected && (
            <label className="mt-4 block rounded-2xl bg-cream p-3">
              <span className="block font-cute text-[15px]">어느 날 판매부터 재고를 뺄까요?</span>
              <span className="mb-2 block text-xs text-ink-soft">
                재고를 센 날을 골라요. 문 열기 전에 셌다면 그날, 문 닫은 뒤 셌다면 다음 날이에요. 최대 30일 전까지 돼요.
              </span>
              <input
                type="date"
                className="input"
                value={fromDay}
                min={shiftDay(today, -30)}
                max={today}
                onChange={(e) => setFromDay(e.target.value || today)}
              />
            </label>
          )}
          {user?.role === "admin" && (
            <button type="button" className="btn-primary mt-4 w-full" disabled={!ready || syncing} onClick={sync}>
              <RefreshCw size={18} className={syncing ? "animate-spin" : ""} /> {syncing ? "가져오는 중..." : "지금 가져오기"}
            </button>
          )}
          {lastRun && (
            <p className={`mt-2 text-center text-xs ${lastRun.ok === false ? "text-danger" : "text-ink-soft"}`}>
              마지막 가져오기 {relTime(lastRun.started_at)} ·{" "}
              {lastRun.ok === false ? lastRun.error : `${lastRun.fetched}개 상품 · 재고 반영 ${lastRun.applied}건`}
            </p>
          )}
        </section>

        {(IS_DEMO || status?.apiKey) && <LiveSales products={products} />}

        {isLoading ? (
          <Loading />
        ) : sales.length === 0 ? (
          <EmptyState
            mood="sleep"
            title="아직 받은 매출이 없어요"
            desc="빅솔론과 연결되면 키오스크에서 팔린 상품이 여기에 쌓이고, 그만큼 재고가 자동으로 빠져요."
          />
        ) : (
          <>
            <section className="grid grid-cols-3 gap-2.5">
              {[
                { label: "오늘", v: stats.today },
                { label: "최근 7일", v: stats.week },
                { label: "이번 달", v: stats.month },
              ].map((s) => (
                <div key={s.label} className="card p-3">
                  <p className="text-xs text-ink-soft">{s.label}</p>
                  <p className="mt-0.5 font-cute text-lg leading-tight tabular-nums">{won(s.v.amount)}</p>
                  <p className="text-[11px] text-ink-faint">{num(s.v.qty)}개 판매</p>
                </div>
              ))}
            </section>

            {stats.top.length > 0 && (
              <section className="card p-4">
                <p className="mb-3 font-cute text-lg">최근 7일 많이 팔린 상품</p>
                <ul className="space-y-2.5">
                  {stats.top.map((t) => (
                    <li key={t.key} className="grid grid-cols-[7rem_1fr_2.5rem] items-center gap-2 text-sm" title={`${t.name}: ${t.qty}개 · ${won(t.amount)}`}>
                      {t.productId ? (
                        <Link href={`/products/${t.productId}`} className="truncate text-ink">
                          {byId.get(t.productId)?.name ?? t.name}
                        </Link>
                      ) : (
                        <span className="truncate text-ink-soft">{t.name}</span>
                      )}
                      <span className="h-3 rounded-full bg-cream-deep">
                        <span className="block h-3 rounded-full bg-berry-300" style={{ width: `${Math.max(4, (t.qty / maxTop) * 100)}%` }} />
                      </span>
                      <span className="text-right font-semibold tabular-nums">{num(t.qty)}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {stats.unmatched.length > 0 && (
              <section className="card border-butter-300 p-4">
                <p className="font-cute text-lg">앱에 없는 상품 {stats.unmatched.length}개</p>
                <p className="mb-2 text-xs text-ink-soft">
                  빅솔론 상품 코드가 같은 상품이 없어서 재고를 못 뺐어요. 등록하거나 기존 상품에 ‘빅솔론 상품 코드’를 넣으면 다음 가져오기 때
                  자동으로 빠져요.
                </p>
                <ul className="divide-y-2 divide-dashed divide-line">
                  {stats.unmatched.map((u) => (
                    <li key={`${u.code}-${u.name}`} className="flex items-center gap-2 py-2 text-sm">
                      <span className="min-w-0 flex-1 truncate">
                        {u.name} <span className="font-mono text-xs text-ink-faint">{u.code}</span>
                      </span>
                      <span className="text-xs text-ink-soft">{num(u.qty)}개</span>
                      <Link
                        href={`/products/new?${new URLSearchParams({ ...(u.code ? { code: u.code } : {}), name: u.name }).toString()}`}
                        className="btn-soft btn-sm"
                      >
                        <Plus size={14} /> 등록
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section className="card p-4">
              <p className="mb-2 font-cute text-lg">날짜별 판매</p>
              <ul className="divide-y-2 divide-dashed divide-line">
                {sales.slice(0, 30).map((s) => {
                  const p = s.product_id ? byId.get(s.product_id) : undefined;
                  return (
                    <li key={s.id} className="flex items-center gap-3 py-2">
                      {p ? <ProductThumb product={p} className="h-10 w-10" frame="rounded-xl border-2" /> : <span className="h-10 w-10" />}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{p?.name ?? s.product_name}</p>
                        <p className="text-xs text-ink-faint">
                          {s.external_id.startsWith("goods:") ? `${shortDate(s.sold_at)} 하루 ${num(s.qty)}개` : relTime(s.sold_at)}
                          {s.payment ? ` · ${s.payment}` : ""}
                          {s.stock_applied_at ? " · 재고 반영됨" : ""}
                        </p>
                      </div>
                      <span className={`font-cute tabular-nums ${s.qty < 0 ? "text-danger" : ""}`}>
                        {s.qty < 0 ? "반품 " : ""}
                        {won(s.amount)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
