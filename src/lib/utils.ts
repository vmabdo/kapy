import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { DiscountType } from "@prisma/client";
import { BUSINESS_TIME_ZONE, getZonedYearMonth } from "@/lib/datetime";

/** Utility for merging Tailwind class names safely. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Convert unknown numeric input to a finite number, defaulting to 0. */
function toFiniteNumber(value: unknown): number {
  if (value === null || value === undefined || value === "") return 0;
  const num = typeof value === "number" ? value : Number(value);
  return Number.isFinite(num) ? num : 0;
}

/** Format a number as Egyptian Pound currency. */
export function formatCurrency(
  amount: number | string | null | undefined,
  opts?: Intl.NumberFormatOptions
): string {
  const num = toFiniteNumber(amount);
  return new Intl.NumberFormat("ar-EG", {
    style: "currency",
    currency: "EGP",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    ...opts,
  }).format(num);
}

/** Format a number with locale formatting. */
export function formatNumber(
  value: number | string | null | undefined,
  locale = "ar-EG",
  opts?: Intl.NumberFormatOptions
): string {
  return new Intl.NumberFormat(locale, opts).format(toFiniteNumber(value));
}

/** Format a date to a readable Arabic locale string. */
export function formatDate(
  date: Date | string | null | undefined,
  locale = "ar-EG",
  opts?: Intl.DateTimeFormatOptions
): string {
  if (date === null || date === undefined) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: BUSINESS_TIME_ZONE,
    ...opts,
  }).format(d);
}

/** Format a date to a short numeric format (DD/MM/YYYY). */
export function formatShortDate(
  date: Date | string | null | undefined
): string {
  if (date === null || date === undefined) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: BUSINESS_TIME_ZONE,
  }).format(d);
}

/** Returns true if a credit invoice is overdue. */
export function isInvoiceOverdue(dueDate: Date | null, status: string): boolean {
  if (!dueDate || status === "PAID" || status === "CANCELLED") return false;
  return new Date() > new Date(dueDate);
}

/** Calculate days until (or since) a date. Negative = overdue. */
export function daysFromNow(date: Date | string): number {
  const d = typeof date === "string" ? new Date(date) : date;
  const diff = d.getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

/** Convert a Decimal (Prisma) or unknown value to a finite JS number safely. */
export function toNumber(value: unknown): number {
  return toFiniteNumber(value);
}

/** Generate a sequential invoice number. */
export function generateInvoiceNumber(sequence: number): string {
  const year = getZonedYearMonth(new Date()).year;
  const padded = String(sequence).padStart(5, "0");
  return `INV-${year}-${padded}`;
}

/** Generate a return number. */
export function generateReturnNumber(sequence: number): string {
  const year = getZonedYearMonth(new Date()).year;
  const padded = String(sequence).padStart(5, "0");
  return `RET-${year}-${padded}`;
}

/** Calculate discount amount */
export function calculateDiscountAmount(
  subtotal: number,
  discountType: DiscountType | string,
  discountValue: number
): number {
  const safeSubtotal = toFiniteNumber(subtotal);
  const safeDiscount = toFiniteNumber(discountValue);
  if (safeDiscount <= 0) return 0;
  if (discountType === DiscountType.PERCENTAGE) {
    return (safeSubtotal * safeDiscount) / 100;
  }
  return safeDiscount;
}

/** Calculate net total after discount */
export function calculateNetTotal(subtotal: number, discountAmount: number): number {
  return Math.max(0, toFiniteNumber(subtotal) - toFiniteNumber(discountAmount));
}
