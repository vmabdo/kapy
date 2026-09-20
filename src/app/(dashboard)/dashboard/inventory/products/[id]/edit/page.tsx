import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getAllCategories, getProductById } from "@/queries/inventory";
import { ProductForm } from "@/components/inventory/product-form";
import Link from "next/link";
import { ArrowRight, Package } from "lucide-react";

export const metadata: Metadata = { title: "تعديل المنتج" };

interface Props {
  params: { id: string };
}

export default async function EditProductPage({ params }: Props) {
  const [product, categories] = await Promise.all([
    getProductById(params.id),
    getAllCategories(),
  ]);

  if (!product) notFound();

  return (
    <div>
      <nav className="flex items-center gap-2 text-sm text-muted-foreground mb-5">
        <Link href="/dashboard/inventory" className="hover:text-foreground">المخازن</Link>
        <ArrowRight className="w-3.5 h-3.5 rotate-180" />
        <Link href="/dashboard/inventory/products" className="hover:text-foreground">المنتجات</Link>
        <ArrowRight className="w-3.5 h-3.5 rotate-180" />
        <span className="text-foreground font-medium">تعديل: {product.name}</span>
      </nav>

      <div className="page-header mb-6">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <Package className="w-6 h-6 text-primary" />
            تعديل بيانات المنتج
          </h1>
          <p className="page-subtitle">{product.name} — {product.sku}</p>
        </div>
      </div>

      <ProductForm
        categories={categories}
        product={{
          id: product.id,
          name: product.name,
          sku: product.sku,
          categoryId: product.categoryId,
          unit: product.unit,
          packageSize: product.packageSize,
          sellingPrice: Number(product.sellingPrice),
          costPrice: product.costPrice ? Number(product.costPrice) : undefined,
          vatRate: Number(product.vatRate),
          reorderLevel: product.reorderLevel,
          requiresPrescription: product.requiresPrescription,
        }}
      />
    </div>
  );
}
