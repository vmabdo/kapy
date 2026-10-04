"use server";
import { handleActionError } from "@/lib/error-handler";

import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth-utils";
import { revalidatePath } from "next/cache";
import { TransactionType, TransactionCategory, UserRole } from "@prisma/client";
import { z } from "zod";

const RecordTransactionSchema = z.object({
  type: z.nativeEnum(TransactionType),
  amount: z.coerce.number().positive("المبلغ يجب أن يكون أكبر من 0"),
  category: z.nativeEnum(TransactionCategory),
  description: z.string().optional(),
  referenceNo: z.string().optional(),
});

type ActionResult<T = void> =
  | { success: true; data: T; message?: string }
  | { success: false; error: string };

export async function recordTreasuryTransaction(
  formData: z.infer<typeof RecordTransactionSchema>
): Promise<ActionResult> {
  try {
    await requireRole([
      UserRole.SUPER_ADMIN,
      UserRole.ADMIN,
      UserRole.ACCOUNTANT,
    ]);

    const data = RecordTransactionSchema.parse(formData);

    await prisma.$transaction(async (tx) => {
      // 1. Get or create the treasury
      let treasury = await tx.treasury.findFirst();
      if (!treasury) {
        treasury = await tx.treasury.create({
          data: { name: "الخزينة الرئيسية", currentBalance: 0 },
        });
      }

      const currentBalance = Number(treasury.currentBalance);

      // 2. Check balance for CASH_OUT transactions
      if (
        (data.type === TransactionType.CASH_OUT ||
          data.type === TransactionType.TRANSFER_OUT) &&
        data.amount > currentBalance
      ) {
        throw new Error(
          `رصيد الخزينة الحالي (${currentBalance.toFixed(2)} ج.م) لا يكفي لهذه المعاملة`
        );
      }

      // 3. Calculate new balance
      const isDebit =
        data.type === TransactionType.CASH_OUT ||
        data.type === TransactionType.TRANSFER_OUT;
      const newBalance = isDebit
        ? currentBalance - data.amount
        : currentBalance + data.amount;

      // 4. Update treasury balance
      await tx.treasury.update({
        where: { id: treasury.id },
        data: { currentBalance: newBalance },
      });

      // 5. Create transaction record using correct model name: tx.transaction
      await tx.transaction.create({
        data: {
          treasuryId: treasury.id,
          type: data.type,
          category: data.category,
          amount: data.amount,
          balanceAfter: newBalance,
          description: data.description || null,
          referenceNo: data.referenceNo || null,
        },
      });
    });

    revalidatePath("/dashboard/treasury");
    return {
      success: true,
      data: undefined,
      message: "تم تسجيل المعاملة وتحديث رصيد الخزينة بنجاح",
    };
  } catch (e: unknown) {
    return {
      success: false,
      error: handleActionError(e),
    };
  }
}
