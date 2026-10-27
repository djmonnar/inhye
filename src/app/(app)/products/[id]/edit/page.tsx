"use client";

import { useParams } from "next/navigation";
import { ProductForm } from "@/components/ProductForm";
import { EmptyState, Loading, PageHeader } from "@/components/ui";
import { useProduct } from "@/lib/queries";

export default function EditProductPage() {
  const { id } = useParams<{ id: string }>();
  const { product, isLoading } = useProduct(id);
  if (isLoading) return <Loading />;
  if (!product)
    return (
      <>
        <PageHeader back title="상품 수정" />
        <EmptyState mood="sad" title="상품을 찾을 수 없어요" />
      </>
    );
  return <ProductForm key={product.id} product={product} />;
}
