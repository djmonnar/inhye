import type { PostgrestError } from "@supabase/supabase-js";
import { IMAGE_BUCKET, SUPABASE_URL } from "../config";
import { shiftDay, tidyOrder } from "../day";
import { cleanBarcodeInput, nextStoreBarcodes, STORE_CODE_LENGTHS, storeCodeLike } from "../format";
import { blobToDataUrl } from "../image";
import { loginEmail, setRemember, supabase } from "../supabase";
import type {
  BarcodeIssue,
  AiProductDraft,
  AiReport,
  AppUser,
  BulkProductRow,
  Member,
  KakaoBotStatus,
  KakaoStatus,
  LogenCheck,
  LogenInfo,
  LogenRun,
  Order,
  OrderChatResult,
  OrderInput,
  PosLive,
  PosSettle,
  PosReceiptsDay,
  PosSale,
  PosStatus,
  PosSyncResult,
  PosSyncRun,
  PriceLog,
  PrintJob,
  PrintStation,
  Product,
  ProductInput,
  ProductSource,
  PromoDraft,
  Supplier,
  SupplierInput,
} from "../types";
import { StoreError, type DataStore } from "./types";

function fail(error: PostgrestError | { message: string; code?: string } | null): never {
  const code = error && "code" in error ? error.code : undefined;
  const msg = error?.message ?? "";
  if (code === "23505" && msg.includes("barcode")) throw new StoreError("이미 등록된 바코드예요.");
  if (code === "42501" || msg.includes("row-level security"))
    throw new StoreError("권한이 없어요. 관리자에게 문의해 주세요.");
  if (code === "PGRST205" || code === "42P01")
    throw new StoreError("DB 테이블이 아직 없어요. 설정 화면에서 SQL을 실행해 주세요.");
  if (code === "PGRST204" || code === "42703")
    throw new StoreError("DB 업데이트가 필요해요. 설정 화면(/setup)에서 ‘앱에서 바로 실행’을 눌러 주세요.");
  throw new StoreError(msg || "알 수 없는 오류가 발생했어요.");
}

async function api<T>(path: string, method: string, body?: unknown): Promise<T> {
  const { data } = await supabase().auth.getSession();
  const res = await fetch(path, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${data.session?.access_token ?? ""}`,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as { error?: string } & T;
  if (!res.ok) throw new StoreError(json.error || "요청에 실패했어요.");
  return json;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export function createSupabaseStore(): DataStore {
  const sb = supabase();

  async function profileFor(userId: string, email: string | undefined): Promise<AppUser> {
    const { data } = await sb
      .from("profiles")
      .select("id, username, display_name, role")
      .eq("id", userId)
      .maybeSingle();
    if (data) return data as AppUser;
    const username = (email ?? "").split("@")[0];
    return { id: userId, username, display_name: username, role: "pending" };
  }

  return {
    mode: "supabase",

    async getUser() {
      const { data } = await sb.auth.getSession();
      const user = data.session?.user;
      return user ? profileFor(user.id, user.email) : null;
    },

    async signIn(id, password, remember) {
      setRemember(remember);
      const { data, error } = await sb.auth.signInWithPassword({ email: loginEmail(id), password });
      if (error) {
        const msg = (error.message ?? "").trim();
        if (error.status === 400 || /invalid/i.test(msg))
          throw new StoreError("아이디 또는 비밀번호가 맞지 않아요.");
        if (!error.status || error.name === "AuthRetryableFetchError" || /fetch|network/i.test(msg) || msg.length < 3)
          throw new StoreError("서버에 연결하지 못했어요. 인터넷 연결이나 Supabase 설정을 확인해 주세요.");
        throw new StoreError(msg);
      }
      return profileFor(data.user.id, data.user.email);
    },

    async signOut() {
      await sb.auth.signOut();
    },

    onAuthChange(cb) {
      const { data } = sb.auth.onAuthStateChange((event) => {
        if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") cb();
      });
      return () => data.subscription.unsubscribe();
    },

    async listProducts() {
      const { data, error } = await sb
        .from("products")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(10000);
      if (error) fail(error);
      return data as Product[];
    },

    async saveProduct(input: ProductInput, id?: string) {
      const q = id
        ? sb.from("products").update(input).eq("id", id)
        : sb.from("products").insert(input);
      const { data, error } = await q.select("*").single();
      if (error) fail(error);
      return data as Product;
    },

    async deleteProduct(id) {
      const { data: row } = await sb.from("products").select("image_path").eq("id", id).maybeSingle();
      const { error } = await sb.from("products").delete().eq("id", id);
      if (error) fail(error);
      if (row?.image_path) await sb.storage.from(IMAGE_BUCKET).remove([row.image_path]);
    },

    async bulkSaveProducts(rows: BulkProductRow[]) {
      const creates = rows.filter((r) => !r.id);
      const updates = rows.filter((r) => r.id);
      for (const part of chunk(creates, 200)) {
        const { error } = await sb.from("products").insert(part, { defaultToNull: false });
        if (error) fail(error);
      }
      // Upsert needs every row in a request to carry the same columns.
      const groups = new Map<string, BulkProductRow[]>();
      for (const r of updates) {
        const key = Object.keys(r).sort().join(",");
        groups.set(key, [...(groups.get(key) ?? []), r]);
      }
      for (const group of groups.values()) {
        for (const part of chunk(group, 200)) {
          const { error } = await sb
            .from("products")
            .upsert(part, { onConflict: "id", defaultToNull: false });
          if (error) fail(error);
        }
      }
      return { created: creates.length, updated: updates.length };
    },

    async markKioskSynced(ids) {
      const now = new Date().toISOString();
      for (const part of chunk(ids, 300)) {
        const { error } = await sb.from("products").update({ kiosk_synced_at: now }).in("id", part);
        if (error) fail(error);
      }
    },

    async listSuppliers() {
      const { data, error } = await sb.from("suppliers").select("*").order("name");
      if (error) fail(error);
      return data as Supplier[];
    },

    async saveSupplier(input: SupplierInput, id?: string) {
      const q = id
        ? sb.from("suppliers").update(input).eq("id", id)
        : sb.from("suppliers").insert(input);
      const { data, error } = await q.select("*").single();
      if (error) fail(error);
      return data as Supplier;
    },

    async deleteSupplier(id) {
      const { error } = await sb.from("suppliers").delete().eq("id", id);
      if (error) fail(error);
    },

    async listSources() {
      const { data, error } = await sb.from("product_sources").select("*").limit(20000);
      if (error) fail(error);
      return data as ProductSource[];
    },

    async listPriceLogs(filter, limit = 50) {
      let q = sb.from("price_logs").select("*").order("noted_at", { ascending: false }).limit(limit);
      if (filter.productId) q = q.eq("product_id", filter.productId);
      if (filter.supplierId) q = q.eq("supplier_id", filter.supplierId);
      const { data, error } = await q;
      if (error) fail(error);
      return data as PriceLog[];
    },

    async recordPrice(input) {
      const { error } = await sb.rpc("record_price", {
        p_product_id: input.product_id,
        p_supplier_id: input.supplier_id,
        p_price: Math.round(input.price),
        p_purchase_url: input.purchase_url ?? null,
        p_supplier_sku: input.supplier_sku ?? null,
        p_memo: input.memo ?? null,
        p_source: "manual",
        p_set_cost: input.set_cost ?? false,
      });
      if (error) fail(error);
    },

    async updateSource(id, patch) {
      const { error } = await sb.from("product_sources").update(patch).eq("id", id);
      if (error) fail(error);
    },

    async deleteSource(id) {
      const { error } = await sb.from("product_sources").delete().eq("id", id);
      if (error) fail(error);
    },

    async setMainSource(src) {
      const patch: Partial<Product> = { supplier_id: src.supplier_id };
      if (src.purchase_url) patch.purchase_url = src.purchase_url;
      if (src.supplier_sku) patch.supplier_sku = src.supplier_sku;
      if (src.price != null) patch.cost_price = src.price;
      const { error } = await sb.from("products").update(patch).eq("id", src.product_id);
      if (error) fail(error);
    },

    async listMoves(productId, limit = 100) {
      let q = sb.from("stock_moves").select("*").order("created_at", { ascending: false }).limit(limit);
      if (productId) q = q.eq("product_id", productId);
      const { data, error } = await q;
      if (error) fail(error);
      return data;
    },

    async addMove(m) {
      const { data, error } = await sb.rpc("adjust_stock", {
        p_product_id: m.product_id,
        p_kind: m.kind,
        p_qty: m.qty,
        p_unit_cost: m.unit_cost ?? null,
        p_supplier_id: m.supplier_id ?? null,
        p_memo: m.memo ?? null,
        p_update_cost: m.update_cost ?? false,
      });
      if (error) fail(error);
      return data as number;
    },

    async uploadImage(file) {
      const ext = file.type === "image/png" ? "png" : file.type === "image/jpeg" ? "jpg" : "webp";
      const path = `${new Date().toISOString().slice(0, 7)}/${crypto.randomUUID()}.${ext}`;
      const { error } = await sb.storage
        .from(IMAGE_BUCKET)
        .upload(path, file, { contentType: file.type || "image/webp", cacheControl: "31536000" });
      if (error) fail(error);
      return path;
    },

    async removeImage(path) {
      if (path.startsWith("data:") || path.startsWith("http")) return;
      await sb.storage.from(IMAGE_BUCKET).remove([path]);
    },

    imageUrl(path) {
      if (!path) return null;
      if (path.startsWith("data:") || path.startsWith("http")) return path;
      return `${SUPABASE_URL}/storage/v1/object/public/${IMAGE_BUCKET}/${path}`;
    },

    async describeProduct(image, context) {
      const { draft } = await api<{ draft: AiProductDraft }>("/api/ai/product", "POST", {
        image: await blobToDataUrl(image),
        categories: context.categories,
        hint: context.hint ?? "",
      });
      return draft;
    },

    async readProductLink(url, context) {
      const { draft } = await api<{ draft: AiProductDraft }>("/api/ai/link", "POST", {
        url,
        categories: context.categories,
      });
      return draft;
    },

    async writePromo(input, image) {
      const { promo } = await api<{ promo: PromoDraft }>("/api/ai/promo", "POST", {
        ...input,
        image: image ? await blobToDataUrl(image) : null,
      });
      return promo;
    },

    async writeReport(facts) {
      const { report } = await api<{ report: AiReport }>("/api/ai/report", "POST", { facts });
      return report;
    },

    async listMembers() {
      const { data, error } = await sb
        .from("profiles")
        .select("id, username, display_name, role, created_at")
        .order("created_at");
      if (error) fail(error);
      return data as Member[];
    },

    async createMember(input) {
      await api("/api/members", "POST", input);
    },

    async updateMember(id, patch) {
      if (patch.password) {
        await api("/api/members", "PATCH", { id, password: patch.password });
      }
      const fields: Record<string, string> = {};
      if (patch.role) fields.role = patch.role;
      if (patch.display_name !== undefined) fields.display_name = patch.display_name;
      if (Object.keys(fields).length) {
        const { error } = await sb.from("profiles").update(fields).eq("id", id);
        if (error) fail(error);
      }
    },

    async deleteMember(id) {
      await api("/api/members", "DELETE", { id });
    },

    async listPrintJobs(which) {
      let q = sb.from("print_jobs").select("*");
      q =
        which === "pending"
          ? q.in("status", ["pending", "printing"]).order("created_at", { ascending: true })
          : q.in("status", ["done", "failed"]).order("printed_at", { ascending: false }).limit(30);
      const { data, error } = await q;
      if (error) fail(error);
      return data as PrintJob[];
    },

    async listBarcodeIssues() {
      const { data, error } = await sb.from("barcode_issues").select("*").order("created_at", { ascending: false }).limit(300);
      if (error) {
        // v10 전 DB(표 없음)면 빈 목록 — 상품 바코드 만들기는 그대로 돼요
        if (error.code === "PGRST205" || error.code === "42P01") return [];
        fail(error);
      }
      return data as BarcodeIssue[];
    },

    async issueBarcodes(input) {
      const name = input.name?.trim() || null;
      const price = input.price ?? null;
      const memo = input.memo?.trim() || null;
      // 직접 정한 번호 하나
      if (input.code != null && input.code.trim() !== "") {
        const code = cleanBarcodeInput(input.code);
        if (!code) throw new StoreError("번호는 숫자·영문으로 3~30자예요.");
        const same = await sb.from("products").select("name").eq("barcode", code).limit(1);
        if (same.error) fail(same.error);
        if (same.data?.length) throw new StoreError(`이미 ‘${(same.data[0] as { name: string }).name}’ 상품 바코드예요. 다른 번호로 해 주세요.`);
        const { data, error } = await sb.from("barcode_issues").insert({ code, name, price, memo }).select("*").single();
        if (error) {
          if (error.code === "23505") throw new StoreError("이미 만든 번호예요. 아래 ‘최근 만든 바코드’에서 다시 뽑을 수 있어요.");
          fail(error);
        }
        return [data as BarcodeIssue];
      }
      // 다음 매장용 번호부터 n개 — 누르는 순간 가장 큰 번호를 다시 봐요. 두 기기가 동시에 누르면(23505) 다시 계산
      const n = Math.max(1, Math.min(50, Math.round(input.count ?? 1)));
      const len = (STORE_CODE_LENGTHS as readonly number[]).includes(input.length ?? 13) ? (input.length ?? 13) : 13;
      const like = storeCodeLike(len);
      for (let attempt = 0; attempt < 4; attempt++) {
        // 같은 자릿수·모양의 큰 번호 몇 개 (영문 섞인 직접 번호가 맨 위에 올 수 있어서 넉넉히 보고 숫자만 셈)
        const [prod, iss] = await Promise.all([
          sb.from("products").select("barcode").like("barcode", like).order("barcode", { ascending: false }).limit(30),
          sb.from("barcode_issues").select("code").like("code", like).order("code", { ascending: false }).limit(30),
        ]);
        if (prod.error) fail(prod.error);
        if (iss.error) fail(iss.error);
        let codes: string[];
        try {
          codes = nextStoreBarcodes(
            (prod.data ?? []) as { barcode: string | null }[],
            ((iss.data ?? []) as { code: string }[]).map((r) => r.code),
            n,
            len,
          );
        } catch (e) {
          throw new StoreError(e instanceof Error ? e.message : "번호를 만들지 못했어요.");
        }
        const { data, error } = await sb
          .from("barcode_issues")
          .insert(codes.map((code) => ({ code, name, price, memo })))
          .select("*");
        if (!error) return ((data ?? []) as BarcodeIssue[]).sort((a, b) => a.code.localeCompare(b.code));
        if (error.code !== "23505") fail(error);
      }
      throw new StoreError("바코드를 만들지 못했어요. 한 번 더 눌러 주세요.");
    },

    async addPrintJobs(items, requestedBy, stationId) {
      if (!items.length) return;
      const rows = items.map((i) => ({
        copies: i.copies,
        style: i.style,
        requested_by_name: requestedBy,
        ...(i.product_id ? { product_id: i.product_id } : {}),
        // 상품 없이 만든 바코드일 때만 그 칸을 보내요 (v12 전 DB에서도 상품 라벨은 보내지게)
        ...(i.issue_id ? { issue_id: i.issue_id } : {}),
        // 노트북을 골랐을 때만 그 칸을 보내요 (v11 전 DB에서도 보내지게)
        ...(stationId ? { station_id: stationId } : {}),
      }));
      const { error } = await sb.from("print_jobs").insert(rows);
      if (error) {
        if (items.some((i) => i.issue_id) && (error.code === "PGRST204" || error.code === "42703" || error.code === "23502")) {
          throw new StoreError("상품 없이 만든 바코드를 노트북으로 보내려면 DB 업데이트가 필요해요. 설정 화면(/setup)에서 ‘앱에서 바로 실행’을 눌러 주세요.");
        }
        fail(error);
      }
    },

    async claimPrintJobs(stationId) {
      if (stationId) {
        const r = await sb.rpc("claim_print_jobs", { p_limit: 50, p_station: stationId });
        if (!r.error) return (r.data ?? []) as PrintJob[];
        // v11 전 DB(함수에 p_station 없음)면 예전처럼
        if (r.error.code !== "PGRST202") fail(r.error);
      }
      const { data, error } = await sb.rpc("claim_print_jobs", { p_limit: 50 });
      if (error) fail(error);
      return (data ?? []) as PrintJob[];
    },

    watchPrintJobs(onChange, onStatus) {
      const ch = sb
        .channel(`print-jobs-${Math.random().toString(36).slice(2, 10)}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "print_jobs" }, () => onChange())
        .subscribe((status) => onStatus?.(status === "SUBSCRIBED"));
      return () => {
        void sb.removeChannel(ch);
      };
    },

    async listPrintStations() {
      const { data, error } = await sb.from("print_stations").select("*").order("created_at");
      if (error) {
        if (error.code === "PGRST205" || error.code === "42P01") return [];
        fail(error);
      }
      return data as PrintStation[];
    },

    async registerPrintStation(name) {
      const { data, error } = await sb
        .from("print_stations")
        .insert({ name: name.trim().slice(0, 30) || "매장 노트북", last_seen_at: new Date().toISOString() })
        .select("*")
        .single();
      if (error) fail(error);
      return data as PrintStation;
    },

    async updatePrintStation(id, patch) {
      const row = {
        ...(patch.name !== undefined ? { name: patch.name.trim().slice(0, 30) || "매장 노트북" } : {}),
        ...(patch.seen ? { last_seen_at: new Date().toISOString() } : {}),
      };
      if (!Object.keys(row).length) return;
      const { error } = await sb.from("print_stations").update(row).eq("id", id);
      if (error) fail(error);
    },

    async removePrintStation(id) {
      const { error } = await sb.from("print_stations").delete().eq("id", id);
      if (error) fail(error);
    },

    async finishPrintJobs(ids, ok, errorText) {
      if (!ids.length) return;
      const { error } = await sb
        .from("print_jobs")
        .update({ status: ok ? "done" : "failed", printed_at: new Date().toISOString(), error: ok ? null : errorText ?? null })
        .in("id", ids);
      if (error) fail(error);
    },

    async deletePrintJob(id) {
      const { error } = await sb.from("print_jobs").delete().eq("id", id);
      if (error) fail(error);
    },

    async listPosSales(sinceISO) {
      const { data, error } = await sb
        .from("pos_sales")
        .select("id, source, external_id, sold_at, product_code, barcode, product_name, qty, amount, payment, product_id, stock_applied_at, created_at")
        .gte("sold_at", sinceISO)
        .order("sold_at", { ascending: false })
        .limit(5000);
      if (error) fail(error);
      return data as PosSale[];
    },

    async listPosSyncRuns(limit = 10) {
      const { data, error } = await sb
        .from("pos_sync_runs")
        .select("id, source, started_at, finished_at, ok, fetched, inserted, applied, unmatched, error")
        .order("started_at", { ascending: false })
        .limit(limit);
      if (error) fail(error);
      return data as PosSyncRun[];
    },

    async posStatus() {
      return api<PosStatus>("/api/pos/status", "GET");
    },

    async posSync(from) {
      return api<PosSyncResult>("/api/pos/sync", "POST", from ? { from } : {});
    },

    async posLive(day) {
      return api<PosLive>(`/api/pos/live?day=${encodeURIComponent(day)}`, "GET");
    },

    async posSettle(start, end) {
      return api<PosSettle>(`/api/pos/settle?${new URLSearchParams({ start, end }).toString()}`, "GET");
    },

    async posReceipts(day) {
      return api<PosReceiptsDay>(`/api/pos/receipts?day=${encodeURIComponent(day)}`, "GET");
    },

    async listOrders() {
      // 날짜만 (YYYY-MM-DD) — 필터 값에 특수문자가 없게
      const since = new Date(Date.now() - 60 * 86400000).toISOString().slice(0, 10);
      const { data, error } = await sb
        .from("orders")
        .select("*")
        .or(`status.eq.open,updated_at.gte.${since}`)
        .order("due_date")
        .limit(500);
      if (error) fail(error);
      return (data as Order[]).map(tidyOrder);
    },

    async settleOrders(start, end) {
      // 택배는 출고일(받는 날보다 앞)로 세니, 받는 날은 끝날 뒤 60일까지 받아 와서 거르기
      const { data, error } = await sb
        .from("orders")
        .select("*")
        .neq("status", "canceled")
        .gte("due_date", start)
        .lte("due_date", shiftDay(end, 60))
        .order("due_date")
        .limit(3000);
      if (error) fail(error);
      return (data as Order[]).map(tidyOrder);
    },

    async saveOrder(input: OrderInput, id?: string) {
      const row = {
        ...input,
        ...(input.status ? { done_at: input.status === "done" ? new Date().toISOString() : null } : {}),
        ...(input.paid !== undefined ? { paid_at: input.paid ? new Date().toISOString() : null } : {}),
      };
      const q = id ? sb.from("orders").update(row).eq("id", id) : sb.from("orders").insert(row);
      const { data, error } = await q.select("*").single();
      if (error) fail(error);
      const o = data as Order;
      return tidyOrder(o);
    },

    async deleteOrder(id) {
      const { error } = await sb.from("orders").delete().eq("id", id);
      if (error) fail(error);
    },

    async orderChat(message, history) {
      return api<OrderChatResult>("/api/orders/chat", "POST", { message, history });
    },

    async logenStatus() {
      return api<LogenInfo>("/api/logen/status", "GET");
    },

    async logenRegister(ids) {
      return api<LogenRun>("/api/logen/register", "POST", { ids });
    },

    async logenSlips(ids) {
      return api<LogenRun>("/api/logen/slips", "POST", { ids: ids ?? null });
    },

    async logenCheck() {
      return api<LogenCheck>("/api/logen/check", "POST", {});
    },

    async kakaoStatus() {
      return api<KakaoStatus>("/api/kakao/status", "GET");
    },

    async kakaoConnectUrl() {
      const r = await api<{ url: string }>("/api/kakao/connect", "POST", {});
      return r.url;
    },

    async kakaoTest() {
      return api<{ sent: boolean; text: string }>("/api/kakao/test", "POST", {});
    },

    async kakaoSetHour(hour) {
      await api<{ ok: boolean }>("/api/kakao/hour", "POST", { hour });
    },

    async kakaoBotStatus() {
      return api<KakaoBotStatus>("/api/kakao/bot", "GET");
    },

    async kakaoBotCode() {
      return api<{ code: string; expires_at: string }>("/api/kakao/bot", "POST", {});
    },

    async kakaoBotUnlink(key) {
      await api<{ ok: boolean }>("/api/kakao/bot", "DELETE", { key });
    },
  };
}
