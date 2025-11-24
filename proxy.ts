import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { jwtVerify } from "jose"
import { getRuntimeJwtSecret } from "@/lib/runtime-auth"

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (pathname === "/admin/sinistralidade") {
    console.log("[PROXY] Acesso sinistralidade", {
      url: request.url,
      method: request.method,
      ua: request.headers.get("user-agent"),
    })
  }

  if (request.url.includes("?from?get")) {
    console.log("🔥 GET SUSPEITO DETECTADO:", request.url)
  }

  // Public routes
  if (pathname === "/login" || pathname === "/") {
    return NextResponse.next()
  }

  // Protected routes
  if (pathname.startsWith("/admin")) {
    const token = request.cookies.get("token")?.value

    if (!token) {
      return NextResponse.redirect(new URL("/login", request.url))
    }

    try {
      const secret = getRuntimeJwtSecret()
      const { payload } = await jwtVerify(token, secret)

      // Admin-only: /admin/configuracoes
      if (pathname.startsWith("/admin/configuracoes") && payload.role !== "admin") {
        return NextResponse.redirect(new URL("/admin", request.url))
      }

      return NextResponse.next()
    } catch (error) {
      const response = NextResponse.redirect(new URL("/login", request.url))
      response.cookies.delete("token")
      return response
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/admin/:path*"],
}

