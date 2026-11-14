import type { PostgrestError } from "@supabase/supabase-js";
import { normTime } from "../../day";
import type { Order, Product, ProductSource, Role, Supplier } from "../../types";
import { adminClient } from "../admin";
import { fetchBixolonDay, PosNotReady } from "../bixolon";
import type { BotDb, BotSession, BotUser, TodaySales } from "./types";

/** 챗봇 서버용 데이터 — 서비스 키로 읽고 쓰지만, 권한은 bot.ts가 연결된 앱 계정의 역할로 확인해요. */

function dbFail(error: PostgrestError | null, what: string): never {
  if (error?.code === "PGRST205" || error?.code === "42P01") {
    throw new Error("DB에 챗봇 표가 아직 없어요. 앱 설정 화면에서 DB 업데이트(스키마 v6)를 먼저 해 주세요.");
  }
  throw new Error(`${what}: ${error?.message ?? "알 수 없는 오류"}`);
}

const PRODUCT_COLS =
  "id, name, category, barcode, kiosk_code, supplier_id, purchase_url, supplier_sku, cost_price, sale_price, stock_qty, safety_stock, is_active, tags";

/** 한국 날짜 하루의 시작·끝 (UTC ISO) */
function kstRange(day: string) {
  const start = new Date(`${day}T00:00:00+09:00`);
  return { from: start.toISOString(), to: new Date(start.getTime() + 86400000).toISOString() };
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([p, new Promise<T>((_, reject) => setTimeout(() => reject(new Error("timeout")), ms))]);
}

export function supabaseBotDb(): BotDb {
  const sb = adminClient();

  async function userOf(key: string, profileId: string): Promise<BotUser | null> {
    const { data } = await sb.from("profiles").select("id, display_name, username, role").eq("id", profileId).maybeSingle();
    if (!data) return null;
    return { key, profileId, name: (data.display_name as string) || (data.username as string), role: data.role as Role };
  }

  return {
    async findUser(key) {
      const { data, error } = await sb.from("kakao_bot_users").select("profile_id").eq("bot_user_key", key).maybeSingle();
      if (error) dbFail(error, "연결 확인");
      if (!data) return null;
      await sb.from("kakao_bot_users").update({ last_seen_at: new Date().toISOString() }).eq("bot_user_key", key);
      return userOf(key, data.profile_id as string);
    },

    async useCode(code, key) {
      const { data, error } = await sb
        .from("kakao_bot_codes")
        .select("profile_id")
        .eq("code", code)
        .gt("expires_at", new Date().toISOString())
        .maybeSingle();
      if (error) dbFail(error, "연결 코드 확인");
      if (!data) return null;
      await sb.from("kakao_bot_codes").delete().eq("code", code);
      const { error: e2 } = await sb
        .from("kakao_bot_users")
        .upsert({ bot_user_key: key, profile_id: data.profile_id, linked_at: new Date().toISOString(), last_seen_at: new Date().toISOString() });
      if (e2) dbFail(e2, "연결 저장");
      return userOf(key, data.profile_id as string);
    },

    async unlink(key) {
      await sb.from("kakao_bot_users").delete().eq("bot_user_key", key);
      await sb.from("kakao_bot_sessions").delete().eq("bot_user_key", key);
    },

    async getSession(key) {
      const { data } = await sb.from("kakao_bot_sessions").select("state").eq("bot_user_key", key).maybeSingle();
      const state = data?.state as BotSession | undefined;
      return state && state.flow ? state : null;
    },

    async setSession(key, session) {
      if (!session) {
        await sb.from("kakao_bot_sessions").delete().eq("bot_user_key", key);
        return;
      }
      const { error } = await sb
        .from("kakao_bot_sessions")
        .upsert({ bot_user_key: key, state: session, updated_at: new Date().toISOString() });
      if (error) dbFail(error, "대화 저장");
    },

    async listSuppliers() {
      const { data, error } = await sb.from("suppliers").select("*").order("name");
      if (error) dbFail(error, "거래처 불러오기");
      return data as Supplier[];
    },

    async saveSupplier(input, id) {
      const q = id ? sb.from("suppliers").update(input).eq("id", id) : sb.from("suppliers").insert(input);
      const { data, error } = await q.select("*").single();
      if (error) dbFail(error, "거래처 저장");
      return data as Supplier;
    },

    async deleteSupplier(id) {
      const { error } = await sb.from("suppliers").delete().eq("id", id);
      if (error) dbFail(error, "거래처 삭제");
    },

    async listProducts() {
      const { data, error } = await sb.from("products").select(PRODUCT_COLS).limit(10000);
      if (error) dbFail(error, "상품 불러오기");
      return (data ?? []).map((p) => ({ ...p, tags: p.tags ?? [] }) as unknown as Product);
    },

    async listSources() {
      const { data, error } = await sb.from("product_sources").select("*").limit(20000);
      if (error) dbFail(error, "거래처별 가격 불러오기");
      return data as ProductSource[];
    },

    async recordPrice(input, byName) {
      const { error } = await sb.rpc("record_price", {
        p_product_id: input.product_id,
        p_supplier_id: input.supplier_id,
        p_price: Math.round(input.price),
        p_purchase_url: input.purchase_url ?? null,
        p_supplier_sku: input.supplier_sku ?? null,
        p_memo: input.memo ?? null,
        p_source: "chatbot",
        p_set_cost: input.set_cost ?? false,
        p_by_name: `${byName} (카톡)`,
      });
      if (error) dbFail(error, "가격 기록");
    },

    async todaySales(day): Promise<TodaySales> {
      // 1) 빅솔론에서 바로 (카카오는 5초 안에 답해야 해서 2.5초까지만 기다려요)
      let notReady = false;
      try {
        const lines = await withTimeout(fetchBixolonDay(day), 2500);
        return {
          day,
          source: "live",
          amount: lines.reduce((n, l) => n + l.amount, 0),
          qty: lines.reduce((n, l) => n + l.qty, 0),
          items: lines.map((l) => ({ name: l.product_name, qty: l.qty, amount: l.amount })),
        };
      } catch (e) {
        // 빅솔론 키가 없거나 늦거나 오류면 → 아래 저장된 매출로 대신 보여줘요
        notReady = e instanceof PosNotReady;
      }
      // 2) 마지막으로 가져온 매출 (pos_sales)
      const { from, to } = kstRange(day);
      const { data, error } = await sb.from("pos_sales").select("product_name, qty, amount").gte("sold_at", from).lt("sold_at", to).limit(5000);
      if (error || !data || (notReady && !data.length)) {
        return { day, source: "none", amount: 0, qty: 0, items: [], note: "빅솔론 매출이 아직 연결되지 않았어요. 앱 → 더보기 → 매출에서 연결해 주세요." };
      }
      const byName = new Map<string, { name: string; qty: number; amount: number }>();
      for (const r of data) {
        const it = byName.get(r.product_name) ?? { name: r.product_name, qty: 0, amount: 0 };
        it.qty += r.qty;
        it.amount += r.amount;
        byName.set(r.product_name, it);
      }
      const items = [...byName.values()];
      return {
        day,
        source: "db",
        amount: items.reduce((n, i) => n + i.amount, 0),
        qty: items.reduce((n, i) => n + i.qty, 0),
        items,
        note: "빅솔론에서 바로 못 받아서, 앱에 마지막으로 가져온 매출 기준이에요.",
      };
    },

    async listOrders() {
      const { data, error } = await sb.from("orders").select("*").eq("status", "open").order("due_date").limit(200);
      if (error) dbFail(error, "주문 불러오기");
      return (data as Order[]).map((o) => ({ ...o, due_time: normTime(o.due_time), ship_date: o.ship_date ?? null }));
    },
  };
}
