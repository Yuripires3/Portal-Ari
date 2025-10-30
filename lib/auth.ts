import { jwtVerify } from "jose"

export interface User {
  id: string
  cpf: string
  usuario_login: string
  role: "admin" | "user"
  nome: string
  email: string
  area: string | null
}

export async function verifyToken(token: string): Promise<User | null> {
  try {
    const secret = new TextEncoder().encode(process.env.JWT_SECRET || "your-secret-key-change-in-production")

    const { payload } = await jwtVerify(token, secret)

    return {
      id: payload.userId as string,
      role: (payload.role as "admin" | "user") || "user",
      cpf: payload.cpf as string,
      usuario_login: payload.usuario_login as string,
      nome: payload.nome as string,
      email: payload.email as string,
      area: (payload.area as string | null) || null,
    }
  } catch (error) {
    console.error("[Auth] Token verification failed:", error)
    return null
  }
}

export function getTokenFromRequest(request: Request): string | null {
  const authHeader = request.headers.get("authorization")
  if (!authHeader?.startsWith("Bearer ")) {
    return null
  }
  return authHeader.substring(7)
}
