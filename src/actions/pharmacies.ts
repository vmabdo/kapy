"use server";
import { handleActionError } from "@/lib/error-handler";

import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth-utils";
import { revalidatePath } from "next/cache";
import { UserRole } from "@prisma/client";
import { getZonedYearMonth } from "@/lib/datetime";
import { z } from "zod";

// Optional text fields: treat empty/whitespace-only strings as "not provided"
// so they are never persisted (and never used as a foreign key value).
const optionalString = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v && v.length > 0 ? v : undefined));

const CreatePharmacySchema = z.object({
  name: z.string().min(2, "اسم الصيدلية مطلوب"),
  address: optionalString,
  phone: optionalString,
  governorateId: z.string().trim().min(1, "اختر المحافظة"),
  assignedRepId: optionalString,
  creditLimit: z.coerce.number().min(0).default(50000),
  targetAmount: z.coerce.number().min(0).default(10000),
});

const UpdatePharmacySchema = z.object({
  name: z.string().min(2, "اسم الصيدلية مطلوب"),
  address: optionalString,
  phone: optionalString,
  governorateId: z.string().trim().min(1, "اختر المحافظة"),
  creditLimit: z.coerce.number().min(0).default(50000),
  salesTarget: z.coerce.number().min(0).default(10000),
  isActive: z.boolean().default(true),
});

type ActionResult<T = void> =
  | { success: true; data: T; message?: string }
  | { success: false; error: string };

export async function createPharmacy(
  formData: z.infer<typeof CreatePharmacySchema>
): Promise<ActionResult<{ id: string }>> {
  try {
    await requireRole([UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.SALES_MANAGER]);

    const data = CreatePharmacySchema.parse(formData);

    // Fallback check: the governorate ID shown in the dropdown may be stale
    // (e.g. served from cache after a reseed). Fail with a clear message instead
    // of surfacing a raw P2003 foreign-key constraint violation.
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
      // 1. Create pharmacy
      const pharmacy = await tx.pharmacy.create({
        data: {
          name: data.name,
          address: data.address,
          phone: data.phone,
          governorateId: data.governorateId,
          creditLimit: data.creditLimit,
          salesTarget: data.targetAmount,
          currentBalance: 0,
          isActive: true,
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
          pharmacyId: pharmacy.id,
          periodYear: currentPeriod.year,
          periodMonth: currentPeriod.month,
          target: data.targetAmount,
          achieved: 0,
        },
      });

      return pharmacy;
    });

    revalidatePath("/dashboard/pharmacies");
    return { success: true, data: { id: result.id }, message: "تم تسجيل الصيدلية بنجاح" };
  } catch (e: unknown) {
    return { success: false, error: handleActionError(e, "create") };
  }
}

export async function updatePharmacy(
  id: string,
  formData: z.infer<typeof UpdatePharmacySchema>
): Promise<ActionResult> {
  try {
    await requireRole([UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.SALES_MANAGER]);

    const data = UpdatePharmacySchema.parse(formData);

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

    revalidatePath("/dashboard/pharmacies");
    revalidatePath(`/dashboard/pharmacies/${id}`);
    return { success: true, data: undefined, message: "تم تحديث بيانات الصيدلية بنجاح" };
  } catch (e: unknown) {
    return { success: false, error: handleActionError(e, "update") };
  }
}

export async function deletePharmacy(id: string): Promise<ActionResult> {
  try {
    await requireRole([UserRole.SUPER_ADMIN, UserRole.ADMIN]);

    // Constraint check: invoices
    const invoiceCount = await prisma.invoice.count({ where: { pharmacyId: id } });
    if (invoiceCount > 0) {
      return {
        success: false,
        error: `لا يمكن حذف هذه الصيدلية — مرتبطة بـ ${invoiceCount} فاتورة. قم بإلغاء تفعيلها عوضاً عن الحذف.`,
      };
    }

    // Constraint check: payments
    const paymentCount = await prisma.payment.count({ where: { pharmacyId: id } });
    if (paymentCount > 0) {
      return {
        success: false,
        error: `لا يمكن حذف هذه الصيدلية — مرتبطة بـ ${paymentCount} دفعة مالية.`,
      };
    }

    await prisma.pharmacy.delete({ where: { id } });
    revalidatePath("/dashboard/pharmacies");
    return { success: true, data: undefined, message: "تم حذف الصيدلية بنجاح" };
  } catch (e: unknown) {
    return { success: false, error: handleActionError(e) };
  }
}

const ChangeRepSchema = z.object({
  pharmacyId: z.string().min(1),
  salesRepId: z.string().min(1, "اختر المندوب"),
});

export async function changeAssignedRep(data: z.infer<typeof ChangeRepSchema>): Promise<ActionResult> {
  try {
    await requireRole([UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.SALES_MANAGER]);
    
    const { pharmacyId, salesRepId } = ChangeRepSchema.parse(data);

    await prisma.$transaction(async (tx) => {
      // Remove all previous reps for this pharmacy
      await tx.repPharmacy.deleteMany({
        where: { pharmacyId },
      });

      // Assign the new rep
      await tx.repPharmacy.create({
        data: {
          pharmacyId,
          salesRepId,
        },
      });
    });

    revalidatePath("/dashboard/pharmacies");
    revalidatePath(`/dashboard/pharmacies/${pharmacyId}`);
    revalidatePath("/dashboard/companies");
    revalidatePath(`/dashboard/companies/${pharmacyId}`);
    
    return { success: true, data: undefined, message: "تم تغيير المندوب المسؤول بنجاح" };
  } catch (e: unknown) {
    return { success: false, error: handleActionError(e) };
  }
}
