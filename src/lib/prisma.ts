import { PrismaClient } from "@prisma/client";

/**
 * Prisma must be a process-wide singleton. In development Next.js re-evaluates
 * modules on every HMR update; without the global cache each reload creates a
 * new PrismaClient (and a new connection pool), which can overwhelm Supabase's
 * pooler.
 */
const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ["error", "warn"],
  });

// Keep the singleton on globalThis in every environment. In development this
// survives HMR; in production it prevents duplicate clients during reloads.
globalForPrisma.prisma = prisma;
