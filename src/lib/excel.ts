import type { Cell, Workbook } from "exceljs";
import { normalizeBarcode, parseNum } from "./format";
import type { BulkProductRow, Product, Supplier } from "./types";

/**
 * 빅솔론 상품 대량작업(엑셀 업로드) 양식 — 업로드해 주신 엑셀과 같은 열 순서/색/서식.
 * 노란색 = 필수, 주황색 = 선택.
 */
export const KIOSK_COLUMNS = [
  { header: "상품 코드\n(상품 수정시에만 입력)", required: false, width: 24.43 },
  { header: "상품명", required: true, width: 26 },
  { header: "상품 분류명", required: true, width: 14.57 },
  { header: "판매가", required: true, width: 15.29 },
  { header: "사용(Y/N)", required: true, width: 14.29 },
  { header: "재고 사용(Y/N)", required: false, width: 15 },
  { header: "재고 수량", required: false, width: 10.43 },
  { header: "바코드", required: false, width: 16.71 },
  { header: "상품단가", required: false, width: 12 },
  { header: "상품명(영어)", required: false, width: 16 },
  { header: "상품명(중국어)", required: false, width: 16 },
  { header: "상품명(일본어)", required: false, width: 16 },
  { header: "상품 설명", required: false, width: 22 },
  { header: "상품 설명(영어)", required: false, width: 22 },
  { header: "상품 설명(중국어)", required: false, width: 22 },
  { header: "상품 설명(일본어)", required: false, width: 22 },
] as const;

export type UnitPriceMode = "cost" | "price" | "blank";

async function loadExcel() {
  const mod = await import("exceljs");
  return (mod.default ?? mod) as typeof import("exceljs");
}

const yn = (b: boolean) => (b ? "Y" : "N");

function kioskRow(p: Product, unitPrice: UnitPriceMode): string[] {
  return [
    p.kiosk_code ?? "",
    p.name,
    p.category || "기타",
    String(p.sale_price),
    yn(p.is_active),
    yn(p.kiosk_track_stock),
    String(p.kiosk_track_stock ? Math.max(p.stock_qty, 0) : 0),
    p.barcode ?? "",
    unitPrice === "cost" ? String(p.cost_price) : unitPrice === "price" ? String(p.sale_price) : "",
    p.name_en ?? "",
    p.name_zh ?? "",
    p.name_ja ?? "",
    p.description ?? "",
    p.description_en ?? "",
    p.description_zh ?? "",
    p.description_ja ?? "",
  ];
}

const thin = { style: "thin" as const, color: { argb: "FF000000" } };
const border = { top: thin, left: thin, bottom: thin, right: thin };
const font = { name: "맑은 고딕", size: 9 };

export async function buildKioskWorkbook(products: Product[], unitPrice: UnitPriceMode): Promise<Blob> {
  const ExcelJS = await loadExcel();
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Sheet1");
  ws.columns = KIOSK_COLUMNS.map((c) => ({ width: c.width }));

  const header = ws.addRow(KIOSK_COLUMNS.map((c) => c.header));
  header.height = 24;
  header.eachCell((cell, col) => {
    const def = KIOSK_COLUMNS[col - 1];
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: def.required ? "FFFFFF00" : "FFFFC000" } };
    cell.font = font;
    cell.border = border;
    cell.numFmt = "@";
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: col === 1 };
  });

  for (const p of products) {
    // 빈 칸은 진짜 빈 셀로 (양식 원본과 동일)
    const row = ws.addRow(kioskRow(p, unitPrice).map((v) => (v === "" ? null : v)));
    row.height = 20.1;
    for (let col = 1; col <= KIOSK_COLUMNS.length; col++) {
      const cell = row.getCell(col);
      cell.font = font;
      cell.border = border;
      cell.numFmt = "@";
      cell.alignment = { horizontal: "center", vertical: "middle" };
    }
  }
  return toBlob(wb);
}

const BACKUP_COLUMNS: [string, (p: Product, s: Map<string, Supplier>) => string | number][] = [
  ["상품명", (p) => p.name],
  ["카테고리", (p) => p.category],
  ["바코드", (p) => p.barcode ?? ""],
  ["판매가", (p) => p.sale_price],
  ["원가", (p) => p.cost_price],
  ["재고", (p) => p.stock_qty],
  ["품절알림기준", (p) => p.safety_stock],
  ["구매처", (p, s) => (p.supplier_id ? s.get(p.supplier_id)?.name ?? "" : "")],
  ["구매링크", (p) => p.purchase_url ?? ""],
  ["구매처상품명", (p) => p.supplier_sku ?? ""],
  ["판매중(Y/N)", (p) => yn(p.is_active)],
  ["빅솔론재고사용(Y/N)", (p) => yn(p.kiosk_track_stock)],
  ["빅솔론상품코드", (p) => p.kiosk_code ?? ""],
  ["태그", (p) => p.tags.join(", ")],
  ["메모", (p) => p.memo ?? ""],
  ["상품명(영어)", (p) => p.name_en ?? ""],
  ["상품명(중국어)", (p) => p.name_zh ?? ""],
  ["상품명(일본어)", (p) => p.name_ja ?? ""],
  ["상품 설명", (p) => p.description ?? ""],
  ["상품 설명(영어)", (p) => p.description_en ?? ""],
  ["상품 설명(중국어)", (p) => p.description_zh ?? ""],
  ["상품 설명(일본어)", (p) => p.description_ja ?? ""],
  ["등록일", (p) => p.created_at.slice(0, 10)],
];

export async function buildBackupWorkbook(
  products: Product[],
  suppliers: Supplier[],
  imageUrl: (path: string | null) => string | null,
): Promise<Blob> {
  const ExcelJS = await loadExcel();
  const wb = new ExcelJS.Workbook();
  const supMap = new Map(suppliers.map((s) => [s.id, s]));

  const ws = wb.addWorksheet("상품");
  ws.columns = [...BACKUP_COLUMNS.map(([h]) => ({ header: h, width: Math.max(10, h.length * 2 + 2) })), { header: "사진링크", width: 30 }];
  for (const p of products) {
    const url = imageUrl(p.image_path);
    ws.addRow([...BACKUP_COLUMNS.map(([, get]) => get(p, supMap)), url && !url.startsWith("data:") ? url : ""]);
  }
  styleHeader(ws.getRow(1));
  ws.views = [{ state: "frozen", ySplit: 1 }];

  const ss = wb.addWorksheet("구매처");
  ss.columns = [
    { header: "이름", width: 20 },
    { header: "종류", width: 10 },
    { header: "사이트", width: 30 },
    { header: "담당자", width: 14 },
    { header: "전화", width: 16 },
    { header: "주문조건", width: 24 },
    { header: "메모", width: 30 },
  ];
  const kind = { online: "온라인", wholesale: "도매", offline: "오프라인", etc: "기타" };
  for (const s of suppliers) {
    ss.addRow([s.name, kind[s.kind], s.website ?? "", s.contact ?? "", s.phone ?? "", s.order_note ?? "", s.memo ?? ""]);
  }
  styleHeader(ss.getRow(1));
  return toBlob(wb);
}

function styleHeader(row: import("exceljs").Row) {
  row.eachCell((c) => {
    c.font = { bold: true };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFE3EB" } };
    c.alignment = { horizontal: "center", vertical: "middle" };
  });
  row.height = 22;
}

async function toBlob(wb: Workbook): Promise<Blob> {
  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

export function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function stamp(): string {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
}

/* ------------------------------------------------------------------ import */

type Field =
  | "kiosk_code" | "name" | "category" | "sale_price" | "is_active" | "kiosk_track_stock" | "stock_qty"
  | "barcode" | "cost_price" | "name_en" | "name_zh" | "name_ja" | "description" | "description_en"
  | "description_zh" | "description_ja" | "safety_stock" | "supplier" | "purchase_url" | "supplier_sku"
  | "tags" | "memo";

function fieldFor(header: string): Field | null {
  const h = header.replace(/\s+/g, "").toLowerCase();
  if (!h) return null;
  if (h.startsWith("상품코드") || h === "키오스크코드" || h === "빅솔론상품코드") return "kiosk_code";
  if (h.startsWith("상품명(영") ) return "name_en";
  if (h.startsWith("상품명(중")) return "name_zh";
  if (h.startsWith("상품명(일")) return "name_ja";
  if (h.startsWith("상품설명(영")) return "description_en";
  if (h.startsWith("상품설명(중")) return "description_zh";
  if (h.startsWith("상품설명(일")) return "description_ja";
  if (h === "상품설명" || h === "설명") return "description";
  if (h === "상품명" || h === "이름" || h === "품명") return "name";
  if (h.includes("분류") || h === "카테고리") return "category";
  if (h === "판매가" || h === "판매가격" || h === "가격") return "sale_price";
  if (h.startsWith("재고사용") || h.startsWith("키오스크재고사용") || h.startsWith("빅솔론재고사용")) return "kiosk_track_stock";
  if (h.startsWith("사용") || h.startsWith("판매중")) return "is_active";
  if (h === "재고수량" || h === "재고" || h === "수량") return "stock_qty";
  if (h === "바코드") return "barcode";
  if (h === "상품단가" || h === "원가" || h === "매입가" || h === "단가") return "cost_price";
  if (h.startsWith("품절알림") || h === "안전재고") return "safety_stock";
  if (h === "구매처" || h === "거래처") return "supplier";
  if (h.startsWith("구매링크") || h === "링크") return "purchase_url";
  if (h === "구매처상품명") return "supplier_sku";
  if (h === "태그") return "tags";
  if (h === "메모") return "memo";
  return null;
}

function cellText(cell: Cell): string {
  const v = cell.value as unknown;
  if (v == null) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : String(v);
  if (typeof v === "boolean") return v ? "Y" : "N";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object") {
    const o = v as { richText?: { text: string }[]; result?: unknown; text?: unknown; hyperlink?: string };
    if (o.richText) return o.richText.map((r) => r.text).join("").trim();
    if (o.result != null) return String(o.result).trim();
    if (o.text != null) return String(o.text).trim();
    if (o.hyperlink) return o.hyperlink;
  }
  return String(v).trim();
}

export interface ParsedRow {
  line: number;
  values: Partial<Record<Field, string>>;
}

export interface ParsedSheet {
  fields: Field[];
  rows: ParsedRow[];
  isKioskTemplate: boolean;
}

export async function parseProductSheet(file: File): Promise<ParsedSheet> {
  const ExcelJS = await loadExcel();
  const wb = new ExcelJS.Workbook();
  const buf = await file.arrayBuffer();
  const head = new Uint8Array(buf.slice(0, 4));
  if (head[0] !== 0x50 || head[1] !== 0x4b) {
    throw new Error("예전 형식(.xls) 파일이에요. 엑셀에서 ‘다른 이름으로 저장 → Excel 통합 문서(.xlsx)’로 저장한 뒤 올려 주세요.");
  }
  await wb.xlsx.load(buf);
  const ws = wb.worksheets[0];
  if (!ws) throw new Error("시트를 찾을 수 없어요.");

  let headerRow = 0;
  const colField = new Map<number, Field>();
  for (let r = 1; r <= Math.min(6, ws.rowCount); r++) {
    const row = ws.getRow(r);
    const found = new Map<number, Field>();
    row.eachCell((cell, col) => {
      const f = fieldFor(cellText(cell));
      if (f && ![...found.values()].includes(f)) found.set(col, f);
    });
    if ([...found.values()].includes("name")) {
      headerRow = r;
      found.forEach((f, c) => colField.set(c, f));
      break;
    }
  }
  if (!headerRow) throw new Error("‘상품명’ 열을 찾지 못했어요. 첫 줄에 제목(상품명, 판매가 …)이 있는지 확인해 주세요.");

  const rows: ParsedRow[] = [];
  for (let r = headerRow + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const values: Partial<Record<Field, string>> = {};
    let any = false;
    colField.forEach((f, col) => {
      const t = cellText(row.getCell(col));
      if (t) {
        values[f] = t;
        any = true;
      }
    });
    if (any) rows.push({ line: r, values });
  }
  const fields = [...colField.values()];
  const isKioskTemplate = fields.includes("kiosk_code") && fields.includes("is_active");
  return { fields, rows, isKioskTemplate };
}

export type RowStatus = "new" | "update" | "error";

export interface PlannedRow {
  line: number;
  status: RowStatus;
  message?: string;
  name: string;
  match?: Product;
  data: BulkProductRow;
  supplierName?: string;
}

export interface ImportOptions {
  updateExisting: boolean;
  importCost: boolean;
  importStock: boolean;
}

const yes = (v: string) => /^(y|yes|o|true|1|사용|예|판매)$/i.test(v.trim());

export function planImport(sheet: ParsedSheet, products: Product[], opts: ImportOptions): PlannedRow[] {
  const byCode = new Map(products.filter((p) => p.kiosk_code).map((p) => [p.kiosk_code as string, p]));
  const byBarcode = new Map(products.filter((p) => p.barcode).map((p) => [p.barcode as string, p]));
  const byName = new Map(products.map((p) => [p.name.trim(), p]));
  const seenBarcodes = new Set<string>();

  return sheet.rows.map(({ line, values: v }) => {
    const name = (v.name ?? "").trim();
    const barcode = normalizeBarcode(v.barcode);
    const match =
      (v.kiosk_code && byCode.get(v.kiosk_code)) || (barcode && byBarcode.get(barcode)) || byName.get(name) || undefined;
    const base: PlannedRow = { line, status: "new", name, match, data: { name }, supplierName: v.supplier };

    if (!name) return { ...base, status: "error", message: "상품명이 비어 있어요" };
    if (barcode) {
      if (seenBarcodes.has(barcode)) return { ...base, status: "error", message: "파일 안에 같은 바코드가 또 있어요" };
      seenBarcodes.add(barcode);
      const owner = byBarcode.get(barcode);
      if (owner && owner !== match) return { ...base, status: "error", message: `바코드가 ‘${owner.name}’과 겹쳐요` };
    }
    if (match && !opts.updateExisting) return { ...base, status: "error", message: "이미 있는 상품 (건너뜀)" };

    const d: BulkProductRow = { name };
    if (v.category) d.category = v.category.trim();
    if (v.sale_price) d.sale_price = parseNum(v.sale_price);
    if (v.is_active) d.is_active = yes(v.is_active);
    if (v.kiosk_track_stock) d.kiosk_track_stock = yes(v.kiosk_track_stock);
    if (barcode) d.barcode = barcode;
    if (v.kiosk_code) d.kiosk_code = v.kiosk_code;
    if (opts.importCost && v.cost_price) d.cost_price = parseNum(v.cost_price);
    if (v.stock_qty && (opts.importStock || !match)) d.stock_qty = parseNum(v.stock_qty);
    if (v.safety_stock) d.safety_stock = parseNum(v.safety_stock);
    if (v.purchase_url) d.purchase_url = v.purchase_url;
    if (v.supplier_sku) d.supplier_sku = v.supplier_sku;
    if (v.tags) d.tags = v.tags.split(",").map((t) => t.trim()).filter(Boolean);
    if (v.memo) d.memo = v.memo;
    for (const k of ["name_en", "name_zh", "name_ja", "description", "description_en", "description_zh", "description_ja"] as const) {
      if (v[k]) d[k] = v[k];
    }
    if (match) d.id = match.id;
    else d.category ??= "기타";

    return { ...base, status: match ? "update" : "new", data: d };
  });
}
