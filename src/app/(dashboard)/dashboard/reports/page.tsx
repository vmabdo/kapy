import type { Metadata } from "next";
import Link from "next/link";
import { BarChart3, CalendarDays, CalendarRange, TrendingUp, AlertTriangle } from "lucide-react";

export const metadata: Metadata = { title: "التقارير والإحصائيات" };

export default function ReportsHubPage() {
  return (
    <div>
      <div className="page-header mb-8">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-primary" />
            مركز التقارير والإحصائيات
          </h1>
          <p className="page-subtitle">تقارير شاملة للمبيعات، التحصيلات، والمخزون</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        
        {/* Daily Report */}
        <Link href="/dashboard/reports/daily" className="group block bg-card border border-border hover:border-primary/40 rounded-xl overflow-hidden transition-all hover:shadow-md">
          <div className="h-3 bg-blue-500" />
          <div className="p-6">
            <div className="w-12 h-12 rounded-xl bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              <CalendarDays className="w-6 h-6" />
            </div>
            <h2 className="text-lg font-bold mb-2">التقرير اليومي الشامل</h2>
            <p className="text-sm text-muted-foreground">
              ملخص يومي لحركات المبيعات، الإيرادات النقدية، الفواتير الآجلة، والمصروفات. مثالي لتقفيل اليومية.
            </p>
          </div>
        </Link>

        {/* Monthly Report */}
        <Link href="/dashboard/reports/monthly" className="group block bg-card border border-border hover:border-primary/40 rounded-xl overflow-hidden transition-all hover:shadow-md">
          <div className="h-3 bg-purple-500" />
          <div className="p-6">
            <div className="w-12 h-12 rounded-xl bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              <CalendarRange className="w-6 h-6" />
            </div>
            <h2 className="text-lg font-bold mb-2">التقرير الشهري والأداء</h2>
            <p className="text-sm text-muted-foreground">
              تحليل شهري لأداء المبيعات، تحقيق أهداف الصيدليات، ونمو الإيرادات والمصروفات خلال الشهر.
            </p>
          </div>
        </Link>

        {/* Sales Reps Performance */}
        <Link href="/dashboard/reports/sales-performance" className="group block bg-card border border-border hover:border-primary/40 rounded-xl overflow-hidden transition-all hover:shadow-md">
          <div className="h-3 bg-green-500" />
          <div className="p-6">
            <div className="w-12 h-12 rounded-xl bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              <TrendingUp className="w-6 h-6" />
            </div>
            <h2 className="text-lg font-bold mb-2">أداء فريق المبيعات</h2>
            <p className="text-sm text-muted-foreground">
              متابعة مبيعات المناديب، عدد الصيدليات التابعة لكل مندوب، والعهد المصروفة لهم.
            </p>
          </div>
        </Link>

        {/* Low Stock Alerts */}
        <Link href="/dashboard/reports/low-stock" className="group block bg-card border border-border hover:border-primary/40 rounded-xl overflow-hidden transition-all hover:shadow-md">
          <div className="h-3 bg-amber-500" />
          <div className="p-6">
            <div className="w-12 h-12 rounded-xl bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h2 className="text-lg font-bold mb-2">نواقص المخزون</h2>
            <p className="text-sm text-muted-foreground">
              تقرير بالمنتجات التي تخطت حد إعادة الطلب وتحتاج إلى استعاضة من الموردين تجنباً لنقص البضاعة.
            </p>
          </div>
        </Link>

      </div>
    </div>
  );
}
