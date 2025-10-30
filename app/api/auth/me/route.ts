import { type NextRequest, NextResponse } from "next/server"
import { jwtVerify } from "jose"

export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get("token")?.value || request.headers.get("authorization")?.replace("Bearer ", "")

    if (!token) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
    }

    const secret = new TextEncoder().encode(process.env.JWT_SECRET || "your-secret-key-change-in-production")

    const { payload } = await jwtVerify(token, secret)

    return NextResponse.json({
      user: {
        id: payload.userId,
        role: payload.role,
        cpf: payload.cpf,
        usuario_login: payload.usuario_login,
        nome: payload.nome,
        email: payload.email,
        area: payload.area,
      },
    })
  } catch (error) {
    console.error("[Auth] Token verification error:", error)
    return NextResponse.json({ error: "Token inválido" }, { status: 401 })
  }
}
