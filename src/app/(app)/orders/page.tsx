"use client";

import { Bell, Check, Plus, RotateCcw, X } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { md, MethodChip, OrderChat } from "@/components/OrderChat";
import { useAuth, useToast } from "@/components/providers";
import { EmptyState, Field, Loading, MoneyInput, PageHeader, Segmented, Sheet } from "@/components/ui";
import { IS_DEMO } from "@/lib/config";
import { kstToday } from "@/lib/day";
import { num, won } from "@/lib/format";
import { useKakaoStatus, useOrders, useRefresh } from "@/lib/queries";
import { store } from "@/lib/store";
import type { Order, OrderInput, OrderMethod } from "@/lib/types";

const daysUntil = (day: string, today: string) =>
  Math.round((Date.parse(`${day}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000);
const dLabel = (n: number) => (n === 0 ? "오늘" : n > 0 ? `D-${n}` : `${-n}일 지남`);

const blank = (today: string): OrderInput => ({
  customer: "",
  item: "",
  price: 0,
  due_date: today,
  method: "pickup",
  memo: null,
  contact: null,
  address: null,
});

/** 주문 직접 추가 / 고치기 */
function OrderSheet({ order, onClose, today }: { order: Order | "new" | null; onClose: () => void; today: string }) {
  const { user } = useAuth();
  const toast = useToast();
  const refresh = useRefresh();
  const existing = order && order !== "new" ? order : null;
  const [f, setF] = useState<OrderInput>(blank(today));
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!order) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 시트를 열 때 값 채우기
    setF(
      order === "new"
        ? blank(today)
        : {
            customer: order.customer,
            item: order.item,
            price: order.price,
            due_date: order.due_date,
            method: order.method,
            memo: order.memo,
            contact: order.contact,
            address: order.address,
          },
    );
  }, [order, today]);

  async function run(fn: () => Promise<unknown>, msg: string) {
    setBusy(true);
    try {
      await fn();
      await refresh("orders");
      toast(msg, "wow");
      onClose();
    } catch (e) {
      toast(e instanceof Error ? e.message : "저장하지 못했어요", "sad");
    } finally {
      setBusy(false);
    }
  }

  const set = <K extends keyof OrderInput>(k: K, v: OrderInput[K]) => setF((o) => ({ ...o, [k]: v }));
  const valid = f.due_date && (f.customer.trim() || f.item.trim());

  return (
    <Sheet open={order !== null} onClose={onClose} title={existing ? "주문 고치기" : "주문 직접 추가"}>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <Field label="날짜">
            {(id) => <input id={id} type="date" className="input" value={f.due_date} onChange={(e) => set("due_date", e.target.value)} />}
          </Field>
          <Field label="받는 방법">
            {() => (
              <Segmented<OrderMethod>
                options={[
                  { value: "pickup", label: "픽업" },
                  { value: "delivery", label: "택배" },
                ]}
                value={f.method}
                onChange={(v) => set("method", v)}
              />
            )}
          </Field>
        </div>
        <Field label="주문한 분">
          {(id) => <input id={id} className="input" value={f.customer} onChange={(e) => set("customer", e.target.value)} placeholder="예: 김포포" />}
        </Field>
        <Field label="상품">
          {(id) => <input id={id} className="input" value={f.item} onChange={(e) => set("item", e.target.value)} placeholder="예: 하치와레 꽃다발" />}
        </Field>
        <Field label="가격">{(id) => <MoneyInput id={id} value={f.price} onChange={(n) => set("price", n)} />}</Field>
        {f.method === "delivery" && (
          <>
            <Field label="연락처 (선택)">
              {(id) => <input id={id} className="input" value={f.contact ?? ""} onChange={(e) => set("contact", e.target.value || null)} />}
            </Field>
            <Field label="주소 (선택)">
              {(id) => <input id={id} className="input" value={f.address ?? ""} onChange={(e) => set("address", e.target.value || null)} />}
            </Field>
          </>
        )}
        <Field label="메모 (선택)">
          {(id) => (
            <input id={id} className="input" value={f.memo ?? ""} onChange={(e) => set("memo", e.target.value || null)} placeholder="예: 라넌으로 변경, 리본 핑크" />
          )}
        </Field>
        <button
          type="button"
          className="btn-primary w-full"
          disabled={busy || !valid}
          onClick={() => run(() => store().saveOrder(f, existing?.id), existing ? "고쳤어요" : "주문을 넣었어요")}
        >
          저장
        </button>
        {existing && (
          <div className="grid grid-cols-2 gap-2">
            {existing.status === "open" ? (
              <button type="button" className="btn-soft btn-sm" disabled={busy} onClick={() => run(() => store().saveOrder({ ...f, status: "done" }, existing.id), "완료했어요")}>
                <Check size={16} /> 완료
              </button>
            ) : (
              <button type="button" className="btn-soft btn-sm" disabled={busy} onClick={() => run(() => store().saveOrder({ ...f, status: "open" }, existing.id), "다시 진행 중이에요")}>
                <RotateCcw size={16} /> 다시 진행
              </button>
            )}
            {existing.status !== "canceled" ? (
              <button type="button" className="btn-ghost btn-sm text-danger" disabled={busy} onClick={() => run(() => store().saveOrder({ ...f, status: "canceled" }, existing.id), "주문을 취소했어요")}>
                <X size={16} /> 주문 취소
              </button>
            ) : (
              user?.role === "admin" && (
                <button type="button" className="btn-ghost btn-sm text-danger" disabled={busy} onClick={() => run(() => store().deleteOrder(existing.id), "완전히 지웠어요")}>
                  <X size={16} /> 완전히 지우기
                </button>
              )
            )}
          </div>
        )}
      </div>
    </Sheet>
  );
}

const hourLabel = (h: number) => (h === 0 ? "밤 12시" : h < 12 ? `오전 ${h}시` : h === 12 ? "낮 12시" : `오후 ${h - 12}시`);

/** 관리자: 카카오톡 ‘나에게 보내기’ 알림 연결 */
function KakaoCard() {
  const toast = useToast();
  const refresh = useRefresh();
  const { data: status, isLoading, error } = useKakaoStatus(!IS_DEMO);
  const [busy, setBusy] = useState(false);

  async function setHour(hour: number) {
    setBusy(true);
    try {
      await store().kakaoSetHour(hour);
      await refresh("kakao");
      toast(`이제 매일 ${hourLabel(hour)}쯤 보내요`, "wow");
    } catch (e) {
      toast(e instanceof Error ? e.message : "저장하지 못했어요", "sad");
    } finally {
      setBusy(false);
    }
  }

  async function connect() {
    setBusy(true);
    try {
      window.location.href = await store().kakaoConnectUrl();
    } catch (e) {
      toast(e instanceof Error ? e.message : "연결을 시작하지 못했어요", "sad");
      setBusy(false);
    }
  }

  async function test() {
    setBusy(true);
    try {
      await store().kakaoTest();
      toast("카카오톡 ‘나와의 채팅’으로 보냈어요!", "wow");
    } catch (e) {
      toast(e instanceof Error ? e.message : "보내지 못했어요", "sad");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card p-4">
      <p className="mb-1 flex items-center gap-1.5 font-cute text-lg">
        <Bell size={18} className="text-butter-700" /> 카카오톡 알림
      </p>
      <p className="mb-3 text-xs text-ink-soft">
        매일 {hourLabel(status?.briefHour ?? 9)}쯤 ‘나와의 채팅’으로 보내요 (정각~59분 사이). 택배는 날짜 7일 전부터, 픽업은 전날·당일에
        알려요. 완료한 주문은 빠져요. 보낼 주문이 없으면 안 보내요.
      </p>
      {IS_DEMO ? (
        <p className="text-sm text-ink-soft">체험 모드에서는 연결할 수 없어요.</p>
      ) : isLoading ? (
        <p className="text-sm text-ink-soft">확인하는 중...</p>
      ) : error || !status ? (
        <p className="text-sm text-danger">상태를 확인하지 못했어요.</p>
      ) : !status.configured ? (
        <p className="rounded-2xl bg-cream p-3 text-xs text-ink-soft">
          Vercel 환경변수에 <code>KAKAO_REST_API_KEY</code>(카카오 디벨로퍼스 REST API 키)와 <code>CRON_SECRET</code>(아무 긴 비밀 문자열)을 넣고
          Redeploy 해 주세요.
        </p>
      ) : (
        <div className="space-y-2">
          <p className="text-sm">
            {status.connected ? "✅ 카카오톡 연결됨" : "카카오 계정을 연결해 주세요"}
            {status.connected && !status.cronReady && <span className="block text-xs text-danger">매일 알림을 켜려면 Vercel에 CRON_SECRET을 넣어 주세요.</span>}
            {status.lastBriefOn && <span className="block text-xs text-ink-faint">마지막 알림 {status.lastBriefOn}</span>}
          </p>
          <label className="flex items-center justify-between gap-3 rounded-2xl bg-cream px-3 py-2 text-sm">
            <span>보내는 시간</span>
            <select
              className="rounded-xl border-2 border-line bg-white px-2 py-1 font-semibold"
              value={status.briefHour}
              onChange={(e) => void setHour(Number(e.target.value))}
              disabled={busy}
              aria-label="카카오톡 알림 보내는 시간"
            >
              {Array.from({ length: 24 }, (_, h) => (
                <option key={h} value={h}>
                  {hourLabel(h)}
                </option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" className={status.connected ? "btn-soft btn-sm" : "btn-primary btn-sm"} onClick={connect} disabled={busy}>
              {status.connected ? "다시 연결" : "카카오톡 연결"}
            </button>
            <button type="button" className="btn-soft btn-sm" onClick={test} disabled={busy || !status.connected}>
              지금 보내 보기
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function Orders() {
  const { user } = useAuth();
  const toast = useToast();
  const refresh = useRefresh();
  const router = useRouter();
  const params = useSearchParams();
  const { data: orders = [], isLoading, error } = useOrders();
  const [today] = useState(kstToday);
  const [tab, setTab] = useState<"open" | "done" | "all">("open");
  const [editing, setEditing] = useState<Order | "new" | null>(null);

  // 카카오 연결 후 돌아왔을 때 알려줘요
  useEffect(() => {
    const k = params.get("kakao");
    if (!k) return;
    toast(k === "ok" ? "카카오톡이 연결됐어요! ‘지금 보내 보기’로 확인해 보세요" : params.get("msg") || "카카오 연결에 실패했어요", k === "ok" ? "wow" : "sad");
    void refresh("kakao");
    router.replace("/orders");
  }, [params, refresh, router, toast]);

  const list = useMemo(() => {
    const filtered = orders.filter((o) => (tab === "all" ? true : tab === "open" ? o.status === "open" : o.status === "done"));
    return filtered.sort((a, b) => (tab === "open" ? a.due_date.localeCompare(b.due_date) : b.due_date.localeCompare(a.due_date)));
  }, [orders, tab]);

  const openOrders = orders.filter((o) => o.status === "open");
  const shipSoon = openOrders.filter((o) => o.method === "delivery" && daysUntil(o.due_date, today) <= 7).length;

  async function complete(o: Order) {
    try {
      const input: OrderInput = {
        customer: o.customer,
        item: o.item,
        price: o.price,
        due_date: o.due_date,
        method: o.method,
        memo: o.memo,
        contact: o.contact,
        address: o.address,
        status: o.status === "open" ? "done" : "open",
      };
      await store().saveOrder(input, o.id);
      await refresh("orders");
      toast(o.status === "open" ? `${o.customer || o.item} 완료!` : "다시 진행 중이에요", "wow");
    } catch (e) {
      toast(e instanceof Error ? e.message : "바꾸지 못했어요", "sad");
    }
  }

  return (
    <div>
      <PageHeader
        back
        title="주문"
        sub="꽃다발 · 예약 주문"
        right={
          <button type="button" className="btn-soft btn-sm" onClick={() => setEditing("new")}>
            <Plus size={16} /> 직접 추가
          </button>
        }
      />
      <div className="space-y-4">
        <OrderChat />

        <section className="card p-4">
          <div className="mb-3 flex items-baseline justify-between gap-2">
            <p className="font-cute text-lg">주문 목록</p>
            <p className="text-xs text-ink-soft">
              진행 중 {num(openOrders.length)}건{shipSoon ? ` · 7일 안에 보낼 택배 ${shipSoon}건` : ""}
            </p>
          </div>
          <div className="mb-3">
            <Segmented
              options={[
                { value: "open", label: "진행 중" },
                { value: "done", label: "완료" },
                { value: "all", label: "전체" },
              ]}
              value={tab}
              onChange={setTab}
            />
          </div>
          {isLoading ? (
            <Loading />
          ) : error ? (
            <p className="rounded-2xl bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">
              {error instanceof Error ? error.message : "주문을 불러오지 못했어요."}
            </p>
          ) : list.length === 0 ? (
            <EmptyState mood="sleep" title={tab === "open" ? "진행 중인 주문이 없어요" : "주문이 없어요"} desc="주문 비서에 붙여 넣거나 ‘직접 추가’를 눌러 보세요." />
          ) : (
            <ul className="divide-y-2 divide-dashed divide-line">
              {list.map((o) => {
                const d = daysUntil(o.due_date, today);
                const urgent = o.status === "open" && (d < 0 || (o.method === "delivery" ? d <= 7 : d <= 1));
                return (
                  <li key={o.id} className={`flex items-center gap-2 py-2.5 ${o.status !== "open" ? "opacity-60" : ""}`}>
                    <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setEditing(o)}>
                      <span className="flex flex-wrap items-center gap-1.5 text-xs">
                        <span className="font-cute text-sm text-ink">{md(o.due_date)}</span>
                        <MethodChip method={o.method} />
                        {o.status === "open" ? (
                          <span className={`rounded-full px-2 py-0.5 text-[11px] ${urgent ? (d < 0 ? "bg-danger/10 text-danger" : "bg-butter-100 text-butter-700") : "bg-cream-deep text-ink-soft"}`}>
                            {dLabel(d)}
                          </span>
                        ) : (
                          <span className="rounded-full bg-cream-deep px-2 py-0.5 text-[11px] text-ink-soft">{o.status === "done" ? "완료" : "취소"}</span>
                        )}
                      </span>
                      <span className={`mt-0.5 block truncate text-sm font-medium ${o.status === "canceled" ? "line-through" : ""}`}>
                        {o.customer} · {o.item}
                      </span>
                      <span className="block truncate text-xs text-ink-soft">
                        {won(o.price)}
                        {o.memo ? ` · ${o.memo}` : ""}
                      </span>
                    </button>
                    {o.status !== "canceled" && (
                      <button
                        type="button"
                        className={`btn-sm shrink-0 ${o.status === "open" ? "btn-soft" : "btn-ghost"}`}
                        onClick={() => complete(o)}
                        aria-label={o.status === "open" ? `${o.customer} 완료` : `${o.customer} 다시 진행`}
                      >
                        {o.status === "open" ? <Check size={16} /> : <RotateCcw size={16} />}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {user?.role === "admin" && <KakaoCard />}
      </div>
      <OrderSheet order={editing} onClose={() => setEditing(null)} today={today} />
    </div>
  );
}

export default function OrdersPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Orders />
    </Suspense>
  );
}
