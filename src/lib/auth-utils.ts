import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { UserRole } from "@prisma/client";

/**
 * Server-side session helper.
 * Call this inside Server Components or Server Actions to get the session.
 * Redirects to /login if not authenticated.
 */
export async function getRequiredSession() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }
  return session;
}

/**
 * Returns the current session or null (does NOT redirect).
 * Use in layouts or components where unauthenticated is acceptable.
 */
export async function getOptionalSession() {
  return await auth();
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
 * Server Action guard — throws if the session role doesn't match.
 * Use at the top of any Server Action that requires authorization.
 *
 * @example
 * export async function createInvoice(data: InvoiceFormData) {
 *   await requireRole([UserRole.ADMIN, UserRole.SALES_REP]);
 *   // ... rest of action
 * }
 */
export async function requireRole(allowedRoles: UserRole[]) {
  const session = await auth();
  if (!session?.user) {
    throw new Error("Unauthorized: Not authenticated");
  }
  if (!allowedRoles.includes(session.user.role)) {
    throw new Error(`Forbidden: Role '${session.user.role}' is not allowed`);
  }
  return session;
}

/**
 * Server Action guard — ensures the user is authenticated.
 */
export async function requireAuth() {
  const session = await auth();
  if (!session?.user) {
    throw new Error("Unauthorized: Not authenticated");
  }
  return session;
}
