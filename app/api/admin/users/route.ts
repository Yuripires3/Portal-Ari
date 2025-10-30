import { NextRequest, NextResponse } from "next/server"
import { getDBConnection } from "@/lib/db"
import { hashPassword, validateArea, validateCPF, validateEmail, validatePasswordStrength, validateUsuarioLogin, normalizeCPF } from "@/lib/security"
import { jwtVerify } from "jose"

async function requireAdminFromRequest(request: NextRequest) {
  const token = request.cookies.get("token")?.value || request.headers.get("authorization")?.replace("Bearer ", "")
  if (!token) return { ok: false, error: "Não autenticado" }
  const secret = new TextEncoder().encode(process.env.JWT_SECRET || "your-secret-key-change-in-production")
  try {
    const { payload } = await jwtVerify(token, secret)
    const role = (payload.role as string) || "user"
    if (role !== "admin") return { ok: false, error: "Acesso negado" }
    return { ok: true }
  } catch {
    return { ok: false, error: "Token inválido" }
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAdminFromRequest(request)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 })

  let connection: any = null
  try {
    const body = await request.json()
    const { cpf, nome, email, area, usuario_login, senha, classificacao } = body

    const errors: string[] = []

    const normalizedCPF = normalizeCPF(String(cpf || ""))
    if (!validateCPF(normalizedCPF)) errors.push("CPF inválido")

    if (!nome || String(nome).trim().length === 0 || String(nome).trim().length > 150) errors.push("Nome inválido")

    if (!validateEmail(String(email || ""))) errors.push("Email inválido")

    if (area && !validateArea(String(area))) errors.push("Área inválida")

    const userVal = validateUsuarioLogin(String(usuario_login || ""))
    if (!userVal.valid) errors.push(userVal.error || "Usuário inválido")

    const passVal = validatePasswordStrength(String(senha || ""))
    if (!passVal.valid) errors.push(...passVal.errors)

    if (classificacao && !["ADMIN", "USER", "USUARIO", "admin", "user", "usuario"].includes(String(classificacao))) {
      errors.push("Classificação inválida (use ADMIN ou USUARIO)")
    }
    if (errors.length) return NextResponse.json({ error: "Erro de validação", details: errors }, { status: 400 })

    connection = await getDBConnection()

    // Checar duplicidade
    const [existing] = await connection.execute(
      `SELECT id, cpf, email, usuario_login FROM registro_usuarios_web_bonificacao WHERE cpf = ? OR email = ? OR usuario_login = ?`,
      [normalizedCPF, String(email).trim().toLowerCase(), String(usuario_login).trim()]
    )
    if ((existing as any[]).length > 0) {
      return NextResponse.json({ error: "CPF, email ou usuário já cadastrado" }, { status: 409 })
    }

    const senhaHash = await hashPassword(String(senha))

    // Gerar próximo ID sequencial zero-padded (5 dígitos), armazenado em VARCHAR(10)
    const [maxRows] = await connection.execute(
      `SELECT MAX(CAST(id AS UNSIGNED)) as max_id FROM registro_usuarios_web_bonificacao`
    )
    const max_id = (maxRows as any[])[0]?.max_id ?? 0
    const nextIdNum = Number(max_id) + 1
    const nextId = String(nextIdNum).padStart(5, "0")

    await connection.execute(
      `INSERT INTO registro_usuarios_web_bonificacao (id, cpf, nome, email, area, usuario_login, senha, classificacao) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        nextId,
        normalizedCPF,
        String(nome).trim(),
        String(email).trim().toLowerCase(),
        area || null,
        String(usuario_login).trim(),
        senhaHash,
        (() => { const c = (classificacao ? String(classificacao).toUpperCase() : "USUARIO"); return c === "USUARIO" ? "USER" : c; })(),
      ]
    )

    return NextResponse.json({ success: true, user: { id: nextId, cpf: normalizedCPF, nome, email, area: area || null, usuario_login, classificacao: (classificacao ? String(classificacao).toUpperCase() : "USUARIO") } }, { status: 201 })
  } catch (error) {
    console.error("[Admin Users] Erro:", error)
    return NextResponse.json({ error: "Erro interno" }, { status: 500 })
  } finally {
    if (connection) {
      try { await connection.end() } catch {}
    }
  }
}

export async function GET(request: NextRequest) {
  const auth = await requireAdminFromRequest(request)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 })

  let connection: any = null
  try {
    connection = await getDBConnection()
    const [rows] = await connection.execute(
      `SELECT id, cpf, nome, email, area, usuario_login, classificacao, data_cadastro, data_alteracao FROM registro_usuarios_web_bonificacao ORDER BY data_cadastro DESC`
    )
    return NextResponse.json({ users: rows })
  } catch (error) {
    console.error("[Admin Users] List error:", error)
    return NextResponse.json({ error: "Erro interno" }, { status: 500 })
  } finally {
    if (connection) {
      try { await connection.end() } catch {}
    }
  }
}


