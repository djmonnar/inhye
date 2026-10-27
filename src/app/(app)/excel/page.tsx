"use client";

import { Download, FileSpreadsheet, FileUp, Send, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";
import { useToast } from "@/components/providers";
import { ConfirmSheet, PageHeader, Segmented, Toggle } from "@/components/ui";
import {
  buildBackupWorkbook,
  buildKioskWorkbook,
  download,
  parseProductSheet,
  planImport,
  stamp,
  type ImportOptions,
  type ParsedSheet,
  type UnitPriceMode,
} from "@/lib/excel";
import { needsKioskSync } from "@/lib/format";
import { useProducts, useRefresh, useSuppliers } from "@/lib/queries";
import { store } from "@/lib/store";
import { emptySupplier } from "@/components/SupplierSheet";

type Scope = "dirty" | "all" | "active";

export default function ExcelPage() {
  const toast = useToast();
  const refresh = useRefresh();
  const { data: products = [] } = useProducts();
  const { data: suppliers = [] } = useSuppliers();

  const [scope, setScope] = useState<Scope>("dirty");
  const [unitPrice, setUnitPrice] = useState<UnitPriceMode>("cost");
  const [exportedIds, setExportedIds] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);

  const [file, setFile] = useState<File | null>(null);
  const [sheet, setSheet] = useState<ParsedSheet | null>(null);
  const [parseError, setParseError] = useState("");
  const [opts, setOpts] = useState<ImportOptions>({ updateExisting: true, importCost: true, importStock: false });
  const [importing, setImporting] = useState(false);

  const dirty = useMemo(() => products.filter(needsKioskSync), [products]);
  const targets = scope === "dirty" ? dirty : scope === "active" ? products.filter((p) => p.is_active) : products;
  const plan = useMemo(() => (sheet ? planImport(sheet, products, opts) : []), [sheet, products, opts]);
  const counts = useMemo(
    () => ({
      new: plan.filter((r) => r.status === "new").length,
      update: plan.filter((r) => r.status === "update").length,
      error: plan.filter((r) => r.status === "error").length,
    }),
    [plan],
  );

  async function makeKioskFile() {
    const sorted = [...targets].sort((a, b) => a.category.localeCompare(b.category, "ko") || a.name.localeCompare(b.name, "ko"));
    const blob = await buildKioskWorkbook(sorted, unitPrice);
    return { blob, ids: sorted.map((p) => p.id), name: `빅솔론_상품대량등록_${stamp()}.xlsx` };
  }

  async function exportKiosk(share: boolean) {
    if (!targets.length) {
      toast("내보낼 상품이 없어요", "sleep");
      return;
    }
    setBusy(true);
    try {
      const { blob, ids, name } = await makeKioskFile();
      const f = new File([blob], name, { type: blob.type });
      if (share && navigator.canShare?.({ files: [f] })) {
        try {
          await navigator.share({ files: [f], title: name });
        } catch {
          setBusy(false);
          return;
        }
      } else {
        download(blob, name);
      }
      setExportedIds(ids);
    } catch (e) {
      toast(e instanceof Error ? e.message : "엑셀을 만들지 못했어요", "sad");
    } finally {
      setBusy(false);
    }
  }

  async function onFile(f: File | undefined) {
    setSheet(null);
    setParseError("");
    setFile(f ?? null);
    if (!f) return;
    try {
      const parsed = await parseProductSheet(f);
      setSheet(parsed);
      if (!parsed.rows.length) setParseError("상품 줄이 하나도 없어요.");
    } catch (e) {
      setParseError(e instanceof Error ? e.message : "파일을 읽지 못했어요.");
    }
  }

  async function runImport() {
    const ok = plan.filter((r) => r.status !== "error");
    if (!ok.length) return;
    setImporting(true);
    try {
      // 구매처 이름 → id (없으면 새로 만들기)
      const byName = new Map(suppliers.map((s) => [s.name.trim(), s.id]));
      const rows = [];
      for (const r of ok) {
        const name = r.supplierName?.trim();
        if (name && !byName.has(name)) {
          const s = await store().saveSupplier(emptySupplier({ name }));
          byName.set(name, s.id);
        }
        rows.push(name ? { ...r.data, supplier_id: byName.get(name) ?? null } : r.data);
      }
      const res = await store().bulkSaveProducts(rows);
      if (sheet?.isKioskTemplate) {
        const fresh = await store().listProducts();
        const keys = new Set(ok.map((r) => r.data.barcode ?? `name:${r.name}`));
        const ids = fresh.filter((p) => keys.has(p.barcode ?? "") || keys.has(`name:${p.name}`)).map((p) => p.id);
        await store().markKioskSynced(ids);
      }
      await refresh("products", "suppliers");
      toast(`새로 ${res.created}개, 수정 ${res.updated}개 가져왔어요!`, "wow");
      setSheet(null);
      setFile(null);
    } catch (e) {
      toast(e instanceof Error ? e.message : "가져오지 못했어요", "sad");
    } finally {
      setImporting(false);
    }
  }

  return (
    <div>
      <PageHeader back title="엑셀 · 빅솔론" />
      <div className="space-y-4">
        {/* 내보내기 */}
        <section className="card space-y-4 p-4">
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-matcha-100 text-matcha-700">
              <FileSpreadsheet size={22} />
            </span>
            <div>
              <p className="font-cute text-lg">빅솔론 대량등록 엑셀 만들기</p>
              <p className="text-sm text-ink-soft">
                빅솔론 대량작업 양식(상품명·분류명·판매가·사용 …)과 칸·색·서식까지 똑같이 만들어요.
              </p>
            </div>
          </div>
          <Segmented<Scope>
            value={scope}
            onChange={setScope}
            options={[
              { value: "dirty", label: `반영 필요 ${dirty.length}` },
              { value: "active", label: `판매 중 ${products.filter((p) => p.is_active).length}` },
              { value: "all", label: `전체 ${products.length}` },
            ]}
          />
          <div>
            <p className="label">‘상품단가’ 칸에 넣을 값</p>
            <Segmented<UnitPriceMode>
              value={unitPrice}
              onChange={setUnitPrice}
              options={[
                { value: "cost", label: "원가" },
                { value: "price", label: "판매가" },
                { value: "blank", label: "비우기" },
              ]}
            />
            <p className="mt-1 text-xs text-ink-soft">
              양식의 선택 칸이에요. 빅솔론 화면에서 ‘상품단가’가 어디에 쓰이는지 한 번 확인해 보세요.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" className="btn-primary" disabled={busy} onClick={() => exportKiosk(false)}>
              <Download size={18} /> 다운로드
            </button>
            <button type="button" className="btn-soft" disabled={busy} onClick={() => exportKiosk(true)}>
              <Send size={18} /> 카톡으로 보내기
            </button>
          </div>
          <p className="rounded-2xl bg-cream p-3 text-xs text-ink-soft">
            💡 빅솔론 관리 프로그램의 대량 작업(엑셀 업로드)에 이 파일을 올리면 돼요. 폰에서 만들었다면 ‘카톡으로
            보내기’로 PC에 옮기세요. 이미 빅솔론에 있는 상품은 ‘상품 코드’가 들어가야 새로 생기지 않고 수정돼요.
          </p>
        </section>

        {/* 가져오기 */}
        <section className="card space-y-4 p-4">
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-soda-100 text-soda-700">
              <FileUp size={22} />
            </span>
            <div>
              <p className="font-cute text-lg">엑셀에서 상품 가져오기</p>
              <p className="text-sm text-ink-soft">빅솔론 양식, 이 앱 백업 파일 모두 돼요. 같은 상품은 수정돼요. 빅솔론에서 상품 목록을 내려받아 가져오면 상품 코드도 채워져요.</p>
            </div>
          </div>
          <label className="btn-soft w-full cursor-pointer">
            <FileUp size={18} /> {file ? file.name : "엑셀 파일 고르기"}
            <input
              type="file"
              accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
              className="sr-only"
              onChange={(e) => {
                void onFile(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </label>
          {parseError && <p className="rounded-2xl bg-danger/10 p-3 text-sm text-danger">{parseError}</p>}
          {sheet && sheet.rows.length > 0 && (
            <>
              <div className="space-y-1 rounded-2xl bg-cream p-3">
                <Toggle
                  checked={opts.updateExisting}
                  onChange={(v) => setOpts((o) => ({ ...o, updateExisting: v }))}
                  label="이미 있는 상품도 수정하기"
                  desc="빅솔론 상품 코드 → 바코드 → 상품명 순서로 같은 상품을 찾아요"
                />
                <Toggle
                  checked={opts.importCost}
                  onChange={(v) => setOpts((o) => ({ ...o, importCost: v }))}
                  label="‘상품단가/원가’를 원가로 가져오기"
                />
                <Toggle
                  checked={opts.importStock}
                  onChange={(v) => setOpts((o) => ({ ...o, importStock: v }))}
                  label="기존 상품 재고 수량 덮어쓰기"
                  desc="꺼두면 새 상품만 재고를 넣어요 (기존 재고 보호)"
                />
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-2xl bg-matcha-100 p-2">
                  <p className="text-xs text-matcha-700">새 상품</p>
                  <p className="font-cute text-xl">{counts.new}</p>
                </div>
                <div className="rounded-2xl bg-soda-100 p-2">
                  <p className="text-xs text-soda-700">수정</p>
                  <p className="font-cute text-xl">{counts.update}</p>
                </div>
                <div className="rounded-2xl bg-danger/10 p-2">
                  <p className="text-xs text-danger">건너뜀</p>
                  <p className="font-cute text-xl">{counts.error}</p>
                </div>
              </div>
              <ul className="max-h-72 divide-y-2 divide-dashed divide-line overflow-y-auto rounded-2xl border-2 border-line bg-white px-3">
                {plan.slice(0, 300).map((r) => (
                  <li key={r.line} className="flex items-center gap-2 py-2 text-sm">
                    <span className="w-8 text-xs text-ink-faint">{r.line}행</span>
                    <span
                      className={`badge ${
                        r.status === "new"
                          ? "bg-matcha-100 text-matcha-700"
                          : r.status === "update"
                            ? "bg-soda-100 text-soda-700"
                            : "bg-danger/10 text-danger"
                      }`}
                    >
                      {r.status === "new" ? "새로" : r.status === "update" ? "수정" : "건너뜀"}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{r.name || "(이름 없음)"}</span>
                    {r.message && <span className="truncate text-xs text-danger">{r.message}</span>}
                  </li>
                ))}
              </ul>
              <button
                type="button"
                className="btn-primary w-full"
                disabled={importing || counts.new + counts.update === 0}
                onClick={runImport}
              >
                {importing ? "가져오는 중..." : `${counts.new + counts.update}개 가져오기`}
              </button>
            </>
          )}
        </section>

        {/* 백업 */}
        <section className="card space-y-3 p-4">
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-berry-100 text-berry-600">
              <ShieldCheck size={22} />
            </span>
            <div>
              <p className="font-cute text-lg">전체 백업</p>
              <p className="text-sm text-ink-soft">상품(구매처·링크·메모 포함)과 구매처 목록을 엑셀로 저장해요.</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              className="btn-soft btn-sm"
              onClick={async () => {
                const blob = await buildBackupWorkbook(products, suppliers, (p) => store().imageUrl(p));
                download(blob, `포포하우스_백업_${stamp()}.xlsx`);
              }}
            >
              <Download size={16} /> 백업 받기
            </button>
            <button
              type="button"
              className="btn-soft btn-sm"
              onClick={async () => {
                const blob = await buildKioskWorkbook([], unitPrice);
                download(blob, "빅솔론_상품대량등록_빈양식.xlsx");
              }}
            >
              <FileSpreadsheet size={16} /> 빈 양식
            </button>
          </div>
        </section>
      </div>

      <ConfirmSheet
        open={exportedIds !== null}
        onClose={() => setExportedIds(null)}
        title="빅솔론에 반영했나요?"
        desc={`반영 완료로 표시하면 ${exportedIds?.length ?? 0}개 상품의 ‘빅솔론 반영 필요’ 표시가 사라져요. 다음에 수정하면 다시 떠요.`}
        confirmText="반영 완료"
        onConfirm={async () => {
          await store().markKioskSynced(exportedIds ?? []);
          await refresh("products");
          toast("빅솔론 반영 완료!", "wow");
        }}
      />
    </div>
  );
}
