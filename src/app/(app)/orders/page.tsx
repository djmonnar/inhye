"use client";

import { Bell, Check, Copy, ExternalLink, Phone, Plus, RotateCcw, Truck, X } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { md, MethodChip, OrderChat } from "@/components/OrderChat";
import { DayChips, TimeChips } from "@/components/WhenPicker";
import { useAuth, useToast } from "@/components/providers";
import { EmptyState, Field, Loading, MoneyInput, PageHeader, Segmented, Sheet } from "@/components/ui";
import { CARRIER_NAMES, normTracking, trackingUrl } from "@/lib/carriers";
import { IS_DEMO } from "@/lib/config";
import { actDay, kstToday, timeLabel, unpaid } from "@/lib/day";
import { num, telOf, won } from "@/lib/format";
import { j } from "@/lib/josa";
import { itemLabel, PRICE_FOOTER, PRICE_LIST } from "@/lib/priceList";
import { useKakaoStatus, useLogenStatus, useOrders, useRefresh } from "@/lib/queries";
import { shipNoticeForOrder } from "@/lib/shipNotice";
import { store } from "@/lib/store";
import type { LogenCheck, LogenRun, Order, OrderInput, OrderMethod } from "@/lib/types";

const daysUntil = (day: string, today: string) =>
  Math.round((Date.parse(`${day}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000);
const dLabel = (n: number) => (n === 0 ? "오늘" : n > 0 ? `D-${n}` : `${-n}일 지남`);

/** 로젠 접수 전에 빠진 것 (서버 logenProblems와 같은 기준) */
function logenMissing(o: Pick<Order, "status" | "method" | "customer" | "address" | "contact">): string[] {
  const p: string[] = [];
  if (o.status !== "open") p.push("진행 중 주문만");
  if (o.method !== "delivery") p.push("택배 주문만");
  if (!o.customer.trim()) p.push("받는 분 이름");
  if (!o.address?.trim()) p.push("주소");
  if ((o.contact ?? "").replace(/\D/g, "").length < 9) p.push("연락처");
  return p;
}

/** 입금 확인한 때 — "11/16 오후 2:30" */
function paidTime(iso: string): string {
  const k = new Date(new Date(iso).getTime() + 9 * 3600_000).toISOString();
  return `${Number(k.slice(5, 7))}/${Number(k.slice(8, 10))} ${timeLabel(k.slice(11, 16))}`;
}

/** 로젠 결과 → 한 줄 안내 */
function logenSummary(r: LogenRun): { msg: string; ok: boolean } {
  const parts = [
    r.done.length ? `송장번호 ${r.done.length}건 받음` : "",
    r.waiting.length ? `${r.waiting.length}건 접수됨(로젠에서 송장 출력하면 번호가 생겨요)` : "",
    r.failed.length ? `${r.failed.length}건 실패: ${r.failed.map((f) => `${f.customer || "손님"} — ${f.message}`).join(" / ")}` : "",
  ].filter(Boolean);
  return { msg: parts.join(" · ") || "바뀐 게 없어요", ok: !r.failed.length };
}

const blank = (today: string): OrderInput => ({
  customer: "",
  item: "",
  price: 0,
  due_date: today,
  due_time: null,
  method: "pickup",
  ship_date: null,
  carrier: null,
  tracking_no: null,
  paid: false,
  memo: null,
  contact: null,
  address: null,
});

/**
 * 저장할 값: 출고일·택배사·송장번호는 택배일 때만, 그리고 넣었거나 원래 있던 걸 지울 때만 보내요
 * (예전 DB(v6·v7)에 그 칸이 없어도 그 칸을 안 쓰는 주문은 그대로 저장돼요).
 */
function toInput(f: OrderInput, existing: Order | null): OrderInput {
  const { ship_date, carrier, tracking_no, paid, ...rest } = f;
  const delivery = f.method === "delivery";
  const ship = delivery ? (ship_date ?? null) : null;
  const no = delivery ? normTracking(tracking_no) : null;
  const car = delivery ? (carrier ?? null) : null;
  return {
    ...rest,
    ...(ship || existing?.ship_date ? { ship_date: ship } : {}),
    ...(no || existing?.tracking_no ? { tracking_no: no } : {}),
    ...(car || existing?.carrier ? { carrier: car } : {}),
    // 입금은 바뀔 때만 (새 주문은 체크했을 때만) — 예전 DB(v8)에서도 다른 주문은 저장되게
    ...(paid !== undefined && (existing ? paid !== (existing.paid ?? false) : paid) ? { paid } : {}),
  };
}

/** 주문 직접 추가 / 고치기 */
function OrderSheet({ order, onClose, today }: { order: Order | "new" | null; onClose: () => void; today: string }) {
  const { user } = useAuth();
  const toast = useToast();
  const refresh = useRefresh();
  const existing = order && order !== "new" ? order : null;
  const [f, setF] = useState<OrderInput>(blank(today));
  const { data: logen } = useLogenStatus(!IS_DEMO);
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
            due_time: order.due_time,
            method: order.method,
            ship_date: order.ship_date,
            carrier: order.carrier,
            tracking_no: order.tracking_no,
            paid: order.paid ?? false,
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

  /** 입금 체크 — 이미 있는 주문은 누르자마자 저장 (시트는 열어 둔 채로), 새 주문은 저장할 때 같이 */
  async function togglePaid(next: boolean) {
    set("paid", next);
    if (!existing) return;
    setBusy(true);
    try {
      const { customer, item, price, due_date, due_time, method, memo, contact, address } = existing;
      await store().saveOrder({ customer, item, price, due_date, due_time, method, memo, contact, address, paid: next }, existing.id);
      await refresh("orders");
      toast(next ? `${existing.customer || "손님"} 입금 확인했어요 💰` : "입금 전으로 바꿨어요", next ? "wow" : "wink");
    } catch (e) {
      set("paid", !next);
      toast(e instanceof Error ? e.message : "바꾸지 못했어요", "sad");
    } finally {
      setBusy(false);
    }
  }

  async function runLogen(fn: () => Promise<LogenRun>) {
    setBusy(true);
    try {
      const r = await fn();
      await refresh("orders");
      const { msg, ok } = logenSummary(r);
      toast(msg, ok ? "wow" : "sad");
      if (ok) onClose();
    } catch (e) {
      toast(e instanceof Error ? e.message : "로젠에 보내지 못했어요", "sad");
    } finally {
      setBusy(false);
    }
  }

  async function copyNotice(o: Pick<Order, "customer" | "item" | "carrier" | "tracking_no">) {
    try {
      await navigator.clipboard.writeText(shipNoticeForOrder(o));
      toast(o.tracking_no ? "송장 안내문을 복사했어요. 손님 카톡에 붙여 넣으세요!" : "복사했어요. 송장번호 칸(○○○)은 채워서 보내 주세요", "wink");
    } catch {
      toast("복사하지 못했어요", "sad");
    }
  }
  const valid = f.due_date && (f.customer.trim() || f.item.trim());

  return (
    <Sheet open={order !== null} onClose={onClose} title={existing ? "주문 고치기" : "주문 직접 추가"}>
      <div className="space-y-3">
        <Segmented<OrderMethod>
          options={[
            { value: "pickup", label: "🛍 픽업" },
            { value: "delivery", label: "📦 배달·택배" },
          ]}
          value={f.method}
          onChange={(v) => set("method", v)}
        />
        <div>
          <p className="label">{f.method === "delivery" ? "받는 날 (도착 희망)" : "픽업 날짜"}</p>
          <DayChips value={f.due_date} today={today} onChange={(d) => set("due_date", d)} />
        </div>
        {f.method === "delivery" && (
          <div>
            <div className="flex items-center justify-between gap-2">
              <p className="label">출고일 (보내는 날, 선택)</p>
              {f.ship_date && (
                <button type="button" className="btn-ghost btn-sm" onClick={() => set("ship_date", null)}>
                  지우기
                </button>
              )}
            </div>
            <DayChips value={f.ship_date ?? ""} today={today} onChange={(d) => set("ship_date", d)} />
            {f.ship_date && f.ship_date > f.due_date && (
              <p className="mt-1 text-xs text-danger">출고일이 받는 날보다 늦어요. 날짜를 확인해 주세요.</p>
            )}
          </div>
        )}
        <div>
          <p className="label">{f.method === "delivery" ? "시간 (선택)" : "픽업 시간"}</p>
          <TimeChips value={f.due_time} onChange={(t) => set("due_time", t)} />
        </div>
        <Field label="주문한 분">
          {(id) => <input id={id} className="input" value={f.customer} onChange={(e) => set("customer", e.target.value)} placeholder="예: 김포포" />}
        </Field>
        <Field label="상품">
          {(id) => <input id={id} className="input" value={f.item} onChange={(e) => set("item", e.target.value)} placeholder="예: 하치와레 꽃다발" />}
        </Field>
        <Field label="가격">{(id) => <MoneyInput id={id} value={f.price} onChange={(n) => set("price", n)} />}</Field>
        <label
          className={`flex cursor-pointer items-center justify-between gap-3 rounded-2xl border-2 px-3 py-2.5 ${
            f.paid ? "border-matcha-300 bg-matcha-100 text-matcha-700" : "border-butter-300 bg-butter-100 text-butter-700"
          }`}
        >
          <span className="font-cute">
            💰 {f.paid ? "입금 확인했어요" : "입금 전"}
            {existing?.paid && existing.paid_at && <span className="ml-1.5 text-xs font-normal opacity-80">{paidTime(existing.paid_at)}</span>}
          </span>
          <input type="checkbox" className="h-6 w-6 accent-matcha-500" checked={Boolean(f.paid)} disabled={busy} onChange={(e) => void togglePaid(e.target.checked)} aria-label="입금 확인" />
        </label>
        <Field label="연락처 (선택)">
          {(id) => (
            <input
              id={id}
              className="input"
              type="tel"
              inputMode="tel"
              autoComplete="off"
              value={f.contact ?? ""}
              onChange={(e) => set("contact", e.target.value || null)}
              placeholder="예: 010-1234-5678"
            />
          )}
        </Field>
        {f.method === "delivery" && (
          <Field label="주소 (선택)">
            {(id) => <input id={id} className="input" value={f.address ?? ""} onChange={(e) => set("address", e.target.value || null)} />}
          </Field>
        )}
        {f.method === "delivery" && (
          <div>
            <p className="label">택배사 · 송장번호 (선택)</p>
            <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
              {CARRIER_NAMES.map((c) => (
                <button key={c} type="button" className="chip" data-on={f.carrier === c} onClick={() => set("carrier", f.carrier === c ? null : c)}>
                  {c}
                </button>
              ))}
            </div>
            <input
              className="input mt-1.5"
              inputMode="numeric"
              autoComplete="off"
              aria-label="송장번호"
              value={f.tracking_no ?? ""}
              onChange={(e) => set("tracking_no", e.target.value || null)}
              placeholder="송장번호 예: 12345678901"
            />
            {f.tracking_no && !normTracking(f.tracking_no) && <p className="mt-1 text-xs text-danger">송장번호는 숫자 8자리 이상이에요.</p>}
          </div>
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
          onClick={() => run(() => store().saveOrder(toInput(f, existing), existing?.id), existing ? "고쳤어요" : "주문을 넣었어요")}
        >
          저장
        </button>
        {existing && f.method === "delivery" && logen?.configured && (
          <div className="rounded-2xl bg-soda-100/60 p-3 text-sm">
            <p className="mb-2 flex items-center gap-1.5 font-cute">
              <Truck size={16} className="text-soda-700" /> 로젠 택배{logen.dryRun ? " (시험 모드)" : logen.env === "test" ? " (테스트 서버)" : ""}
            </p>
            {existing.logen_status === "slip_ready" ? (
              <p className="text-xs text-ink-soft">송장번호를 받았어요. 위 칸에 들어가 있어요.</p>
            ) : existing.logen_status === "registered" ? (
              <>
                <p className="mb-2 text-xs text-ink-soft">접수됐어요. 로젠 프로그램 ‘주문등록출력(복수건)’에서 송장을 출력하면 번호가 생겨요.</p>
                <button type="button" className="btn-soft btn-sm w-full" disabled={busy} onClick={() => runLogen(() => store().logenSlips([existing.id]))}>
                  송장번호 가져오기
                </button>
              </>
            ) : (
              <>
                {existing.logen_status === "failed" && <p className="mb-2 text-xs text-danger">지난 접수 실패: {existing.logen_msg ?? "이유를 모르겠어요"}</p>}
                {logenMissing({ ...existing, ...f }).length > 0 ? (
                  <p className="text-xs text-ink-soft">로젠에 접수하려면 {j(logenMissing({ ...existing, ...f }).join(" · "), "이")} 필요해요.</p>
                ) : (
                  <button
                    type="button"
                    className="btn-primary btn-sm w-full"
                    disabled={busy || !valid}
                    onClick={() =>
                      runLogen(async () => {
                        // 고친 내용(주소·연락처)을 먼저 저장하고 접수해요
                        await store().saveOrder(toInput(f, existing), existing.id);
                        return store().logenRegister([existing.id]);
                      })
                    }
                  >
                    {existing.logen_status === "failed" ? "로젠에 다시 접수" : "로젠에 접수"}
                  </button>
                )}
              </>
            )}
          </div>
        )}
        {existing && f.method === "delivery" && (
          <div className="grid grid-cols-2 gap-2">
            <button type="button" className="btn-soft btn-sm" onClick={() => copyNotice({ ...existing, ...f, tracking_no: normTracking(f.tracking_no) })}>
              <Copy size={16} /> 송장 안내문 복사
            </button>
            {normTracking(f.tracking_no) ? (
              <a className="btn-ghost btn-sm" href={trackingUrl(f.carrier ?? null, normTracking(f.tracking_no)!)} target="_blank" rel="noreferrer">
                <ExternalLink size={16} /> 배송 조회
              </a>
            ) : (
              <span className="self-center text-center text-xs text-ink-faint">송장번호를 넣으면 배송 조회</span>
            )}
          </div>
        )}
        {existing && (
          <div className="grid grid-cols-2 gap-2">
            {existing.status === "open" ? (
              <button type="button" className="btn-soft btn-sm" disabled={busy} onClick={() => run(() => store().saveOrder({ ...toInput(f, existing), status: "done" }, existing.id), "완료했어요")}>
                <Check size={16} /> 완료
              </button>
            ) : (
              <button type="button" className="btn-soft btn-sm" disabled={busy} onClick={() => run(() => store().saveOrder({ ...toInput(f, existing), status: "open" }, existing.id), "다시 진행 중이에요")}>
                <RotateCcw size={16} /> 다시 진행
              </button>
            )}
            {existing.status !== "canceled" ? (
              <button type="button" className="btn-ghost btn-sm text-danger" disabled={busy} onClick={() => run(() => store().saveOrder({ ...toInput(f, existing), status: "canceled" }, existing.id), "주문을 취소했어요")}>
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

/** 관리자: 로젠택배 API 연결 상태 · 확인 (궁중수라간 서버를 거쳐요) */
function LogenCard() {
  const toast = useToast();
  const { data: info, isLoading, error } = useLogenStatus(!IS_DEMO);
  const [busy, setBusy] = useState(false);
  const [check, setCheck] = useState<LogenCheck | null>(null);

  async function test() {
    setBusy(true);
    try {
      const r = await store().logenCheck();
      setCheck(r);
      toast(r.message, r.ok ? "wow" : "sad");
    } catch (e) {
      toast(e instanceof Error ? e.message : "확인하지 못했어요", "sad");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card p-4">
      <p className="mb-1 flex items-center gap-1.5 font-cute text-lg">
        <Truck size={18} className="text-soda-700" /> 로젠택배 연동
      </p>
      <p className="mb-3 text-xs text-ink-soft">
        택배 주문을 로젠에 바로 접수하고, 송장을 출력하면 송장번호를 받아 와요. 로젠은 정해진 IP에서만 받아서 궁중수라간 서버를 거쳐 보내요.
      </p>
      {IS_DEMO ? (
        <p className="text-sm text-ink-soft">체험 모드에서는 연결할 수 없어요.</p>
      ) : isLoading ? (
        <p className="text-sm text-ink-soft">확인하는 중...</p>
      ) : error || !info ? (
        <p className="text-sm text-danger">상태를 확인하지 못했어요.</p>
      ) : !info.configured ? (
        <div className="rounded-2xl bg-cream p-3 text-xs text-ink-soft">
          <p className="mb-1">아직 준비 중이에요. 로젠 계약 코드·키를 받으면 Vercel 환경변수에 넣고 Redeploy 해 주세요:</p>
          <p className="break-all font-mono text-[11px] text-ink">{info.missing.join(", ")}</p>
          <p className="mt-1">그때까지는 주문 고치기에서 택배사·송장번호를 직접 넣으면 돼요.</p>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-sm">
            ✅ 준비됨 · {info.dryRun ? "시험 모드(로젠에 안 보냄)" : info.env === "prod" ? "운영 서버" : "테스트 서버"}
            {info.relay ? " · 궁중수라간 서버 경유" : " · 직접 연결"}
          </p>
          <button type="button" className="btn-soft btn-sm w-full" onClick={test} disabled={busy}>
            연결 확인 (계약 운임 보기)
          </button>
          {check && (
            <div className="rounded-2xl bg-cream p-3 text-xs">
              <p className={check.ok ? "text-matcha-700" : "text-danger"}>{check.message}</p>
              {check.fares.map((f) => (
                <p key={f.box} className="flex justify-between text-ink-soft">
                  <span>{f.box || "박스"}</span>
                  <span>{won(f.fare)}</span>
                </p>
              ))}
            </div>
          )}
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
    const when = (o: Order) => `${actDay(o)} ${o.due_time ?? "99:99"}`;
    return filtered.sort((a, b) => (tab === "open" ? when(a).localeCompare(when(b)) : when(b).localeCompare(when(a))));
  }, [orders, tab]);

  const openOrders = orders.filter((o) => o.status === "open");
  const unpaidCount = openOrders.filter(unpaid).length;
  const { data: logen } = useLogenStatus(!IS_DEMO);
  const slipWaiting = orders.filter((o) => o.logen_status === "registered" && !o.tracking_no);
  const [logenBusy, setLogenBusy] = useState(false);

  async function fetchSlips() {
    setLogenBusy(true);
    try {
      const r = await store().logenSlips();
      await refresh("orders");
      const { msg, ok } = logenSummary(r);
      toast(msg, ok ? "wow" : "sad");
    } catch (e) {
      toast(e instanceof Error ? e.message : "송장번호를 가져오지 못했어요", "sad");
    } finally {
      setLogenBusy(false);
    }
  }
  const shipSoon = openOrders.filter((o) => o.method === "delivery" && daysUntil(actDay(o), today) <= 7).length;

  async function complete(o: Order) {
    try {
      const input: OrderInput = {
        customer: o.customer,
        item: o.item,
        price: o.price,
        due_date: o.due_date,
        due_time: o.due_time,
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
              진행 중 {num(openOrders.length)}건{unpaidCount ? ` · 입금 전 ${unpaidCount}건` : ""}{shipSoon ? ` · 7일 안에 보낼 택배 ${shipSoon}건` : ""}
            </p>
          </div>
          {logen?.configured && slipWaiting.length > 0 && (
            <button type="button" className="btn-soft btn-sm mb-3 w-full" onClick={fetchSlips} disabled={logenBusy}>
              <Truck size={16} /> 로젠 송장번호 가져오기 ({num(slipWaiting.length)}건)
            </button>
          )}
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
                // 택배는 출고일 기준 D-day (없으면 받는 날)
                const d = daysUntil(actDay(o), today);
                const urgent = o.status === "open" && (d < 0 || (o.method === "delivery" ? d <= 7 : d <= 1));
                return (
                  <li key={o.id} className={`flex items-center gap-2 py-2.5 ${o.status !== "open" ? "opacity-60" : ""}`}>
                    <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setEditing(o)}>
                      <span className="flex flex-wrap items-center gap-1.5 text-xs">
                        <span className="font-cute text-sm text-ink">
                          {md(o.due_date)}
                          {o.due_time ? ` ${timeLabel(o.due_time)}` : ""}
                        </span>
                        <MethodChip method={o.method} />
                        {o.method === "delivery" && o.ship_date && (
                          <span className="rounded-full bg-matcha-100 px-2 py-0.5 text-[11px] text-matcha-700">출고 {md(o.ship_date)}</span>
                        )}
                        {o.status === "open" ? (
                          <span className={`rounded-full px-2 py-0.5 text-[11px] ${urgent ? (d < 0 ? "bg-danger/10 text-danger" : "bg-butter-100 text-butter-700") : "bg-cream-deep text-ink-soft"}`}>
                            {dLabel(d)}
                          </span>
                        ) : (
                          <span className="rounded-full bg-cream-deep px-2 py-0.5 text-[11px] text-ink-soft">{o.status === "done" ? "완료" : "취소"}</span>
                        )}
                        {o.status !== "canceled" && o.paid === true ? (
                          <span className="rounded-full bg-matcha-100 px-2 py-0.5 text-[11px] text-matcha-700">💰 입금</span>
                        ) : o.status !== "canceled" && (o.paid === false || unpaid(o)) ? (
                          <span className="rounded-full bg-butter-100 px-2 py-0.5 text-[11px] text-butter-700">입금 전</span>
                        ) : null}
                      </span>
                      <span className={`mt-0.5 block truncate text-sm font-medium ${o.status === "canceled" ? "line-through" : ""}`}>
                        {o.customer} · {o.item}
                      </span>
                      <span className="block truncate text-xs text-ink-soft">
                        {won(o.price)}
                        {o.contact ? ` · ${o.contact}` : ""}
                        {o.memo ? ` · ${o.memo}` : ""}
                      </span>
                      {(o.tracking_no || o.logen_status) && (
                        <span className={`block truncate text-xs ${o.logen_status === "failed" ? "text-danger" : "text-soda-700"}`}>
                          📮{" "}
                          {o.tracking_no
                            ? `${o.carrier ? `${o.carrier} ` : ""}${o.tracking_no}`
                            : o.logen_status === "registered"
                              ? "로젠 접수됨 · 송장 출력 기다리는 중"
                              : "로젠 접수 실패 — 눌러서 다시 해 보세요"}
                        </span>
                      )}
                    </button>
                    {telOf(o.contact) && (
                      <a href={`tel:${telOf(o.contact)}`} className="btn-ghost btn-sm shrink-0 px-2.5" aria-label={`${o.customer || "손님"}에게 전화`}>
                        <Phone size={16} />
                      </a>
                    )}
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

        <details className="card p-4">
          <summary className="cursor-pointer font-cute text-lg">📋 주문 가격표</summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {PRICE_LIST.map((s) => (
              <div key={s.key} className="rounded-2xl bg-cream p-3">
                <p className="font-cute">
                  {s.emoji} {s.title}
                  {s.sub && <span className="ml-1 text-xs text-ink-soft">{s.sub}</span>}
                </p>
                <ul className="mt-1 space-y-0.5 text-sm">
                  {s.items.map((it) => (
                    <li key={it.name} className="flex justify-between gap-2">
                      <span className="text-ink-soft">{itemLabel(it)}</span>
                      <span className="text-right font-medium">{it.price}</span>
                    </li>
                  ))}
                </ul>
                {s.notes.map((n) => (
                  <p key={n} className="mt-1 text-xs text-ink-faint">
                    {n}
                  </p>
                ))}
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-ink-soft">{PRICE_FOOTER}</p>
        </details>

        {user?.role === "admin" && <KakaoCard />}
        {user?.role === "admin" && <LogenCard />}
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
