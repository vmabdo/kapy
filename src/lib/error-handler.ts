import { Prisma } from "@prisma/client";
import { ZodError } from "zod";

type ErrorContext = "create" | "update" | "delete";

const GENERIC_CREATE =
  "حدث خطأ أثناء الحفظ، يرجى المحاولة مرة أخرى.";
const GENERIC_UPDATE =
  "حدث خطأ أثناء تحديث البيانات، يرجى المحاولة مرة أخرى.";
const GENERIC_DELETE =
  "تعذر إتمام عملية الحذف، يرجى المحاولة مرة أخرى.";

// Business-rule errors in this application are written in Arabic. Raw
// Prisma/PostgreSQL errors are English/technical, so this prevents leaking
// statements, column names, or connection details while preserving the useful
// validation messages users need to see.
const ARABIC_TEXT = /[\u0600-\u06FF]/;
const TECHNICAL_ERROR_MARKERS =
  /(prisma|postgres|postgresql|pgbouncer|sqlstate|syntax error|constraint|foreign key|unique constraint|duplicate key|column .* does not exist|relation .* does not exist|invalid input|econn|etimedout|timeout|connection pool|stack trace|cannot read propert|undefined is not)/i;

function genericMessage(context?: ErrorContext): string {
  if (context === "delete") return GENERIC_DELETE;
  if (context === "update") return GENERIC_UPDATE;
  return GENERIC_CREATE;
}

function redactSensitive(text: string): string {
  return text.replace(/postgres(?:ql)?:\/\/[^\s]+/gi, "[redacted-database-url]");
}

function logActionError(e: unknown, context?: ErrorContext): void {
  const code =
    typeof e === "object" && e !== null && "code" in e
      ? String((e as { code?: unknown }).code)
      : undefined;

  console.error(
    `[action-error]${context ? ` context=${context}` : ""}${
      code ? ` code=${code}` : ""
    }`,
    e instanceof Error
      ? {
          name: e.name,
          message: redactSensitive(e.message),
          // Keep stack traces on the server only, and only in development.
          stack:
            process.env.NODE_ENV === "development"
              ? redactSensitive(e.stack ?? "")
              : undefined,
        }
      : { value: redactSensitive(String(e)) }
  );
}

function isSafeBusinessMessage(message: string): boolean {
  return ARABIC_TEXT.test(message) && !TECHNICAL_ERROR_MARKERS.test(message);
}

export function handleActionError(e: unknown, context?: ErrorContext): string {
  if (e instanceof ZodError) {
    const errorMessages = e.errors.map((err) => err.message).join(", ");
    return `خطأ في البيانات: ${errorMessages}`;
  }

  if (e instanceof Prisma.PrismaClientKnownRequestError) {
    logActionError(e, context);

    switch (e.code) {
      case "P2002":
        return "هذا السجل موجود بالفعل. يرجى التحقق من البيانات وعدم التكرار.";
      case "P2003":
        if (context === "create" || context === "update") {
          return "تعذر حفظ البيانات بسبب ارتباط غير صالح. يرجى التحقق من الاختيارات المرتبطة.";
        }
        return "لا يمكن حذف هذا السجل لارتباطه ببيانات أخرى في النظام.";
      case "P2000":
        return "بعض القيم المدخلة أطول من الحد المسموح.";
      case "P2011":
      case "P2012":
        return "بعض الحقول المطلوبة فارغة. يرجى استكمال البيانات.";
      case "P2025":
        return "السجل المطلوب غير موجود أو تم حذفه بالفعل.";
      case "P2034":
        return "حدث تعارض مؤقت أثناء الحفظ. يرجى المحاولة مرة أخرى.";
      default:
        return genericMessage(context);
    }
  }

  if (
    e instanceof Prisma.PrismaClientValidationError ||
    e instanceof Prisma.PrismaClientUnknownRequestError ||
    e instanceof Prisma.PrismaClientInitializationError ||
    e instanceof Prisma.PrismaClientRustPanicError
  ) {
    logActionError(e, context);
    return genericMessage(context);
  }

  // Raw SQL errors (for example from prisma.$executeRaw) can surface with a
  // PostgreSQL SQLSTATE instead of a Prisma error class.
  const rawCode =
    typeof e === "object" && e !== null && "code" in e
      ? String((e as { code?: unknown }).code)
      : "";

  if (rawCode) {
    if (rawCode === "23505") {
      logActionError(e, context);
      return "هذا السجل موجود بالفعل. يرجى التحقق من البيانات وعدم التكرار.";
    }
    if (rawCode === "23503") {
      logActionError(e, context);
      return context === "delete"
        ? "لا يمكن حذف هذا السجل لارتباطه ببيانات أخرى في النظام."
        : "تعذر حفظ البيانات بسبب ارتباط غير صالح. يرجى التحقق من الاختيارات المرتبطة.";
    }
    if (rawCode === "23502") {
      logActionError(e, context);
      return "بعض الحقول المطلوبة فارغة. يرجى استكمال البيانات.";
    }
    if (rawCode === "22001") {
      logActionError(e, context);
      return "بعض القيم المدخلة أطول من الحد المسموح.";
    }
    if (rawCode === "22P02") {
      logActionError(e, context);
      return "إحدى القيم المدخلة غير صالحة. يرجى مراجعة البيانات.";
    }
  }

  if (e instanceof Error) {
    if (isSafeBusinessMessage(e.message)) {
      return e.message;
    }

    logActionError(e, context);
    return genericMessage(context);
  }

  logActionError(e, context);
  return genericMessage(context);
}
