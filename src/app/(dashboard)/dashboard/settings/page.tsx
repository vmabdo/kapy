import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { getRequiredSession } from "@/lib/auth-utils";
import { Settings, Shield, Clock, AlertTriangle, KeyRound } from "lucide-react";
import { SystemPoliciesForm } from "./system-policies-form";
import { AdminCredentialsForm } from "./admin-credentials-form";

export const metadata: Metadata = { title: "إعدادات النظام" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const [settings, session] = await Promise.all([
    prisma.appSettings.findFirst(),
    getRequiredSession(),
  ]);

  return (
    <div className="space-y-6 max-w-3xl" dir="rtl">
      <div className="page-header">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <Settings className="w-6 h-6 text-primary" />
            إعدادات النظام
          </h1>
          <p className="page-subtitle">سياسات الائتمان والمخزون وبيانات الحساب</p>
        </div>
      </div>

      {/* System Policies */}
      <div className="section-card overflow-hidden">
        <div className="section-card-header">
          <h2 className="section-card-title text-base">
            <Shield className="w-5 h-5 text-primary" />
            سياسات النظام
          </h2>
        </div>
        <div className="p-5 border-t border-border/50">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5 text-sm">
            <div className="flex items-center gap-2 p-3 rounded-xl bg-muted/40 border border-border/40">
              <Clock className="w-4 h-4 text-primary shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">مهلة الائتمان الحالية</p>
                <p className="font-bold">{settings?.defaultCreditDays ?? 30} يوم</p>
              </div>
            </div>
            <div className="flex items-center gap-2 p-3 rounded-xl bg-muted/40 border border-border/40">
              <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">حد التنبيه للمخزون الحالي</p>
                <p className="font-bold">{settings?.lowStockThreshold ?? 10} قطعة</p>
              </div>
            </div>
          </div>
          <SystemPoliciesForm
            defaultCreditDays={settings?.defaultCreditDays ?? 30}
            lowStockThreshold={settings?.lowStockThreshold ?? 10}
          />
        </div>
      </div>

      {/* Admin Credentials */}
      <div className="section-card overflow-hidden">
        <div className="section-card-header">
          <h2 className="section-card-title text-base">
            <KeyRound className="w-5 h-5 text-primary" />
            بيانات الحساب
          </h2>
        </div>
        <div className="p-5 border-t border-border/50">
          <p className="text-sm text-muted-foreground mb-4">
            تغيير البريد الإلكتروني أو كلمة المرور — يتطلب إدخال كلمة المرور الحالية للتحقق
          </p>
          <AdminCredentialsForm userId={session.user.id} />
        </div>
      </div>
    </div>
  );
}
