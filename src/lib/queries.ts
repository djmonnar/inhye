"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { store } from "./store";
import type { Product, Supplier } from "./types";

export function useProducts() {
  return useQuery({ queryKey: ["products"], queryFn: () => store().listProducts() });
}

export function useSuppliers() {
  return useQuery({ queryKey: ["suppliers"], queryFn: () => store().listSuppliers() });
}

export function useMoves(productId?: string, limit = 100) {
  return useQuery({
    queryKey: ["moves", productId ?? "all", limit],
    queryFn: () => store().listMoves(productId, limit),
  });
}

export function usePrintJobs(which: "pending" | "recent", pollMs: number | false = false) {
  return useQuery({
    queryKey: ["print-jobs", which],
    queryFn: () => store().listPrintJobs(which),
    refetchInterval: pollMs,
    refetchIntervalInBackground: true,
  });
}

export function usePosSales(sinceISO: string) {
  return useQuery({ queryKey: ["pos", "sales", sinceISO], queryFn: () => store().listPosSales(sinceISO) });
}

export function usePosRuns() {
  return useQuery({ queryKey: ["pos", "runs"], queryFn: () => store().listPosSyncRuns(10) });
}

export function usePosStatus() {
  return useQuery({ queryKey: ["pos", "status"], queryFn: () => store().posStatus(), retry: false });
}

export function useProduct(id: string | undefined): { product: Product | undefined; isLoading: boolean } {
  const { data, isLoading } = useProducts();
  return { product: data?.find((p) => p.id === id), isLoading };
}

export function useSupplierMap(): Map<string, Supplier> {
  const { data } = useSuppliers();
  return useMemo(() => new Map((data ?? []).map((s) => [s.id, s])), [data]);
}

export function useCategories(): string[] {
  const { data } = useProducts();
  return useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of data ?? []) counts.set(p.category, (counts.get(p.category) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c);
  }, [data]);
}

/** 거래처별 가격 전체 (가격 기록은 ["sources", "logs", ...]) */
export function useSources() {
  return useQuery({ queryKey: ["sources"], queryFn: () => store().listSources() });
}

export function usePriceLogs(filter: { productId?: string; supplierId?: string }, limit = 30) {
  return useQuery({
    queryKey: ["sources", "logs", filter.productId ?? "", filter.supplierId ?? "", limit],
    queryFn: () => store().listPriceLogs(filter, limit),
  });
}

/** Refetch after a write. */
export function useRefresh() {
  const qc = useQueryClient();
  return useCallback(
    (
      ...keys: (
        | "products"
        | "suppliers"
        | "moves"
        | "members"
        | "print-jobs"
        | "pos"
        | "orders"
        | "kakao"
        | "sources"
        | "kakao-bot"
        | "logen"
        | "barcode-issues"
      )[]
    ) => Promise.all(keys.map((k) => qc.invalidateQueries({ queryKey: [k] }))),
    [qc],
  );
}

/** 로젠 연동 준비 상태 — 체험 모드나 실패면 ‘준비 안 됨’으로 */
export function useLogenStatus(enabled = true) {
  return useQuery({ queryKey: ["logen"], queryFn: () => store().logenStatus(), enabled, retry: false, staleTime: 5 * 60_000 });
}

/** 상품 없이 만든 매장용 바코드 (v10) */
export function useBarcodeIssues() {
  return useQuery({ queryKey: ["barcode-issues"], queryFn: () => store().listBarcodeIssues(), retry: false });
}

export function useKakaoBot() {
  return useQuery({ queryKey: ["kakao-bot"], queryFn: () => store().kakaoBotStatus(), retry: false });
}

export function useOrders() {
  return useQuery({ queryKey: ["orders"], queryFn: () => store().listOrders() });
}

export function useKakaoStatus(enabled = true) {
  return useQuery({ queryKey: ["kakao"], queryFn: () => store().kakaoStatus(), enabled, retry: false });
}
