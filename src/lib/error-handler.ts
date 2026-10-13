import { Prisma } from "@prisma/client";
import { ZodError } from "zod";

type ErrorContext = "create" | "update" | "delete";

export function handleActionError(e: unknown, context?: ErrorContext): string {
  if (e instanceof ZodError) {
    const errorMessages = e.errors.map((err) => err.message).join(", ");
    return `خطأ في البيانات: ${errorMessages}`;
  }

  if (e instanceof Prisma.PrismaClientKnownRequestError) {
    // Unique constraint violation
    if (e.code === "P2002") {
      const target = (e.meta?.target as string[])?.join(", ") || "الحقل";
      return `يوجد سجل مسجل مسبقاً بنفس البيانات (${target}). يرجى التأكد من عدم التكرار.`;
    }
    // Foreign key constraint failed
    if (e.code === "P2003") {
      const field = String(e.meta?.field_name ?? "");
      const isGovernorate = field.includes("governorate");

      // On CREATE/UPDATE (or when the offending FK is governorateId), the
      // generic "linked to other data" delete message is misleading.
      if (context === "create" || context === "update" || isGovernorate) {
        if (isGovernorate) {
          return "البيانات المرتبطة غير صحيحة (يرجى التأكد من اختيار المحافظة بشكل صحيح).";
        }
        return "البيانات المرتبطة غير صحيحة. يرجى التأكد من صحة القيم المرتبطة بالنظام.";
      }

      // DELETE context — the record is still referenced by other rows.
      return "لا يمكن إتمام العملية لارتباط هذا السجل ببيانات أخرى في النظام.";
    }
    // Record to update not found
    if (e.code === "P2025") {
      return "السجل المطلوب غير موجود.";
    }
  }

  if (e instanceof Error) {
    return e.message;
  }

  return "حدث خطأ غير متوقع. يرجى المحاولة مرة أخرى.";
}
