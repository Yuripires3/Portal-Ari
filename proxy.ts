import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { jwtVerify } from "jose"
import { getRuntimeJwtSecret } from "@/lib/runtime-auth"

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

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

      const role = String(payload.role || "user").toLowerCase()

      // Admin-only: /admin/configuracoes e /admin/indicadores
      if (
        (pathname.startsWith("/admin/configuracoes") || pathname.startsWith("/admin/indicadores")) &&
        role !== "admin"
      ) {
        return NextResponse.redirect(new URL("/admin", request.url))
      }

      // Admin-only: APIs de indicadores
      if (pathname.startsWith("/api/indicadores") && role !== "admin") {
        return NextResponse.json({ error: "Acesso negado" }, { status: 403 })
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
  matcher: ["/admin/:path*", "/api/indicadores/:path*"],
}

