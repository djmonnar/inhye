import type { PostgrestError } from "@supabase/supabase-js";
import { IMAGE_BUCKET, SUPABASE_URL } from "../config";
import { loginEmail, setRemember, supabase } from "../supabase";
import type {
  AppUser,
  BulkProductRow,
  Member,
  PrintJob,
  Product,
  ProductInput,
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

    async addPrintJobs(items, requestedBy) {
      if (!items.length) return;
      const { error } = await sb
        .from("print_jobs")
        .insert(items.map((i) => ({ ...i, requested_by_name: requestedBy })));
      if (error) fail(error);
    },

    async claimPrintJobs() {
      const { data, error } = await sb.rpc("claim_print_jobs", { p_limit: 50 });
      if (error) fail(error);
      return (data ?? []) as PrintJob[];
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
  };
}
