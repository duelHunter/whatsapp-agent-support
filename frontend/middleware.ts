// middleware.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();
  
  // Get the session token from cookies
  const accessToken = req.cookies.get("sb-access-token")?.value;

  const pathname = req.nextUrl.pathname;

  // Public routes
  const isPublic =
    pathname.startsWith("/login") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname === "/favicon.ico";

  if (isPublic) {
    // If logged in and visiting login, redirect to dashboard
    if (pathname.startsWith("/login") && accessToken) {
      // Verify token is valid
      const supabase = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: `Bearer ${accessToken}` } },
      });
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        return NextResponse.redirect(new URL("/dashboard", req.url));
      }
    }
    return res;
  }

  // Protect everything else
  if (!accessToken) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  // Verify token is valid
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    // Invalid token, redirect to login and clear cookies
    const response = NextResponse.redirect(new URL("/login", req.url));
    response.cookies.delete("sb-access-token");
    response.cookies.delete("sb-refresh-token");
    return response;
  }

  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
