import { NextRequest, NextResponse } from "next/server";

// Gate: replaces ugly nginx basic-auth with a branded in-app login.
// Everything except /login, /api/auth, static, and the avatar GLB requires the cookie.
const TOKEN = process.env.GATE_TOKEN ?? "miganpro-gate";

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (
    pathname.startsWith("/login") ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/avatars") ||
    pathname === "/favicon.ico"
  ) return NextResponse.next();

  if (req.cookies.get("migan_gate")?.value === TOKEN) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  return NextResponse.redirect(url);
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
