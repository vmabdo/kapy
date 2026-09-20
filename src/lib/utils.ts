import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Utility for merging Tailwind class names safely. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Format a number as Egyptian Pound currency. */
export function formatCurrency(
  amount: number | string,
  opts?: Intl.NumberFormatOptions
): string {
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  return new Intl.NumberFormat("ar-EG", {
    style: "currency",
    currency: "EGP",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    ...opts,
  }).format(num);
}

/** Format a date to a readable Arabic locale string. */
export function formatDate(date: Date | string, locale = "ar-EG"): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(d);
}

/** Format a date to a short numeric format (DD/MM/YYYY). */
export function formatShortDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
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

/** Convert a Decimal (Prisma) to a JS number safely. */
export function toNumber(value: unknown): number {
  if (value === null || value === undefined) return 0;
  return parseFloat(String(value));
}

/** Generate a sequential invoice number. */
export function generateInvoiceNumber(sequence: number): string {
  const year = new Date().getFullYear();
  const padded = String(sequence).padStart(5, "0");
  return `INV-${year}-${padded}`;
}

/** Generate a return number. */
export function generateReturnNumber(sequence: number): string {
  const year = new Date().getFullYear();
  const padded = String(sequence).padStart(5, "0");
  return `RET-${year}-${padded}`;
}
