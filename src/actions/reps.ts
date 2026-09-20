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

const CreateRepSchema = z.object({
  name: z.string().min(2, "الاسم مطلوب"),
  phone: z.string().optional(),
  email: z.string().email("البريد الإلكتروني غير صالح"),
  password: z.string().min(6, "كلمة المرور يجب أن تكون 6 أحرف على الأقل"),
  baseSalary: z.coerce.number().min(0).default(0),
  monthlyTarget: z.coerce.number().min(0).default(0),
  governorateId: z.string().optional(),
});

const UpdateRepSchema = z.object({
  name: z.string().min(2, "الاسم مطلوب"),
  phone: z.string().optional(),
  baseSalary: z.coerce.number().min(0).default(0),
  monthlyTarget: z.coerce.number().min(0).default(0),
  governorateId: z.string().optional(),
});

const AddBonusSchema = z.object({
  salesRepId: z.string().min(1),
  amount: z.coerce.number().positive("المبلغ يجب أن يكون أكبر من 0"),
  reason: z.string().optional(),
  periodYear: z.coerce.number().int(),
  periodMonth: z.coerce.number().int().min(1).max(12),
});

const AddDeductionSchema = z.object({
  salesRepId: z.string().min(1),
  amount: z.coerce.number().positive("المبلغ يجب أن يكون أكبر من 0"),
  reason: z.string().optional(),
  periodYear: z.coerce.number().int(),
  periodMonth: z.coerce.number().int().min(1).max(12),
});

// ─── Create Sales Rep (User + SalesRep atomically) ────────────

export async function createSalesRep(
  formData: z.infer<typeof CreateRepSchema>
): Promise<ActionResult<{ id: string }>> {
  try {
    await requireRole([UserRole.SUPER_ADMIN, UserRole.ADMIN]);
    const data = CreateRepSchema.parse(formData);

    // Check email uniqueness
    const existing = await prisma.user.findUnique({ where: { email: data.email } });
    if (existing) return { success: false, error: "هذا البريد الإلكتروني مستخدم بالفعل" };

    const passwordHash = await bcrypt.hash(data.password, 12);

    // Generate unique employee code: REP-YYYY-XXXX
    const year = new Date().getFullYear();
    const count = await prisma.salesRep.count();
    const employeeCode = `REP-${year}-${String(count + 1).padStart(4, "0")}`;

    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name: data.name,
          email: data.email,
          passwordHash,
          role: UserRole.SALES_REP,
        },
      });

      const rep = await tx.salesRep.create({
        data: {
          userId: user.id,
          name: data.name,
          phone: data.phone || null,
          employeeCode,
          baseSalary: data.baseSalary,
          monthlyTarget: data.monthlyTarget,
          governorateId: data.governorateId || null,
        },
      });

      return rep;
    });

    revalidatePath("/dashboard/sales/reps");
    return { success: true, data: { id: result.id }, message: "تم إضافة المندوب بنجاح" };
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : "حدث خطأ غير متوقع" };
  }
}

// ─── Update Sales Rep ──────────────────────────────────────────

export async function updateSalesRep(
  repId: string,
  formData: z.infer<typeof UpdateRepSchema>
): Promise<ActionResult> {
  try {
    await requireRole([UserRole.SUPER_ADMIN, UserRole.ADMIN]);
    const data = UpdateRepSchema.parse(formData);

    await prisma.salesRep.update({
      where: { id: repId },
      data: {
        name: data.name,
        phone: data.phone || null,
        baseSalary: data.baseSalary,
        monthlyTarget: data.monthlyTarget,
        governorateId: data.governorateId || null,
      },
    });

    revalidatePath("/dashboard/sales/reps");
    revalidatePath(`/dashboard/sales/reps/${repId}`);
    return { success: true, data: undefined, message: "تم تحديث بيانات المندوب بنجاح" };
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : "حدث خطأ غير متوقع" };
  }
}

// ─── Add Bonus ─────────────────────────────────────────────────

export async function addRepBonus(
  formData: z.infer<typeof AddBonusSchema>
): Promise<ActionResult> {
  try {
    await requireRole([UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.SALES_MANAGER]);
    const data = AddBonusSchema.parse(formData);

    await prisma.repBonus.create({
      data: {
        salesRepId: data.salesRepId,
        amount: data.amount,
        reason: data.reason || null,
        periodYear: data.periodYear,
        periodMonth: data.periodMonth,
      },
    });

    revalidatePath(`/dashboard/sales/reps/${data.salesRepId}`);
    revalidatePath("/dashboard/sales/reps");
    return { success: true, data: undefined, message: "تم إضافة المكافأة بنجاح" };
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : "حدث خطأ غير متوقع" };
  }
}

// ─── Add Deduction ─────────────────────────────────────────────

export async function addRepDeduction(
  formData: z.infer<typeof AddDeductionSchema>
): Promise<ActionResult> {
  try {
    await requireRole([UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.SALES_MANAGER]);
    const data = AddDeductionSchema.parse(formData);

    await prisma.repDeduction.create({
      data: {
        salesRepId: data.salesRepId,
        amount: data.amount,
        reason: data.reason || null,
        periodYear: data.periodYear,
        periodMonth: data.periodMonth,
      },
    });

    revalidatePath(`/dashboard/sales/reps/${data.salesRepId}`);
    revalidatePath("/dashboard/sales/reps");
    return { success: true, data: undefined, message: "تم تسجيل الخصم بنجاح" };
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : "حدث خطأ غير متوقع" };
  }
}
