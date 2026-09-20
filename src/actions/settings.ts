"use server";

import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth-utils";
import { revalidatePath } from "next/cache";
import { UserRole } from "@prisma/client";
import { z } from "zod";
import bcrypt from "bcryptjs";

// ─── Result type ──────────────────────────────────────────────

type ActionResult<T = void> =
  | { success: true; data: T; message?: string }
  | { success: false; error: string };

// ─── Schemas ──────────────────────────────────────────────────

const SystemPoliciesSchema = z.object({
  defaultCreditDays: z.coerce.number().int().min(1).max(365),
  lowStockThreshold: z.coerce.number().int().min(0),
});

const AdminCredentialsSchema = z.object({
  userId: z.string().min(1),
  currentPassword: z.string().min(1, "كلمة المرور الحالية مطلوبة"),
  newEmail: z.string().email("البريد الإلكتروني غير صالح").optional().or(z.literal("")),
  newPassword: z.string().min(6, "كلمة المرور الجديدة يجب أن تكون 6 أحرف على الأقل").optional().or(z.literal("")),
});

// ─── Alert Actions ────────────────────────────────────────────

export async function markAlertsRead(): Promise<ActionResult> {
  try {
    await prisma.alert.updateMany({
      where: { status: "UNREAD" },
      data: { status: "READ", readAt: new Date() },
    });
    return { success: true, data: undefined };
  } catch {
    return { success: false, error: "حدث خطأ" };
  }
}

// ─── System Policies Actions ──────────────────────────────────

export async function updateSystemPolicies(
  formData: z.infer<typeof SystemPoliciesSchema>
): Promise<ActionResult> {
  try {
    await requireRole([UserRole.SUPER_ADMIN, UserRole.ADMIN]);
    const data = SystemPoliciesSchema.parse(formData);

    const existing = await prisma.appSettings.findFirst();
    if (existing) {
      await prisma.appSettings.update({
        where: { id: existing.id },
        data,
      });
    } else {
      await prisma.appSettings.create({ data });
    }

    revalidatePath("/dashboard/settings");
    return { success: true, data: undefined, message: "تم تحديث إعدادات النظام بنجاح" };
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : "حدث خطأ غير متوقع" };
  }
}

// ─── Admin Credentials Action ─────────────────────────────────

export async function updateAdminCredentials(
  formData: z.infer<typeof AdminCredentialsSchema>
): Promise<ActionResult> {
  try {
    await requireRole([UserRole.SUPER_ADMIN, UserRole.ADMIN]);
    const data = AdminCredentialsSchema.parse(formData);

    // Verify current password
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: data.userId },
      select: { id: true, passwordHash: true },
    });

    const isValid = await bcrypt.compare(data.currentPassword, user.passwordHash);
    if (!isValid) {
      return { success: false, error: "كلمة المرور الحالية غير صحيحة" };
    }

    // Build update payload
    const updateData: { email?: string; passwordHash?: string } = {};

    if (data.newEmail && data.newEmail.trim() !== "") {
      // Check if email is already taken by another user
      const existing = await prisma.user.findUnique({ where: { email: data.newEmail } });
      if (existing && existing.id !== data.userId) {
        return { success: false, error: "هذا البريد الإلكتروني مستخدم بالفعل" };
      }
      updateData.email = data.newEmail;
    }

    if (data.newPassword && data.newPassword.trim() !== "") {
      updateData.passwordHash = await bcrypt.hash(data.newPassword, 12);
    }

    if (Object.keys(updateData).length === 0) {
      return { success: false, error: "لم يتم تغيير أي بيانات" };
    }

    await prisma.user.update({
      where: { id: data.userId },
      data: updateData,
    });

    return { success: true, data: undefined, message: "تم تحديث بيانات الحساب بنجاح" };
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : "حدث خطأ غير متوقع" };
  }
}
