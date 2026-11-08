import { margin, stockLevel } from "./format";
import type { Product, ReportFacts, StockMove, Supplier } from "./types";

const DAY = 86_400_000;

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/**
 * Turns products and stock moves into the numbers the AI report talks about.
 * Everything is computed here so the AI never has to do arithmetic or guess.
 * "Sales" = 출고/판매 moves, because kiosk sales aren't connected yet.
 */
export function buildReportFacts(
  products: Product[],
  moves: StockMove[],
  suppliers: Map<string, Supplier>,
  days: number,
  now = new Date(),
): ReportFacts {
  const from = new Date(now.getTime() - days * DAY);
  const byId = new Map(products.map((p) => [p.id, p]));
  const active = products.filter((p) => p.is_active);

  const outQty = new Map<string, number>();
  let inQty = 0;
  let inAmount = 0;
  for (const m of moves) {
    if (new Date(m.created_at) < from) continue;
    if ((m.kind === "out" || m.kind === "sale") && m.qty < 0) {
      outQty.set(m.product_id, (outQty.get(m.product_id) ?? 0) - m.qty);
    } else if (m.kind === "in" && m.qty > 0) {
      inQty += m.qty;
      inAmount += (m.unit_cost ?? byId.get(m.product_id)?.cost_price ?? 0) * m.qty;
    }
  }

  let totalOut = 0;
  let revenue = 0;
  let profit = 0;
  const movers: ReportFacts["top_movers"] = [];
  for (const [id, qty] of outQty) {
    const p = byId.get(id);
    if (!p) continue;
    totalOut += qty;
    revenue += qty * p.sale_price;
    profit += qty * (p.sale_price - p.cost_price);
    movers.push({
      name: p.name,
      category: p.category,
      out_qty: qty,
      est_revenue: qty * p.sale_price,
      margin_rate: Math.round(margin(p.cost_price, p.sale_price).rate),
      stock: p.stock_qty,
    });
  }
  movers.sort((a, b) => b.out_qty - a.out_qty);

  // Same base rule as the 발주 page, raised to cover ~2 weeks of recent 출고.
  const reorder: ReportFacts["reorder"] = [];
  for (const p of active) {
    const out = outQty.get(p.id) ?? 0;
    const weekNeed = Math.ceil((out / days) * 7);
    if (stockLevel(p) === "ok" && !(out > 0 && p.stock_qty < weekNeed)) continue;
    const suggest = Math.max(
      p.safety_stock * 2 - p.stock_qty,
      Math.ceil((out / days) * 14) - p.stock_qty,
      p.safety_stock || 1,
      1,
    );
    reorder.push({
      name: p.name,
      stock: p.stock_qty,
      safety_stock: p.safety_stock,
      out_qty: out,
      suggest_qty: suggest,
      supplier: (p.supplier_id && suppliers.get(p.supplier_id)?.name) || "",
    });
  }
  reorder.sort((a, b) => a.stock - b.stock || b.out_qty - a.out_qty);

  const slow = active
    .filter((p) => p.stock_qty > 0 && new Date(p.created_at) < from && !outQty.has(p.id))
    .map((p) => ({
      name: p.name,
      stock: p.stock_qty,
      stock_cost: p.stock_qty * p.cost_price,
      days_since_created: Math.floor((now.getTime() - new Date(p.created_at).getTime()) / DAY),
    }))
    .sort((a, b) => b.stock_cost - a.stock_cost);

  const lowMargin = active
    .filter((p) => p.sale_price > 0 && p.cost_price > 0)
    .map((p) => ({
      name: p.name,
      cost_price: p.cost_price,
      sale_price: p.sale_price,
      margin_rate: Math.round(margin(p.cost_price, p.sale_price).rate),
    }))
    .filter((p) => p.margin_rate < 35)
    .sort((a, b) => a.margin_rate - b.margin_rate);

  const fresh = products
    .filter((p) => new Date(p.created_at) >= from)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));

  const priced = active.filter((p) => p.sale_price > 0 && p.cost_price > 0);
  return {
    period_days: days,
    from: ymd(from),
    to: ymd(now),
    has_outflow: totalOut > 0,
    totals: {
      active_products: active.length,
      out_of_stock: active.filter((p) => stockLevel(p) === "out").length,
      low_stock: active.filter((p) => stockLevel(p) === "low").length,
      stock_cost: active.reduce((n, p) => n + Math.max(p.stock_qty, 0) * p.cost_price, 0),
      avg_margin_rate: priced.length
        ? Math.round(priced.reduce((n, p) => n + margin(p.cost_price, p.sale_price).rate, 0) / priced.length)
        : 0,
      out_qty: totalOut,
      est_revenue: revenue,
      est_profit: profit,
      in_qty: inQty,
      in_amount: inAmount,
      new_products: fresh.length,
    },
    top_movers: movers.slice(0, 10),
    reorder: reorder.slice(0, 15),
    slow_movers: slow.slice(0, 8),
    low_margin: lowMargin.slice(0, 5),
    new_products: fresh.slice(0, 12).map((p) => ({
      name: p.name,
      category: p.category,
      sale_price: p.sale_price,
      tags: p.tags.slice(0, 5),
    })),
  };
}
