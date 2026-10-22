"use server";
import { handleActionError } from "@/lib/error-handler";

import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth-utils";
import { getOrCreateTreasury } from "@/lib/treasury";
import { revalidatePath } from "next/cache";
import { TransactionType, TransactionCategory, UserRole } from "@prisma/client";
import { z } from "zod";

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

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
    const amount = roundMoney(Number(data.amount));

    await prisma.$transaction(async (tx) => {
      const treasury = await getOrCreateTreasury(tx);
      const isDebit =
        data.type === TransactionType.CASH_OUT ||
        data.type === TransactionType.TRANSFER_OUT;

      if (isDebit) {
        // Conditional atomic decrement: two simultaneous withdrawals can
        // never both consume the same balance.
        const updated = await tx.treasury.updateMany({
          where: {
            id: treasury.id,
            currentBalance: { gte: amount },
          },
          data: {
            currentBalance: { decrement: amount },
          },
        });

        if (updated.count !== 1) {
          const current = await tx.treasury.findUnique({
            where: { id: treasury.id },
            select: { currentBalance: true },
          });
          throw new Error(
            `رصيد الخزينة الحالي (${Number(
              current?.currentBalance ?? 0
            ).toFixed(2)} ج.م) لا يكفي لهذه المعاملة`
          );
        }
      } else {
        await tx.treasury.update({
          where: { id: treasury.id },
          data: { currentBalance: { increment: amount } },
        });
      }

      const updatedTreasury = await tx.treasury.findUniqueOrThrow({
        where: { id: treasury.id },
        select: { currentBalance: true },
      });

      await tx.transaction.create({
        data: {
          treasuryId: treasury.id,
          type: data.type,
          category: data.category,
          amount,
          balanceAfter: updatedTreasury.currentBalance,
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
