import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { UserRole } from "@prisma/client";
import { cache } from "react";
import type { Session } from "next-auth";

type SessionState =
  | { status: "unauthenticated" }
  | { status: "stale" }
  | {
      status: "authenticated";
      session: Session;
    };

/**
 * Load the JWT session and verify it against the current database user.
 *
 * JWTs are valid for 30 days, so a token alone cannot be trusted after a user
 * is disabled, deleted, or has their password changed. `sessionVersion` is
 * bumped whenever credentials change; comparing it here immediately invalidates
 * every token issued before that change.
 *
 * `cache()` deduplicates the check within a single server render (layout +
 * pages + actions), avoiding one database roundtrip per guard.
 */
const loadSessionState = cache(async (): Promise<SessionState> => {
  const session = await auth();
  if (!session?.user?.id) {
    return { status: "unauthenticated" };
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      isActive: true,
      role: true,
      sessionVersion: true,
      salesRep: { select: { id: true } },
    },
  });

  if (
    !dbUser ||
    !dbUser.isActive ||
    dbUser.sessionVersion !== session.user.sessionVersion
  ) {
    return { status: "stale" };
  }

  // Role changes and rep reassignments take effect immediately instead of
  // waiting for the old JWT to expire.
  session.user.role = dbUser.role;
  session.user.salesRepId = dbUser.salesRep?.id ?? null;

  return { status: "authenticated", session };
});

/**
 * Server-side session helper.
 * Call this inside Server Components or Server Actions to get the session.
 * Redirects to /login if not authenticated, and through the session-expiry
 * route (which clears the cookie) if the token is no longer valid.
 */
export async function getRequiredSession() {
  const state = await loadSessionState();
  if (state.status === "unauthenticated") {
    redirect("/login");
  }
  if (state.status === "stale") {
    redirect("/api/auth/invalidate-session");
  }
  return state.session;
}

/**
 * Returns the current, database-validated session or null (does NOT redirect).
 * Use in layouts or components where unauthenticated is acceptable.
 */
export async function getOptionalSession() {
  const state = await loadSessionState();
  return state.status === "authenticated" ? state.session : null;
}

/**
 * Role hierarchy — higher index = more privilege.
 * Used for "minimum role" checks.
 */
const ROLE_HIERARCHY: UserRole[] = [
  UserRole.VIEWER,
  UserRole.SALES_REP,
  UserRole.WAREHOUSE_MANAGER,
  UserRole.ACCOUNTANT,
  UserRole.SALES_MANAGER,
  UserRole.ADMIN,
  UserRole.SUPER_ADMIN,
];

/**
 * Check if a user's role meets a minimum role requirement.
 */
export function hasMinimumRole(userRole: UserRole, minimumRole: UserRole): boolean {
  return ROLE_HIERARCHY.indexOf(userRole) >= ROLE_HIERARCHY.indexOf(minimumRole);
}

/**
 * Check if a user has one of the allowed roles.
 */
export function hasRole(userRole: UserRole, allowedRoles: UserRole[]): boolean {
  return allowedRoles.includes(userRole);
}

/**
 * Convenience: Check if the user is an admin or super admin.
 */
export function isAdmin(role: UserRole): boolean {
  return role === UserRole.ADMIN || role === UserRole.SUPER_ADMIN;
}

/**
 * Convenience: Check if the user is a sales rep only.
 */
export function isSalesRep(role: UserRole): boolean {
  return role === UserRole.SALES_REP;
}

/**
 * Server Action guard — throws if the session is stale or the role doesn't
 * match. Always uses the fresh database role, never the potentially stale JWT.
 *
 * @example
 * export async function createInvoice(data: InvoiceFormData) {
 *   await requireRole([UserRole.ADMIN, UserRole.SALES_REP]);
 *   // ... rest of action
 * }
 */
export async function requireRole(allowedRoles: UserRole[]) {
  const state = await loadSessionState();
  if (state.status !== "authenticated") {
    throw new Error("Unauthorized / غير مصرح لك بالقيام بهذا الإجراء");
  }
  if (!allowedRoles.includes(state.session.user.role)) {
    throw new Error("Unauthorized / غير مصرح لك بالقيام بهذا الإجراء");
  }
  return state.session;
}

/**
 * Server Action guard — ensures the user is authenticated with a fresh session.
 */
export async function requireAuth() {
  const state = await loadSessionState();
  if (state.status !== "authenticated") {
    throw new Error("Unauthorized / غير مصرح لك بالقيام بهذا الإجراء");
  }
  return state.session;
}
