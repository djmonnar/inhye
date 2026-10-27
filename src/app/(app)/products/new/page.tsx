"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { ProductForm, toInput } from "@/components/ProductForm";
import { Loading } from "@/components/ui";
import { useProducts } from "@/lib/queries";

function NewProduct() {
  const params = useSearchParams();
  const { data: products, isLoading } = useProducts();
  const copyId = params.get("copy");
  const barcode = params.get("barcode");

  if (copyId && isLoading) return <Loading />;
  const source = copyId ? products?.find((p) => p.id === copyId) : undefined;
  const initial = source
    ? { ...toInput(source), name: `${source.name} (복사)`, barcode: null, kiosk_code: null, stock_qty: 0 }
    : { barcode: barcode || null };

  return <ProductForm key={copyId ?? barcode ?? "new"} initial={initial} />;
}

export default function NewProductPage() {
  return (
    <Suspense fallback={<Loading />}>
      <NewProduct />
    </Suspense>
  );
}
