import { type NextRequest, NextResponse } from "next/server"
import { SignJWT } from "jose"
import { getDBConnection } from "@/lib/db"
import { comparePassword } from "@/lib/security"

interface LoginBody {
  login: string // email ou usuario_login
  senha: string
}

export async function POST(request: NextRequest) {
  let connection: any = null

  try {
    const body: LoginBody = await request.json()
    const { login, senha } = body

    if (!login || !senha) {
      return NextResponse.json({ error: "Credenciais inválidas" }, { status: 401 })
    }

    console.log("[Auth] Login attempt:", { login: login.substring(0, 3) + "***" })

    // Conectar ao banco
    connection = await getDBConnection()

    // Buscar usuário por email ou usuario_login
    const [users] = await connection.execute(
      `SELECT id, cpf, nome, email, area, usuario_login, senha, classificacao 
       FROM registro_usuarios_web_bonificacao 
       WHERE email = ? OR usuario_login = ?`,
      [login.trim().toLowerCase(), login.trim()]
    )

    const userArray = users as any[]

    if (userArray.length === 0) {
      console.log("[Auth] Login failed: User not found", { searchedFor: login.trim() })
      return NextResponse.json({ error: "Credenciais inválidas" }, { status: 401 })
    }

    const user = userArray[0]

    // Verificar se senha está hashada
    const isBcryptHash = user.senha.startsWith("$2a$") || user.senha.startsWith("$2b$") || user.senha.startsWith("$2y$")

    if (!isBcryptHash) {
      console.error("[Auth] Senha não está hashada no banco para usuário:", user.usuario_login)
      return NextResponse.json(
        { error: "Senha não configurada corretamente no banco." },
        { status: 500 }
      )
    }

    // Comparar senha
    let passwordMatch = false
    try {
      passwordMatch = await comparePassword(senha, user.senha)
    } catch (error) {
      console.error("[Auth] Erro ao comparar senha:", error)
      return NextResponse.json({ error: "Erro ao verificar senha" }, { status: 500 })
    }

    if (!passwordMatch) {
      console.log("[Auth] Login failed: Invalid password for user:", user.usuario_login)
      return NextResponse.json({ error: "Credenciais inválidas" }, { status: 401 })
    }

    // Determinar role pela coluna 'classificacao' (ADMIN/USER)
    const isAdmin = String(user.classificacao || "").toUpperCase() === "ADMIN"
    const role: "admin" | "user" = isAdmin ? "admin" : "user"

    console.log("[Auth] Login successful for user:", user.usuario_login, "role:", role)

    // Create JWT token
    const secret = new TextEncoder().encode(process.env.JWT_SECRET || "your-secret-key-change-in-production")

    const token = await new SignJWT({
      userId: user.id.toString(),
      role,
      cpf: user.cpf,
      usuario_login: user.usuario_login,
      nome: user.nome,
      email: user.email,
      area: user.area,
      classificacao: user.classificacao,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("24h")
      .sign(secret)

    // Retornar dados do usuário (sem senha)
    const userResponse = {
      id: user.id,
      cpf: user.cpf,
      nome: user.nome,
      email: user.email,
      area: user.area,
      usuario_login: user.usuario_login,
      role,
    }

    const redirectPath = role === "admin" ? "/admin" : "/admin" // Por enquanto ambos vão para admin

    const response = NextResponse.json(
      {
        access_token: token,
        token_type: "bearer",
        user: userResponse,
        redirect: redirectPath,
      },
      { status: 200 }
    )

    response.cookies.set("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24, // 24 hours
      path: "/",
    })

    return response
  } catch (error) {
    console.error("[Auth] Login error:", error)
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 })
  } finally {
    if (connection) {
      try {
        await connection.end()
      } catch (e) {
        // Ignore
      }
    }
  }
}
