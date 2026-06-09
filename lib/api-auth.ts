import { type NextRequest, NextResponse } from "next/server"
import { jwtVerify } from "jose"
import { getRuntimeJwtSecret } from "@/lib/runtime-auth"

export interface RequestAuthUser {
  ok: boolean
  error?: string
  userId?: string
  role?: string
  isAdmin?: boolean
}

export async function getRequestAuthUser(request: NextRequest): Promise<RequestAuthUser> {
  const token =
    request.cookies.get("token")?.value ||
    request.headers.get("authorization")?.replace("Bearer ", "")

  if (!token) {
    return { ok: false, error: "Não autenticado" }
  }

  try {
    const secret = getRuntimeJwtSecret()
    const { payload } = await jwtVerify(token, secret)
    const role = String(payload.role || "user").toLowerCase()
    const userId = String(payload.userId || "")
    return {
      ok: true,
      userId,
      role,
      isAdmin: role === "admin",
    }
  } catch {
    return { ok: false, error: "Token inválido" }
  }
}

type AdminGuardResult =
  | { ok: true; auth: RequestAuthUser & { ok: true } }
  | { ok: false; response: NextResponse }

/** Exige usuário autenticado com role admin (rotas sensíveis). */
export async function requireAdminApi(request: NextRequest): Promise<AdminGuardResult> {
  const auth = await getRequestAuthUser(request)
  if (!auth.ok) {
    return {
      ok: false,
      response: NextResponse.json({ error: auth.error || "Não autenticado" }, { status: 401 }),
    }
  }
  if (!auth.isAdmin) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Acesso negado" }, { status: 403 }),
    }
  }
  return { ok: true, auth }
}

