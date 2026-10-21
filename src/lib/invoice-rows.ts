import type { InvoiceStatus, InvoiceType } from "@prisma/client";

/**
 * Serialisable invoice shape for client components.
 * Prisma `Decimal` values must be converted to plain numbers before crossing
 * the server → client boundary.
 */
export interface ClientInvoiceRow {
  id: string;
  invoiceNumber: string;
  type: InvoiceType;
  status: InvoiceStatus;
  total: number;
  remainingAmount: number;
  invoiceDate: string;
  isLegacy: boolean;
}

interface InvoiceForRow {
  id: string;
  invoiceNumber: string;
  type: InvoiceType;
  status: InvoiceStatus;
  total: unknown;
  remainingAmount: unknown;
  invoiceDate: Date;
  isLegacy: boolean;
}

export function toClientInvoiceRows(invoices: InvoiceForRow[]): ClientInvoiceRow[] {
  return invoices.map((invoice) => ({
    id: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    type: invoice.type,
    status: invoice.status,
    total: Number(invoice.total),
    remainingAmount: Number(invoice.remainingAmount),
    invoiceDate: invoice.invoiceDate.toISOString(),
    isLegacy: invoice.isLegacy,
  }));
}
