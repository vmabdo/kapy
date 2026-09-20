import type { Metadata } from "next";
import { getAllCategories } from "@/queries/inventory";
import { ProductForm } from "@/components/inventory/product-form";
import Link from "next/link";
import { ArrowRight, Package } from "lucide-react";

export const metadata: Metadata = { title: "إضافة منتج جديد" };

export default async function NewProductPage() {
  const categories = await getAllCategories();

  return (
    <div>
      <nav className="flex items-center gap-2 text-sm text-muted-foreground mb-5">
        <Link href="/dashboard/inventory" className="hover:text-foreground">المخازن</Link>
        <ArrowRight className="w-3.5 h-3.5 rotate-180" />
        <Link href="/dashboard/inventory/products" className="hover:text-foreground">المنتجات</Link>
        <ArrowRight className="w-3.5 h-3.5 rotate-180" />
        <span className="text-foreground font-medium">منتج جديد</span>
      </nav>

      <div className="page-header mb-6">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <Package className="w-6 h-6 text-primary" />
            إضافة منتج جديد
          </h1>
          <p className="page-subtitle">أضف منتجاً جديداً إلى كتالوج Kapy Pharma</p>
        </div>
      </div>

      <ProductForm categories={categories} />
    </div>
  );
}
