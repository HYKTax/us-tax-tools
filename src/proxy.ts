import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Refreshes the Supabase session cookie and performs an early session gate
 * for protected workspaces. Authorization still lives in RLS and page/action
 * role checks, but anonymous requests are redirected before protected child
 * pages start database queries.
 *
 * Named `proxy` (not `middleware`) per the Next.js 16 file convention —
 * see https://nextjs.org/docs/app/api-reference/file-conventions/proxy
 */
export async function proxy(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  // Runs on every route, including ones that don't need auth yet — so a
  // missing .env.local should degrade to "no session refresh" rather than
  // taking down every page in the app with an opaque SDK crash.
  if (!supabaseUrl || !supabaseKey) {
    console.warn(
      "[proxy] NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY are not set — " +
        "skipping session refresh. Copy .env.example to .env.local and fill these in."
    );
    return NextResponse.next();
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    supabaseUrl,
    supabaseKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // getClaims() verifies the JWT locally against the project's cached JWKS
  // (for projects using asymmetric signing keys, the default for new
  // projects) instead of a network round-trip to the Auth server on every
  // request the way getUser() requires — Supabase's current recommendation
  // for this refresh-on-every-request spot. Page-level checks that need the
  // full user record still use getUser()/getClaims() again, deliberately —
  // this call's only job is refreshing the cookie.
  const { data: claimsData } = await supabase.auth.getClaims();

  const pathname = request.nextUrl.pathname;
  const protectedWorkspace =
    pathname === "/dashboard" ||
    pathname.startsWith("/dashboard/") ||
    pathname === "/portal" ||
    pathname.startsWith("/portal/");

  if (protectedWorkspace && !claimsData?.claims?.sub) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = "";
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
