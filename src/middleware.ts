import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import { UserRole } from "@prisma/client";

// Rate limiting map (IP -> info)
const rateLimits = new Map<string, { count: number; lastReset: number }>();
const RATE_LIMIT_MAX = 50;
const RATE_LIMIT_WINDOW = 10000; // 10 seconds

interface RouteRule {
  /** Dashboard route prefix. Matching is segment-aware, not a raw string prefix. */
  path: string;
  allowedRoles: readonly UserRole[];
}

/**
 * Strict dashboard route matrix.
 *
 * Rules are checked most-specific-first and matched on whole path segments.
 * That matters for siblings such as `/dashboard/sales` and
 * `/dashboard/sales-reps`: a naive `startsWith` lets the first rule swallow the
 * second one. Unlisted dashboard routes fall back to ADMIN/SUPER_ADMIN only.
 *
 * SALES_REP is deliberately absent from every HR, finance, company, report,
 * treasury and inventory rule. They keep their dashboard, client list and the
 * invoice workflow.
 */
const ROUTE_RULES: readonly RouteRule[] = [
  {
    path: "/dashboard/financial-statements",
    allowedRoles: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.ACCOUNTANT],
  },
  {
    path: "/dashboard/treasury",
    allowedRoles: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.ACCOUNTANT],
  },
  {
    path: "/dashboard/sales-reps",
    allowedRoles: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.SALES_MANAGER],
  },
  {
    // HR / payroll area — never expose to sales reps.
    path: "/dashboard/sales/reps",
    allowedRoles: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.SALES_MANAGER],
  },
  {
    path: "/dashboard/companies",
    allowedRoles: [
      UserRole.SUPER_ADMIN,
      UserRole.ADMIN,
      UserRole.SALES_MANAGER,
      UserRole.ACCOUNTANT,
    ],
  },
  {
    path: "/dashboard/reports",
    allowedRoles: [
      UserRole.SUPER_ADMIN,
      UserRole.ADMIN,
      UserRole.SALES_MANAGER,
      UserRole.ACCOUNTANT,
    ],
  },
  {
    path: "/dashboard/inventory",
    allowedRoles: [
      UserRole.SUPER_ADMIN,
      UserRole.ADMIN,
      UserRole.WAREHOUSE_MANAGER,
      UserRole.SALES_MANAGER,
    ],
  },
  {
    path: "/dashboard/settings",
    allowedRoles: [UserRole.SUPER_ADMIN, UserRole.ADMIN],
  },
  {
    // Invoice list/detail/create. Individual rep-level row filtering belongs in
    // the query layer; this gate only controls module access.
    path: "/dashboard/sales",
    allowedRoles: [
      UserRole.SUPER_ADMIN,
      UserRole.ADMIN,
      UserRole.SALES_MANAGER,
      UserRole.SALES_REP,
    ],
  },
  {
    path: "/dashboard/pharmacies",
    allowedRoles: [
      UserRole.SUPER_ADMIN,
      UserRole.ADMIN,
      UserRole.SALES_MANAGER,
      UserRole.ACCOUNTANT,
      UserRole.SALES_REP,
    ],
  },
].sort((a, b) => b.path.length - a.path.length);

const ADMIN_FALLBACK_ROLES: readonly UserRole[] = [
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
];

const DASHBOARD_ROOT_ROLES: readonly UserRole[] = [
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
  UserRole.WAREHOUSE_MANAGER,
  UserRole.SALES_MANAGER,
  UserRole.ACCOUNTANT,
  UserRole.SALES_REP,
  UserRole.VIEWER,
];

function normalizePathname(pathname: string): string {
  if (pathname.length <= 1) return pathname;
  return pathname.replace(/\/+$/, "") || "/";
}

function matchesRoute(pathname: string, route: string): boolean {
  return pathname === route || pathname.startsWith(`${route}/`);
}

function getRouteRule(pathname: string): RouteRule | undefined {
  return ROUTE_RULES.find((rule) => matchesRoute(pathname, rule.path));
}

export default auth((req) => {
  const { nextUrl, auth: session } = req;
  const pathname = normalizePathname(nextUrl.pathname);
  const isLoggedIn = !!session?.user;
  const isAuthPage = pathname === "/login" || pathname.startsWith("/login/");
  const isDashboard = pathname === "/dashboard" || pathname.startsWith("/dashboard/");

  // Apply rate limiting for POST requests (Server actions & API routes)
  if (req.method === "POST") {
    const ip =
      req.headers.get("x-forwarded-for") ||
      req.headers.get("x-real-ip") ||
      "unknown";
    const now = Date.now();
    const limitInfo = rateLimits.get(ip) ?? { count: 0, lastReset: now };

    if (now - limitInfo.lastReset > RATE_LIMIT_WINDOW) {
      limitInfo.count = 0;
      limitInfo.lastReset = now;
    }

    if (limitInfo.count >= RATE_LIMIT_MAX) {
      return new NextResponse("429 Too Many Requests", { status: 429 });
    }

    limitInfo.count++;
    rateLimits.set(ip, limitInfo);
  }

  // Redirect unauthenticated users trying to access protected routes
  if (!isLoggedIn && isDashboard) {
    return NextResponse.redirect(new URL("/login", nextUrl));
  }

  // Redirect already-authenticated users away from the login page
  if (isLoggedIn && isAuthPage) {
    return NextResponse.redirect(new URL("/dashboard", nextUrl));
  }

  // Strict role-based access control for every dashboard route.
  if (isLoggedIn && isDashboard) {
    const userRole = session?.user?.role as UserRole | undefined;
    if (!userRole) {
      return NextResponse.redirect(new URL("/login", nextUrl));
    }

    if (pathname === "/dashboard") {
      if (!DASHBOARD_ROOT_ROLES.includes(userRole)) {
        return NextResponse.redirect(new URL("/login", nextUrl));
      }
    } else {
      const rule = getRouteRule(pathname);
      const allowedRoles = rule?.allowedRoles ?? ADMIN_FALLBACK_ROLES;

      if (!allowedRoles.includes(userRole)) {
        return NextResponse.redirect(
          new URL("/dashboard?error=forbidden", nextUrl)
        );
      }
    }
  }

  return NextResponse.next();
});

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
