import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const SESSION_COOKIE_NAMES = [
  "authjs.session-token",
  "__Secure-authjs.session-token",
  "next-auth.session-token",
  "__Secure-next-auth.session-token",
];

/**
 * Clears a stale JWT cookie and sends the user back to the login page.
 *
 * `getRequiredSession()` redirects here when the database says the token's
 * user is disabled/deleted or its `sessionVersion` no longer matches.
 */
export async function GET(request: Request) {
  const response = NextResponse.redirect(
    new URL("/login?session=expired", request.url)
  );

  // Auth.js may split large session JWTs into numbered chunks. Clear both the
  // base cookie and any chunks for every legacy/current cookie name.
  for (const name of SESSION_COOKIE_NAMES) {
    response.cookies.delete(name);
    for (let index = 0; index < 5; index++) {
      response.cookies.delete(`${name}.${index}`);
    }
  }

  return response;
}
