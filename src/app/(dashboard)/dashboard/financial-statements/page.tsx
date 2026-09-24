import type { Metadata } from "next";
import { getAllFinancialStatements } from "./actions";
import { FinancialTabs, FinancialTabContent } from "./financial-tabs";
import { PeriodPicker } from "./period-picker";
import { formatCurrency } from "@/lib/utils";
import {
  TrendingUp, TrendingDown, Scale, Waves, FileText,
  ArrowUpRight, ArrowDownRight, Building2, Package, Wallet,
} from "lucide-react";

export const metadata: Metadata = { title: "القوائم المالية - Kapy Pharma" };
export const dynamic = "force-dynamic";

const MONTHS_AR = [
  "يناير","فبراير","مارس","أبريل","مايو","يونيو",
  "يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر",
];

function fmt(n: number) {
  return formatCurrency(n.toString());
}

function StatRow({
  label, value, level = 0, bold = false, colored = false, type = "neutral"
}: {
  label: string;
  value: number;
  level?: number;
  bold?: boolean;
  colored?: boolean;
  type?: "positive" | "negative" | "neutral";
}) {
  const colorClass = !colored ? "" :
    type === "positive" ? "text-emerald-500" :
    type === "negative" ? "text-red-500" : "";

  return (
    <tr className={`border-b border-border/40 hover:bg-muted/20 transition-colors ${bold ? "bg-muted/30" : ""}`}>
      <td className={`py-3 text-right ${level === 0 ? "pr-5" : level === 1 ? "pr-10" : "pr-14"}`}>
        <span className={`text-sm ${bold ? "font-bold text-foreground" : "text-muted-foreground"}`}>
          {label}
        </span>
      </td>
      <td className="py-3 pl-5 text-left font-mono">
        <span className={`text-sm ${bold ? "font-bold" : "font-medium"} ${colorClass || (value < 0 ? "text-red-500" : value > 0 ? "text-foreground" : "text-muted-foreground")}`}>
          {fmt(value)}
        </span>
      </td>
    </tr>
  );
}

function SectionHeader({ label, icon: Icon, color }: { label: string; icon: React.ElementType; color: string }) {
  return (
    <tr>
      <td colSpan={2} className="pt-6 pb-2 pr-5 pl-5">
        <div className={`flex items-center gap-2 text-xs font-bold uppercase tracking-widest ${color}`}>
          <Icon className="w-3.5 h-3.5" />
          {label}
        </div>
      </td>
    </tr>
  );
}

function TotalRow({ label, value, highlight = false }: { label: string; value: number; highlight?: boolean }) {
  const isPositive = value >= 0;
  return (
    <tr className={`${highlight ? "bg-primary/5 border-t-2 border-primary/20" : "bg-muted/50 border-t border-border"}`}>
      <td className="py-3.5 pr-5 text-right">
        <span className="text-sm font-bold text-foreground">{label}</span>
      </td>
      <td className="py-3.5 pl-5 text-left">
        <span className={`text-base font-extrabold font-mono ${highlight ? (isPositive ? "text-emerald-500" : "text-red-500") : "text-foreground"}`}>
          {fmt(value)}
        </span>
      </td>
    </tr>
  );
}

function StatCard({ label, value, icon: Icon, color }: { label: string; value: number; icon: React.ElementType; color: string }) {
  return (
    <div className={`p-5 rounded-xl border bg-card ${color}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold text-muted-foreground mb-1">{label}</p>
          <p className="text-xl font-extrabold font-mono text-foreground">{fmt(value)}</p>
        </div>
        <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-muted/50">
          <Icon className="w-5 h-5 text-primary" />
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

interface PageProps {
  searchParams: { tab?: string; year?: string; month?: string };
}

export default async function FinancialStatementsPage({ searchParams }: PageProps) {
  const now = new Date();
  const year = Number(searchParams.year ?? now.getFullYear());
  const month = Number(searchParams.month ?? (now.getMonth() + 1));
  const activeTab = searchParams.tab ?? "income";

  const { incomeStatement: IS, balanceSheet: BS, cashFlow: CF } =
    await getAllFinancialStatements(year, month);

  const periodLabel = `${MONTHS_AR[month - 1]} ${year}`;

  return (
    <div>
      {/* ── Page Header ─────────────────────────────────────── */}
      <div className="page-header mb-6">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <FileText className="w-6 h-6 text-primary" />
            القوائم المالية
          </h1>
          <p className="page-subtitle">البيانات المالية الختامية عن فترة: {periodLabel}</p>
        </div>
        <PeriodPicker year={year} month={month} />
      </div>

      {/* ── KPI Cards ────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard label="صافي الإيرادات" value={IS.netRevenue} icon={TrendingUp} color="border-emerald-500/20" />
        <StatCard label="مجمل الربح" value={IS.grossProfit} icon={ArrowUpRight} color="border-blue-500/20" />
        <StatCard label="صافي الدخل" value={IS.netIncome} icon={TrendingDown} color={IS.netIncome >= 0 ? "border-emerald-500/20" : "border-red-500/20"} />
        <StatCard label="رصيد الخزينة" value={BS.cashBalance} icon={Wallet} color="border-purple-500/20" />
      </div>

      {/* ── Tabs ─────────────────────────────────────────────── */}
      <FinancialTabs activeTab={activeTab} year={year} month={month}>

        {/* ══ 1. INCOME STATEMENT ══════════════════════════════ */}
        <FinancialTabContent value="income">
          <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
            {/* Header */}
            <div className="px-6 py-5 border-b border-border bg-muted/30">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                  <TrendingUp className="w-5 h-5 text-emerald-500" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-foreground">قائمة الدخل (الأرباح والخسائر)</h2>
                  <p className="text-xs text-muted-foreground">عن الفترة: {periodLabel}</p>
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-border bg-muted/20">
                    <th className="text-right pr-5 py-3 text-xs font-bold uppercase tracking-widest text-muted-foreground">البيان</th>
                    <th className="text-left pl-5 py-3 text-xs font-bold uppercase tracking-widest text-muted-foreground">المبلغ (ج.م)</th>
                  </tr>
                </thead>
                <tbody>
                  {/* Revenues */}
                  <SectionHeader label="أولاً: الإيرادات" icon={ArrowUpRight} color="text-emerald-500" />
                  <StatRow label="إجمالي المبيعات" value={IS.grossSalesRevenue} level={1} />
                  <StatRow label="يُطرح: إجمالي المرتجعات" value={-IS.totalReturns} level={1} />
                  <TotalRow label="صافي الإيرادات" value={IS.netRevenue} />

                  {/* COGS */}
                  <SectionHeader label="ثانياً: تكلفة البضاعة المباعة" icon={Package} color="text-amber-500" />
                  <StatRow label="تكلفة المنتجات المباعة" value={IS.cogs} level={1} />
                  <TotalRow label="مجمل الربح" value={IS.grossProfit} highlight />

                  {/* Operating Expenses */}
                  <SectionHeader label="ثالثاً: المصروفات التشغيلية" icon={ArrowDownRight} color="text-red-500" />
                  <StatRow label="مرتبات المناديب" value={IS.repSalaries} level={1} />
                  <StatRow label="المكافآت" value={IS.repBonuses} level={1} />
                  <StatRow label="يُطرح: الاستقطاعات" value={-IS.repDeductions} level={1} />
                  <StatRow label="المصروفات التشغيلية والإدارية" value={IS.operatingExpenses} level={1} />
                  <TotalRow label="إجمالي المصروفات التشغيلية" value={IS.totalOperatingExpenses} />

                  {/* Net Income */}
                  <TotalRow label="صافي الدخل (الربح / الخسارة)" value={IS.netIncome} highlight />
                </tbody>
              </table>
            </div>
          </div>
        </FinancialTabContent>

        {/* ══ 2. BALANCE SHEET ═════════════════════════════════ */}
        <FinancialTabContent value="balance">
          <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
            {/* Header */}
            <div className="px-6 py-5 border-b border-border bg-muted/30">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
                  <Scale className="w-5 h-5 text-blue-500" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-foreground">الميزانية العمومية</h2>
                  <p className="text-xs text-muted-foreground">المركز المالي كما في تاريخ اليوم</p>
                </div>
              </div>
            </div>

            <div className="grid md:grid-cols-2 divide-x divide-x-reverse divide-border">
              {/* Assets */}
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="border-b border-border bg-muted/20">
                      <th className="text-right pr-5 py-3 text-xs font-bold uppercase tracking-widest text-muted-foreground" colSpan={2}>الأصول</th>
                    </tr>
                  </thead>
                  <tbody>
                    <SectionHeader label="الأصول المتداولة" icon={Wallet} color="text-blue-500" />
                    <StatRow label="النقدية بالخزينة" value={BS.cashBalance} level={1} />
                    <StatRow label="ذمم مدينة (مبيعات آجلة غير محصّلة)" value={BS.accountsReceivable} level={1} />
                    <StatRow label="تقييم مخزون الأدوية (بسعر التكلفة)" value={BS.inventoryValue} level={1} />
                    <TotalRow label="إجمالي الأصول" value={BS.totalAssets} highlight />
                  </tbody>
                </table>
              </div>

              {/* Liabilities + Equity */}
              <div className="overflow-x-auto border-t md:border-t-0 border-border">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="border-b border-border bg-muted/20">
                      <th className="text-right pr-5 py-3 text-xs font-bold uppercase tracking-widest text-muted-foreground" colSpan={2}>الخصوم وحقوق الملكية</th>
                    </tr>
                  </thead>
                  <tbody>
                    <SectionHeader label="الخصوم" icon={Building2} color="text-red-500" />
                    <StatRow label="ذمم دائنة (مستحقات الموردين)" value={BS.accountsPayable} level={1} />
                    <TotalRow label="إجمالي الخصوم" value={BS.totalLiabilities} />

                    <SectionHeader label="حقوق الملكية" icon={Scale} color="text-emerald-500" />
                    <StatRow label="رأس المال والأرباح المحتجزة (الحقوق)" value={BS.equity} level={1} />
                    <TotalRow label="إجمالي الخصوم وحقوق الملكية" value={BS.totalLiabilities + BS.equity} highlight />
                  </tbody>
                </table>
              </div>
            </div>

            {/* Balance check */}
            <div className="px-6 py-4 border-t border-border bg-muted/20">
              <div className="flex items-center gap-2">
                {BS.totalAssets === BS.totalLiabilities + BS.equity ? (
                  <>
                    <div className="w-2 h-2 rounded-full bg-emerald-500" />
                    <p className="text-xs text-emerald-500 font-semibold">الميزانية متوازنة: الأصول = الخصوم + حقوق الملكية</p>
                  </>
                ) : (
                  <>
                    <div className="w-2 h-2 rounded-full bg-amber-500" />
                    <p className="text-xs text-amber-500 font-semibold">ملاحظة: لا توجد بيانات ذمم دائنة مسجلة</p>
                  </>
                )}
              </div>
            </div>
          </div>
        </FinancialTabContent>

        {/* ══ 3. CASH FLOW ════════════════════════════════════ */}
        <FinancialTabContent value="cash-flow">
          <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
            {/* Header */}
            <div className="px-6 py-5 border-b border-border bg-muted/30">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center">
                  <Waves className="w-5 h-5 text-purple-500" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-foreground">قائمة التدفقات النقدية</h2>
                  <p className="text-xs text-muted-foreground">حركة النقد الفعلية عن الفترة: {periodLabel}</p>
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-border bg-muted/20">
                    <th className="text-right pr-5 py-3 text-xs font-bold uppercase tracking-widest text-muted-foreground">البيان</th>
                    <th className="text-left pl-5 py-3 text-xs font-bold uppercase tracking-widest text-muted-foreground">المبلغ (ج.م)</th>
                  </tr>
                </thead>
                <tbody>
                  {/* Inflows */}
                  <SectionHeader label="أولاً: المتحصلات النقدية (تدفق داخل)" icon={ArrowUpRight} color="text-emerald-500" />
                  <StatRow label="إيرادات من مدفوعات الفواتير النقدية والآجلة" value={CF.cashSalesInflows} level={1} />
                  <StatRow label="تحويلات واردة" value={CF.collectedCreditInflows} level={1} />
                  <StatRow label="إيرادات أخرى" value={CF.otherInflows} level={1} />
                  <TotalRow label="إجمالي المتحصلات النقدية" value={CF.totalInflows} />

                  {/* Outflows */}
                  <SectionHeader label="ثانياً: المدفوعات النقدية (تدفق خارج)" icon={ArrowDownRight} color="text-red-500" />
                  <StatRow label="مدفوعات للموردين" value={CF.supplierPayments} level={1} />
                  <StatRow label="رواتب ومكافآت المناديب" value={CF.salaryPayments} level={1} />
                  <StatRow label="مصروفات تشغيلية وإدارية" value={CF.operatingOutflows} level={1} />
                  <StatRow label="مصروفات أخرى وتحويلات" value={CF.otherOutflows} level={1} />
                  <TotalRow label="إجمالي المدفوعات النقدية" value={CF.totalOutflows} />

                  {/* Net Cash Flow */}
                  <TotalRow label="صافي التدفق النقدي" value={CF.netCashFlow} highlight />
                </tbody>
              </table>
            </div>

            {/* Net indicator */}
            <div className="px-6 py-4 border-t border-border">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">تحليل التدفق النقدي للفترة:</p>
                <div className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-sm ${
                  CF.netCashFlow >= 0
                    ? "bg-emerald-500/10 text-emerald-500"
                    : "bg-red-500/10 text-red-500"
                }`}>
                  {CF.netCashFlow >= 0
                    ? <TrendingUp className="w-4 h-4" />
                    : <TrendingDown className="w-4 h-4" />
                  }
                  {CF.netCashFlow >= 0 ? "تدفق نقدي إيجابي" : "تدفق نقدي سلبي"}: {fmt(Math.abs(CF.netCashFlow))}
                </div>
              </div>
            </div>
          </div>
        </FinancialTabContent>

      </FinancialTabs>
    </div>
  );
}
