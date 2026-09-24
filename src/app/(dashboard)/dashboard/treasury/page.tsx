import type { Metadata } from "next";
import { getTransactions, getTreasuryStats } from "@/queries/treasury";
import { TransactionForm } from "@/components/treasury/transaction-form";
import { Wallet, ArrowDown, ArrowUp, FileText, ArrowRight, TrendingUp, TrendingDown, Plus } from "lucide-react";
import { formatCurrency, formatDate, cn } from "@/lib/utils";
import { TransactionType } from "@prisma/client";
import Link from "next/link";

export const metadata: Metadata = { title: "الخزينة والماليات" };
export const dynamic = "force-dynamic";

export default async function TreasuryPage() {
  const [transactions, stats] = await Promise.all([
    getTransactions(),
    getTreasuryStats(),
  ]);

  return (
    <div>
      <div className="page-header mb-6">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <Wallet className="w-6 h-6 text-primary" />
            إدارة الخزينة
          </h1>
          <p className="page-subtitle">متابعة رصيد الخزينة، تسجيل المصروفات، وتوريدات النقدية</p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="col-span-1 md:col-span-3 bg-gradient-to-br from-primary/10 to-cyan-500/10 border border-primary/20 rounded-xl p-6 flex flex-col justify-center items-center text-center">
          <p className="text-sm font-semibold text-primary uppercase tracking-wider mb-2">الرصيد الحالي للخزينة</p>
          <p className="text-4xl md:text-5xl font-bold text-foreground">
            {formatCurrency(stats.currentBalance.toString())}
          </p>
        </div>
        <div className="bg-card border border-border rounded-xl p-5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center text-green-600 dark:text-green-400">
            <TrendingUp className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground font-medium mb-1">إجمالي الوارد اليوم</p>
            <p className="text-xl font-bold text-green-600 dark:text-green-400">
              {formatCurrency(stats.todayIn.toString())}
            </p>
          </div>
        </div>
        <div className="bg-card border border-border rounded-xl p-5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center text-red-600 dark:text-red-400">
            <TrendingDown className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground font-medium mb-1">إجمالي المنصرف اليوم</p>
            <p className="text-xl font-bold text-red-600 dark:text-red-400">
              {formatCurrency(stats.todayOut.toString())}
            </p>
          </div>
        </div>
        <div className="bg-card border border-border rounded-xl p-5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400">
            <FileText className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground font-medium mb-1">صافي حركة اليوم</p>
            <p className="text-xl font-bold text-foreground">
              {formatCurrency((Number(stats.todayIn) - Number(stats.todayOut)).toString())}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Main Col: Transaction Ledger */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-border/60">
              <h2 className="font-semibold text-sm flex items-center gap-2">
                <FileText className="w-4 h-4 text-primary" />
                سجل حركات الخزينة
              </h2>
            </div>
            
            {transactions.length === 0 ? (
              <div className="p-12 text-center text-muted-foreground">
                <Wallet className="w-10 h-10 mx-auto mb-3 opacity-25" />
                <p className="font-medium">لا توجد حركات مسجلة بعد</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/40 border-b border-border/60">
                      <th className="text-right px-4 py-3 font-medium text-muted-foreground">النوع</th>
                      <th className="text-center px-4 py-3 font-medium text-muted-foreground">المبلغ</th>
                      <th className="text-right px-4 py-3 font-medium text-muted-foreground">التصنيف</th>
                      <th className="text-right px-4 py-3 font-medium text-muted-foreground">البيان/المرجع</th>
                      <th className="text-right px-4 py-3 font-medium text-muted-foreground">التاريخ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {transactions.map((tx: any) => {
                      const isIn = tx.type === TransactionType.CASH_IN;
                      return (
                        <tr key={tx.id} className="hover:bg-muted/30 transition-colors">
                          <td className="px-4 py-3">
                            <span className={cn(
                              "inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full",
                              isIn ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                            )}>
                              {isIn ? <ArrowDown className="w-3 h-3" /> : <ArrowUp className="w-3 h-3" />}
                              {isIn ? "إيداع" : "صرف"}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center font-bold">
                            <span className={isIn ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}>
                              {isIn ? "+" : "-"}{formatCurrency(tx.amount.toString())}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">{tx.category}</td>
                          <td className="px-4 py-3">
                            <p className="font-medium whitespace-normal break-words min-w-[250px]">{tx.description || tx.notes || "—"}</p>
                            {tx.referenceNo && <p className="text-[10px] text-muted-foreground font-mono mt-0.5">{tx.referenceNo}</p>}
                          </td>
                          <td className="px-4 py-3 text-muted-foreground text-xs whitespace-nowrap">
                            {formatDate(tx.createdAt)}
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

        {/* Side Col: Record Transaction Form */}
        <div className="space-y-6">
          <div className="bg-card border border-border rounded-xl p-5">
            <h2 className="font-semibold text-sm mb-5 flex items-center gap-2">
              <Plus className="w-4 h-4 text-primary" />
              تسجيل حركة جديدة
            </h2>
            <TransactionForm currentBalance={Number(stats.currentBalance)} />
          </div>
        </div>
      </div>
    </div>
  );
}
