import type { Metadata } from "next";
import Link from "next/link";
import { getAllProducts, getAllCategories } from "@/queries/inventory";
import { Package, Plus, ArrowRight, AlertTriangle } from "lucide-react";
import { formatCurrency, cn } from "@/lib/utils";
import { ProductRowActions } from "@/components/inventory/product-row-actions";

export const metadata: Metadata = { title: "المنتجات" };
export const dynamic = "force-dynamic";

export default async function ProductsPage() {
  const [products, categories] = await Promise.all([getAllProducts(), getAllCategories()]);

  return (
    <div>
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-muted-foreground mb-5">
        <Link href="/dashboard/inventory" className="hover:text-foreground transition-colors">المخازن</Link>
        <ArrowRight className="w-3.5 h-3.5 rotate-180" />
        <span className="text-foreground font-medium">المنتجات</span>
      </nav>

      <div className="page-header">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <Package className="w-6 h-6 text-primary" />
            كتالوج المنتجات
          </h1>
          <p className="page-subtitle">
            {products.length} منتج في {categories.length} فئة
          </p>
        </div>
        <Link
          href="/dashboard/inventory/products/new"
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-4 h-4" />
          منتج جديد
        </Link>
      </div>

      {/* Category filter tabs */}
      <div className="flex gap-2 mb-5 overflow-x-auto pb-1">
        <span className="shrink-0 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium">
          الكل ({products.length})
        </span>
        {categories.map((cat) => {
          const count = products.filter((p) => p.categoryId === cat.id).length;
          return (
            <span
              key={cat.id}
              className="shrink-0 px-3 py-1.5 rounded-lg bg-muted text-muted-foreground text-xs font-medium cursor-pointer hover:bg-muted/80"
            >
              {cat.name} ({count})
            </span>
          );
        })}
      </div>

      {/* Product Table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        {products.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground">
            <Package className="w-10 h-10 mx-auto mb-3 opacity-25" />
            <p className="font-medium">لا توجد منتجات بعد</p>
            <Link href="/dashboard/inventory/products/new" className="mt-3 inline-flex items-center gap-1 text-sm text-primary hover:underline">
              <Plus className="w-3.5 h-3.5" /> أضف أول منتج
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/40 border-b border-border/60">
                  <th className="text-right px-5 py-3 font-medium text-muted-foreground">المنتج</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">الفئة</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">الوحدة</th>
                  <th className="text-center px-4 py-3 font-medium text-muted-foreground">سعر البيع</th>
                  <th className="text-center px-4 py-3 font-medium text-muted-foreground">إجمالي المخزون</th>
                  <th className="text-center px-4 py-3 font-medium text-muted-foreground">الحالة</th>
                  <th className="text-center px-4 py-3 font-medium text-muted-foreground">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {products.map((product) => {
                  const totalStock = product.stockItems.reduce((s, i) => s + i.quantity, 0);
                  const isLow = totalStock <= product.reorderLevel && product.reorderLevel > 0;

                  return (
                    <tr key={product.id} className="data-table-row">
                      <td className="px-5 py-3">
                        <div>
                          <p className="font-medium text-foreground">{product.name}</p>
                          <p className="text-xs text-muted-foreground font-mono">{product.sku}</p>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs bg-muted px-2 py-0.5 rounded-full text-muted-foreground">
                          {product.category.name}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{product.unit}</td>
                      <td className="px-4 py-3 text-center font-semibold text-green-600">
                        {formatCurrency(product.sellingPrice.toString())}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={cn("font-bold", isLow && "text-amber-500")}>
                          {totalStock}
                        </span>
                        {isLow && (
                          <AlertTriangle className="inline w-3.5 h-3.5 text-amber-500 mr-1" />
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={cn(
                          "text-[11px] font-medium px-2 py-0.5 rounded-full",
                          product.isActive
                            ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                            : "bg-muted text-muted-foreground"
                        )}>
                          {product.isActive ? "نشط" : "غير نشط"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <ProductRowActions
                          productId={product.id}
                          productName={product.name}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
