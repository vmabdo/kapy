import { readFileSync } from "fs";
import { resolve } from "path";
import {
  buildClientLedger,
  computeLedgerTotals,
  roundCurrency,
} from "@/lib/client-ledger";

/**
 * Loads DATABASE_URL from .env for standalone tsx execution.
 * Next.js loads .env automatically, but this script runs outside Next.
 */
function loadEnv() {
  if (process.env.DATABASE_URL) return;

  const envPath = resolve(process.cwd(), ".env");
  let contents: string;
  try {
    contents = readFileSync(envPath, "utf8");
  } catch {
    throw new Error(`Could not read ${envPath}. Set DATABASE_URL first.`);
  }

  for (const line of contents.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"]*)"?\s*$/);
    if (match) process.env[match[1]] = match[2];
  }
}

function assertAmount(actual: number, expected: number, label: string) {
  if (Math.abs(roundCurrency(actual) - roundCurrency(expected)) > 0.009) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`);
  }
}

/**
 * Pure-rule checks for the two return cases that caused the production bug.
 * These run without touching the database.
 */
function verifyLedgerRules() {
  const timestamp = new Date("2026-10-21T12:00:00.000Z");

  const baseInvoice = {
    id: "invoice",
    invoiceNumber: "INV-TEST",
    isLegacy: false,
    subtotal: 1000,
    discountAmount: 0,
    total: 800,
    createdAt: timestamp,
    items: [],
    returns: [{ totalAmount: 200 }],
  };

  const payment = {
    id: "payment",
    amount: 1000,
    method: "CASH",
    referenceNo: null,
    notes: null,
    createdAt: timestamp,
    invoice: { invoiceNumber: "INV-TEST" },
    paymentItems: [],
  };

  const returned = {
    id: "return",
    returnNumber: "RET-TEST",
    totalAmount: 200,
    createdAt: timestamp,
    items: [],
  };

  // CASH invoice: full payment + cash-refunded return => zero debt impact.
  const cashEntries = buildClientLedger({
    invoices: [{ ...baseInvoice, type: "CASH" as const }],
    payments: [payment],
    returns: [
      {
        ...returned,
        invoice: { type: "CASH" as const, isLegacy: false },
      },
    ],
  });
  const cashTotals = computeLedgerTotals(cashEntries);
  assertAmount(cashTotals.net, 0, "Cash-refund return must not change debt");
  assertAmount(cashTotals.debit, 1000, "Cash invoice debit must be gross");
  assertAmount(cashTotals.credit, 1000, "Cash invoice payment credit");

  const cashReturn = cashEntries.find((entry) => entry.type === "RETURN");
  assertAmount(cashReturn?.credit ?? -1, 0, "Cash return credit must be zero");
  assertAmount(cashReturn?.memoAmount ?? -1, 200, "Cash return memo amount");

  // Identical timestamps: invoice -> return -> payment.
  const order = cashEntries.map((entry) => entry.type).join(",");
  if (order !== "INVOICE,RETURN,PAYMENT") {
    throw new Error(`Unexpected tie-break order: ${order}`);
  }

  // CREDIT invoice: return is a real credit against the receivable.
  const creditEntries = buildClientLedger({
    invoices: [{ ...baseInvoice, type: "CREDIT" as const }],
    payments: [],
    returns: [
      {
        ...returned,
        invoice: { type: "CREDIT" as const, isLegacy: false },
      },
    ],
  });
  const creditTotals = computeLedgerTotals(creditEntries);
  assertAmount(creditTotals.net, 800, "Credit return must reduce debt once");
  assertAmount(creditTotals.debit, 1000, "Credit invoice debit must be gross");
  assertAmount(creditTotals.credit, 200, "Credit return credit");

  console.log("Ledger rule checks: PASS");
}

async function main() {
  loadEnv();
  verifyLedgerRules();

  const [{ prisma }, { getClientStatement }] = await Promise.all([
    import("@/lib/prisma"),
    import("@/queries/client-statement"),
  ]);

  try {
    const clients = await prisma.pharmacy.findMany({
      select: {
        id: true,
        name: true,
        clientType: true,
        currentBalance: true,
      },
      orderBy: { name: "asc" },
    });

    let failed = 0;
    let adjusted = 0;

    for (const client of clients) {
      const expected = roundCurrency(Number(client.currentBalance));
      const statement = await getClientStatement(client.id, expected);

      const closing = roundCurrency(
        statement.openingBalance + statement.totals.debit - statement.totals.credit
      );
      const closingDiff = roundCurrency(closing - expected);
      const rawActivityDiff = roundCurrency(statement.totals.net - expected);

      const reconciles = Math.abs(closingDiff) <= 0.009;
      const hasOpeningAdjustment = Math.abs(statement.openingBalance) > 0.009;
      if (!reconciles) failed += 1;
      if (hasOpeningAdjustment) adjusted += 1;

      const status = reconciles ? "PASS" : "FAIL";
      const adjustment = hasOpeningAdjustment
        ? ` | openingAdjustment=${statement.openingBalance.toFixed(2)}`
        : "";
      const rawMismatch =
        Math.abs(rawActivityDiff) > 0.009
          ? ` | activityVsBalance=${rawActivityDiff.toFixed(2)}`
          : "";

      console.log(
        `${status} | ${client.name} [${client.clientType}] | ` +
          `current=${expected.toFixed(2)} | closing=${closing.toFixed(2)} | ` +
          `activityNet=${statement.totals.net.toFixed(2)}` +
          adjustment +
          rawMismatch
      );
    }

    console.log(
      `\n${clients.length - failed}/${clients.length} client statements reconcile to currentBalance.`
    );
    if (adjusted > 0) {
      console.log(
        `${adjusted} statement(s) required an opening reconciliation amount (prior/unrecorded balance).`
      );
    }

    if (failed > 0) process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
