"use server";

import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth-utils";
import { revalidatePath } from "next/cache";
import { TransactionType, UserRole } from "@prisma/client";
import { z } from "zod";

const RecordTransactionSchema = z.object({
  type: z.nativeEnum(TransactionType),
  amount: z.coerce.number().positive("المبلغ يجب أن يكون أكبر من 0"),
  category: z.string().min(1, "اختر تصنيف المعاملة"),
  reference: z.string().optional(),
  notes: z.string().optional(),
});

type ActionResult<T = void> =
  | { success: true; data: T; message?: string }
  | { success: false; error: string };

export async function recordTreasuryTransaction(
  formData: z.infer<typeof RecordTransactionSchema>
): Promise<ActionResult> {
  try {
    const session = await requireRole([
      UserRole.SUPER_ADMIN,
      UserRole.ADMIN,
      UserRole.ACCOUNTANT,
    ]);

    const data = RecordTransactionSchema.parse(formData);

    await prisma.$transaction(async (tx: any) => {
      // 1. Get current settings (for balance)
      const settings = await tx.appSettings.findFirst();
      if (!settings) throw new Error("إعدادات النظام غير متوفرة");

      // Check balance if it's an OUT transaction
      if (data.type === TransactionType.CASH_OUT && data.amount > settings.treasuryBalance) {
        throw new Error(`رصيد الخزينة الحالي (${settings.treasuryBalance}) لا يكفي لهذه المعاملة`);
      }

      // 2. Create transaction record
      await tx.treasuryTransaction.create({
        data: {
          type: data.type,
          amount: data.amount,
          category: data.category,
          reference: data.reference,
          notes: data.notes,
          userId: session.user.id,
        },
      });

      // 3. Update main treasury balance
      await tx.appSettings.update({
        where: { id: settings.id },
        data: {
          treasuryBalance: {
            [data.type === TransactionType.CASH_IN ? "increment" : "decrement"]: data.amount,
          },
        },
      });
    });

    revalidatePath("/dashboard/treasury");
    return { success: true, data: undefined, message: "تم تسجيل المعاملة وتحديث رصيد الخزينة بنجاح" };
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : "حدث خطأ غير متوقع" };
  }
}
