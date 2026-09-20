import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { UserRole } from "@prisma/client";

/**
 * Route permission matrix.
 * Maps path prefixes to the minimum roles allowed to access them.
 */
const ROUTE_PERMISSIONS: Record<string, UserRole[]> = {
  "/dashboard/treasury": [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.ACCOUNTANT],
  "/dashboard/inventory": [
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.WAREHOUSE_MANAGER,
    UserRole.SALES_MANAGER,
  ],
  "/dashboard/sales": [
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.SALES_MANAGER,
    UserRole.SALES_REP,
  ],
  "/dashboard/pharmacies": [
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.SALES_MANAGER,
    UserRole.ACCOUNTANT,
  ],
  "/dashboard/reports": [
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.SALES_MANAGER,
    UserRole.ACCOUNTANT,
  ],
  "/dashboard/settings": [UserRole.SUPER_ADMIN, UserRole.ADMIN],
  "/dashboard": [
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.WAREHOUSE_MANAGER,
    UserRole.SALES_MANAGER,
    UserRole.ACCOUNTANT,
    UserRole.SALES_REP,
    UserRole.VIEWER,
  ],
};

export default auth(((req: any) => {
  const { nextUrl, auth: session } = req;
  const isLoggedIn = !!session?.user;
  const isAuthPage = nextUrl.pathname.startsWith("/login");
  const isDashboard = nextUrl.pathname.startsWith("/dashboard");

  // Redirect unauthenticated users trying to access protected routes
  if (!isLoggedIn && isDashboard) {
    return NextResponse.redirect(new URL("/login", nextUrl));
  }

  // Redirect already-authenticated users away from the login page
  if (isLoggedIn && isAuthPage) {
    return NextResponse.redirect(new URL("/dashboard", nextUrl));
  }

  // Role-based access control for dashboard sub-routes
  if (isLoggedIn && isDashboard) {
    const userRole = session?.user?.role as UserRole | undefined;

    // Find the most specific matching route permission
    const matchedRoute = Object.keys(ROUTE_PERMISSIONS)
      .filter((route) => nextUrl.pathname.startsWith(route))
      .sort((a, b) => b.length - a.length)[0]; // most specific match first

    if (matchedRoute && userRole) {
      const allowedRoles = ROUTE_PERMISSIONS[matchedRoute];
      if (!allowedRoles.includes(userRole)) {
        // Redirect to dashboard root with a 403 indicator
        return NextResponse.redirect(new URL("/dashboard?error=forbidden", nextUrl));
      }
    }
  }

  return NextResponse.next();
}) as any);

export const config = {
  /**
   * Match all routes EXCEPT:
   * - API routes other than auth (handled separately)
   * - Next.js internals (_next/static, _next/image)
   * - Public static files (favicon, robots, etc.)
   */
  matcher: [
    "/((?!api/(?!auth)|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)",
  ],
};
