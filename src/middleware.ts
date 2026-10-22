import { auth } from "@/lib/auth";
import {
  NextResponse,
  type NextFetchEvent,
  type NextMiddleware,
  type NextRequest,
} from "next/server";
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

const AUTH_API_PREFIX = "/api/auth";
const STATIC_FILE_PATTERN = /\/[^/]+\.[a-zA-Z0-9]+$/;

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

/**
 * Requests that must never enter the NextAuth middleware wrapper.
 *
 * This bypass happens BEFORE `auth()` runs. That is essential for the session
 * invalidation/logout routes: wrapping them can let NextAuth re-issue the very
 * cookie the handler is trying to delete, which was one cause of the
 * `/login` → `/dashboard` redirect loop.
 */
function isBypassedPath(pathname: string): boolean {
  if (
    pathname === AUTH_API_PREFIX ||
    pathname.startsWith(`${AUTH_API_PREFIX}/`)
  ) {
    return true;
  }

  if (pathname === "/_next" || pathname.startsWith("/_next/")) {
    return true;
  }

  if (pathname === "/images" || pathname.startsWith("/images/")) {
    return true;
  }

  if (
    pathname === "/favicon.ico" ||
    pathname === "/robots.txt" ||
    pathname === "/sitemap.xml"
  ) {
    return true;
  }

  // Any static asset such as /logo.svg, /fonts/Cairo.woff2, etc.
  return STATIC_FILE_PATTERN.test(pathname);
}

const authMiddleware = auth((req) => {
  const { nextUrl, auth: session } = req;
  const pathname = normalizePathname(nextUrl.pathname);

  // Apply rate limiting for POST requests (Server actions & API routes).
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

  const isLoginPage =
    pathname === "/login" || pathname.startsWith("/login/");
  const isRootPage = pathname === "/";
  const isDashboard =
    pathname === "/dashboard" || pathname.startsWith("/dashboard/");

  const userId = session?.user?.id;
  const role = session?.user?.role as UserRole | undefined;
  const hasSessionUser = Boolean(userId);
  const canEnterDashboard = Boolean(userId && role);

  // Auth.js sends expired/invalid sessions here with ?session=expired or
  // ?error=.... Never bounce those requests back to /dashboard: the stale
  // JWT may still be present until the invalidation response clears it.
  const loginHasExpiredHint =
    isLoginPage &&
    (nextUrl.searchParams.has("session") ||
      nextUrl.searchParams.has("error"));

  /**
   * Public login route.
   *
   * - No usable session → render /login immediately. This is the critical
   *   "already on /login" guard that prevents an unauthenticated loop.
   * - Valid session → send the user to the dashboard, except when the login
   *   page is explicitly showing an expired-session/error message.
   */
  if (isLoginPage) {
    if (canEnterDashboard && !loginHasExpiredHint) {
      return NextResponse.redirect(new URL("/dashboard", nextUrl));
    }
    return NextResponse.next();
  }

  // Root is a public entry point: send authenticated users to the dashboard
  // and unauthenticated users to login. The destination is never matched by
  // this branch again, so it cannot loop.
  if (isRootPage) {
    return NextResponse.redirect(
      new URL(canEnterDashboard ? "/dashboard" : "/login", nextUrl)
    );
  }

  if (!isDashboard) {
    return NextResponse.next();
  }

  // Protected dashboard routes: unauthenticated users always go to /login.
  if (!hasSessionUser) {
    return NextResponse.redirect(new URL("/login", nextUrl));
  }

  // A token without a role is unusable. Clear it through the non-middleware
  // invalidation endpoint instead of redirecting to /login while the stale JWT
  // is still present (which would bounce back to /dashboard).
  if (!role) {
    return NextResponse.redirect(
      new URL("/api/auth/invalidate-session", nextUrl)
    );
  }

  // The dashboard root is allowed for every valid role. Sub-route permissions
  // are checked below; forbidden sub-routes land on `/dashboard`, which this
  // branch accepts, so they cannot form a redirect loop.
  if (pathname === "/dashboard") {
    if (!DASHBOARD_ROOT_ROLES.includes(role)) {
      return NextResponse.redirect(
        new URL("/api/auth/invalidate-session", nextUrl)
      );
    }
    return NextResponse.next();
  }

  const rule = getRouteRule(pathname);
  const allowedRoles = rule?.allowedRoles ?? ADMIN_FALLBACK_ROLES;

  if (!allowedRoles.includes(role)) {
    return NextResponse.redirect(
      new URL("/dashboard?error=forbidden", nextUrl)
    );
  }

  return NextResponse.next();
}) as unknown as NextMiddleware;

export default function middleware(
  request: NextRequest,
  event: NextFetchEvent
) {
  const pathname = normalizePathname(request.nextUrl.pathname);

  if (isBypassedPath(pathname)) {
    return NextResponse.next();
  }

  return authMiddleware(request, event);
}

export const config = {
  /**
   * Keep Next.js internals and all Auth.js endpoints out of middleware.
   * `/login` remains matched because authenticated visitors still need the
   * optional redirect to /dashboard.
   */
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico|images).*)"],
};
