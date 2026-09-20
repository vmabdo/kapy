import { notFound } from "next/navigation";
import Link from "next/link";
import { getProductById } from "@/queries/inventory";
import { Package, ArrowRight, ArrowLeftRight, Building2, AlertTriangle, Settings2, Warehouse } from "lucide-react";
import { formatCurrency, cn } from "@/lib/utils";
import type { Metadata } from "next";

interface Props {
  params: { id: string };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const p = await getProductById(params.id);
  return { title: p?.name ?? "تفاصيل المنتج" };
}

export const dynamic = "force-dynamic";

export default async function ProductDetailPage({ params }: Props) {
  const product = await getProductById(params.id);
  if (!product) notFound();

  const totalStock = product.stockItems.reduce((s, i) => s + i.quantity, 0);
  const totalReserved = product.stockItems.reduce((s, i) => s + i.reservedQty, 0);
  const isLow = totalStock <= product.reorderLevel && product.reorderLevel > 0;

  return (
    <div>
      <nav className="flex items-center gap-2 text-sm text-muted-foreground mb-5">
        <Link href="/dashboard/inventory" className="hover:text-foreground transition-colors">المخازن</Link>
        <ArrowRight className="w-3.5 h-3.5 rotate-180" />
        <Link href="/dashboard/inventory/products" className="hover:text-foreground transition-colors">المنتجات</Link>
        <ArrowRight className="w-3.5 h-3.5 rotate-180" />
        <span className="text-foreground font-medium">{product.name}</span>
      </nav>

      <div className="page-header">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
            <Package className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h1 className="page-title">{product.name}</h1>
            <p className="page-subtitle flex items-center gap-2">
              <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
                {product.sku}
              </span>
              <span>·</span>
              <span>{product.category.name}</span>
              {product.requiresPrescription && (
                <>
                  <span>·</span>
                  <span className="text-red-500 font-medium text-xs border border-red-500/20 bg-red-50 dark:bg-red-900/10 px-2 py-0.5 rounded-full">
                    يستلزم وصفة طبية
                  </span>
                </>
              )}
            </p>
          </div>
        </div>
        <Link
          href={`/dashboard/inventory/movements/new?productId=${product.id}`}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary/10 text-primary hover:bg-primary/20 text-sm font-medium transition-colors"
        >
          <ArrowLeftRight className="w-4 h-4" />
          حركة مخزون
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Sidebar: Details */}
        <div className="space-y-6">
          <div className="bg-card border border-border rounded-xl p-5">
            <h2 className="font-semibold text-sm mb-4 flex items-center gap-2">
              <Settings2 className="w-4 h-4 text-primary" />
              تفاصيل المنتج والتسعير
            </h2>
            <div className="space-y-4">
              <div className="flex justify-between items-center py-2 border-b border-border/50">
                <span className="text-sm text-muted-foreground">الوحدة</span>
                <span className="text-sm font-medium">{product.unit} (عبوة: {product.packageSize})</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-border/50">
                <span className="text-sm text-muted-foreground">سعر التكلفة</span>
                <span className="text-sm font-medium text-red-600">
                  {product.costPrice ? formatCurrency(product.costPrice.toString()) : "—"}
                </span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-border/50">
                <span className="text-sm text-muted-foreground">سعر البيع</span>
                <span className="text-sm font-medium text-green-600">
                  {formatCurrency(product.sellingPrice.toString())}
                </span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-border/50">
                <span className="text-sm text-muted-foreground">ضريبة القيمة المضافة</span>
                <span className="text-sm font-medium">{product.vatRate.toString()}%</span>
              </div>
              <div className="flex justify-between items-center py-2">
                <span className="text-sm text-muted-foreground">الحالة</span>
                <span className={cn(
                  "text-[11px] font-medium px-2 py-0.5 rounded-full",
                  product.isActive ? "bg-green-100 text-green-700" : "bg-muted text-muted-foreground"
                )}>
                  {product.isActive ? "نشط" : "غير نشط"}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Main Content: Stock Locations */}
        <div className="lg:col-span-2 space-y-6">
          {/* Summary Stats */}
          <div className="grid grid-cols-3 gap-4">
            <div className="stat-card">
              <p className="text-xs text-muted-foreground">إجمالي المخزون (المتاح)</p>
              <p className={cn("text-2xl font-bold mt-1", isLow ? "text-amber-500" : "text-green-600")}>
                {totalStock - totalReserved}
              </p>
            </div>
            <div className="stat-card">
              <p className="text-xs text-muted-foreground">الكمية المحجوزة</p>
              <p className="text-2xl font-bold mt-1 text-muted-foreground">{totalReserved}</p>
            </div>
            <div className="stat-card">
              <p className="text-xs text-muted-foreground">حد إعادة الطلب</p>
              <p className="text-2xl font-bold mt-1 text-foreground">{product.reorderLevel}</p>
            </div>
          </div>

          {/* Low Stock Alert */}
          {isLow && (
            <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800/40 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
                  تنبيه: مخزون منخفض
                </p>
                <p className="text-xs text-amber-700 dark:text-amber-400 mt-1">
                  المخزون الحالي ({totalStock}) أقل من أو يساوي حد إعادة الطلب المسموح به ({product.reorderLevel}). يرجى طلب كميات إضافية من المورد لتجنب النقص.
                </p>
              </div>
            </div>
          )}

          {/* Locations Table */}
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-border/60">
              <h2 className="font-semibold text-sm flex items-center gap-2">
                <Building2 className="w-4 h-4 text-primary" />
                أماكن تواجد المخزون
              </h2>
            </div>
            {product.stockItems.length === 0 ? (
              <div className="p-10 text-center text-muted-foreground">
                <Package className="w-8 h-8 mx-auto mb-2 opacity-25" />
                <p className="text-sm">هذا المنتج غير متوفر في أي مخزن حالياً</p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/40 border-b border-border/60">
                    <th className="text-right px-5 py-3 font-medium text-muted-foreground">المخزن</th>
                    <th className="text-center px-4 py-3 font-medium text-muted-foreground">الكمية الكلية</th>
                    <th className="text-center px-4 py-3 font-medium text-muted-foreground">محجوز</th>
                    <th className="text-center px-4 py-3 font-medium text-muted-foreground">المتاح للبيع</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {product.stockItems.map((item) => (
                    <tr key={item.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-5 py-3">
                        <Link href={`/dashboard/inventory/warehouses/${item.warehouseId}`} className="font-medium text-primary hover:underline flex items-center gap-2">
                          <Warehouse className="w-3.5 h-3.5" />
                          {item.warehouse.name}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-center font-semibold">{item.quantity}</td>
                      <td className="px-4 py-3 text-center text-muted-foreground">{item.reservedQty}</td>
                      <td className="px-4 py-3 text-center font-semibold text-green-600">{item.quantity - item.reservedQty}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
