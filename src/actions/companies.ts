"use server";
import { handleActionError } from "@/lib/error-handler";

import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth-utils";
import { revalidatePath } from "next/cache";
import { UserRole, ClientType } from "@prisma/client";
import { getZonedYearMonth } from "@/lib/datetime";
import { z } from "zod";

const optionalString = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v && v.length > 0 ? v : undefined));

const CreateCompanySchema = z.object({
  name: z.string().min(2, "اسم الشركة مطلوب"),
  address: optionalString,
  phone: optionalString,
  governorateId: z.string().trim().min(1, "اختر المحافظة"),
  assignedRepId: optionalString,
  creditLimit: z.coerce.number().min(0).default(100000),
  targetAmount: z.coerce.number().min(0).default(0),
});

const UpdateCompanySchema = z.object({
  name: z.string().min(2, "اسم الشركة مطلوب"),
  address: optionalString,
  phone: optionalString,
  governorateId: z.string().trim().min(1, "اختر المحافظة"),
  creditLimit: z.coerce.number().min(0).default(100000),
  salesTarget: z.coerce.number().min(0).default(0),
  isActive: z.boolean().default(true),
});

type ActionResult<T = void> =
  | { success: true; data: T; message?: string }
  | { success: false; error: string };

export async function createCompany(
  formData: z.infer<typeof CreateCompanySchema>
): Promise<ActionResult<{ id: string }>> {
  try {
    await requireRole([UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.SALES_MANAGER]);

    const data = CreateCompanySchema.parse(formData);

    const governorate = await prisma.governorate.findUnique({
      where: { id: data.governorateId },
      select: { id: true },
    });
    if (!governorate) {
      return {
        success: false,
        error: "المحافظة المختارة غير صحيحة أو لم تعد متاحة. يرجى تحديث الصفحة واختيار المحافظة مرة أخرى.",
      };
    }

    if (data.assignedRepId) {
      const rep = await prisma.salesRep.findUnique({
        where: { id: data.assignedRepId },
        select: { id: true },
      });
      if (!rep) {
        return {
          success: false,
          error: "المندوب المختار غير صحيح أو لم يعد متاحاً. يرجى تحديث الصفحة والمحاولة مرة أخرى.",
        };
      }
    }

    const result = await prisma.$transaction(async (tx) => {
      // 1. Create company (clientType: EXTERNAL_WAREHOUSE)
      const company = await tx.pharmacy.create({
        data: {
          name: data.name,
          address: data.address,
          phone: data.phone,
          governorateId: data.governorateId,
          creditLimit: data.creditLimit,
          salesTarget: data.targetAmount,
          currentBalance: 0,
          isActive: true,
          clientType: ClientType.EXTERNAL_WAREHOUSE,
          ...(data.assignedRepId
            ? {
                assignedReps: {
                  create: [{ salesRepId: data.assignedRepId }],
                },
              }
            : {}),
        },
      });

      // 2. Initialize current month's target tracking
      const currentPeriod = getZonedYearMonth(new Date());
      await tx.pharmacyTargetPeriod.create({
        data: {
          pharmacyId: company.id,
          periodYear: currentPeriod.year,
          periodMonth: currentPeriod.month,
          target: data.targetAmount,
          achieved: 0,
        },
      });

      return company;
    });

    revalidatePath("/dashboard/companies");
    return { success: true, data: { id: result.id }, message: "تم تسجيل الشركة بنجاح" };
  } catch (e: unknown) {
    return { success: false, error: handleActionError(e, "create") };
  }
}

export async function updateCompany(
  id: string,
  formData: z.infer<typeof UpdateCompanySchema>
): Promise<ActionResult> {
  try {
    await requireRole([UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.SALES_MANAGER]);

    const data = UpdateCompanySchema.parse(formData);

    const governorate = await prisma.governorate.findUnique({
      where: { id: data.governorateId },
      select: { id: true },
    });
    if (!governorate) {
      return {
        success: false,
        error: "المحافظة المختارة غير صحيحة أو لم تعد متاحة. يرجى تحديث الصفحة واختيار المحافظة مرة أخرى.",
      };
    }

    await prisma.pharmacy.update({
      where: { id },
      data: {
        name: data.name,
        address: data.address ?? null,
        phone: data.phone ?? null,
        governorateId: data.governorateId,
        creditLimit: data.creditLimit,
        salesTarget: data.salesTarget,
        isActive: data.isActive,
      },
    });

    revalidatePath("/dashboard/companies");
    revalidatePath(`/dashboard/companies/${id}`);
    return { success: true, data: undefined, message: "تم تحديث بيانات الشركة بنجاح" };
  } catch (e: unknown) {
    return { success: false, error: handleActionError(e, "update") };
  }
}

export async function deleteCompany(id: string): Promise<ActionResult> {
  try {
    await requireRole([UserRole.SUPER_ADMIN, UserRole.ADMIN]);

    // Constraint check: invoices
    const invoiceCount = await prisma.invoice.count({ where: { pharmacyId: id } });
    if (invoiceCount > 0) {
      return {
        success: false,
        error: `لا يمكن حذف هذه الشركة — مرتبطة بـ ${invoiceCount} فاتورة. قم بإلغاء تفعيلها عوضاً عن الحذف.`,
      };
    }

    // Constraint check: payments
    const paymentCount = await prisma.payment.count({ where: { pharmacyId: id } });
    if (paymentCount > 0) {
      return {
        success: false,
        error: `لا يمكن حذف هذه الشركة — مرتبطة بـ ${paymentCount} دفعة مالية.`,
      };
    }

    await prisma.pharmacy.delete({ where: { id } });
    revalidatePath("/dashboard/companies");
    return { success: true, data: undefined, message: "تم حذف الشركة بنجاح" };
  } catch (e: unknown) {
    return { success: false, error: handleActionError(e) };
  }
}
