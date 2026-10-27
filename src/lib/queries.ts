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

/** Refetch after a write. */
export function useRefresh() {
  const qc = useQueryClient();
  return useCallback(
    (...keys: ("products" | "suppliers" | "moves" | "members")[]) =>
      Promise.all(keys.map((k) => qc.invalidateQueries({ queryKey: [k] }))),
    [qc],
  );
}
