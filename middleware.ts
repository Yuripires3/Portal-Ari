import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { jwtVerify } from "jose"

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Public routes
  if (pathname === "/login" || pathname === "/register" || pathname === "/") {
    return NextResponse.next()
  }

  // Protected routes
  if (pathname.startsWith("/admin")) {
    const token = request.cookies.get("token")?.value

    if (!token) {
      console.log("[Auth] No token, redirecting to login")
      return NextResponse.redirect(new URL("/login", request.url))
    }

    try {
      const secret = new TextEncoder().encode(process.env.JWT_SECRET || "your-secret-key-change-in-production")
      const { payload } = await jwtVerify(token, secret)

      // Admin-only: /admin/configuracoes
      if (pathname.startsWith("/admin/configuracoes") && payload.role !== "admin") {
        return NextResponse.redirect(new URL("/admin", request.url))
      }

      console.log("[Auth] Access granted for:", payload.role)
      return NextResponse.next()
    } catch (error) {
      console.log("[Auth] Token verification failed, redirecting to login")
      const response = NextResponse.redirect(new URL("/login", request.url))
      response.cookies.delete("token")
      return response
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/admin/:path*", "/register"],
}
