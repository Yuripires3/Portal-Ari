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

export async function PUT(request: NextRequest, context: { params: Promise<{ id: string }> } | { params: { id: string } }) {
  const auth = await requireAdminFromRequest(request)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 })

  // Compat: params pode ser Promise em Next mais recente
  const ctx: any = context as any
  const p = typeof ctx.params?.then === "function" ? await ctx.params : ctx.params
  let idRaw = (p?.id ?? "").toString().trim()
  if (!idRaw) {
    try {
      const url = new URL(request.url)
      const seg = url.pathname.split("/")
      idRaw = (seg[seg.length - 1] || "").trim()
    } catch {}
  }
  const idStr = idRaw
  if (!/^\d+$/.test(idStr)) return NextResponse.json({ error: "ID inválido" }, { status: 400 })

  let connection: any = null
  try {
    const body = await request.json()
    const { cpf, nome, email, area, usuario_login, senha, classificacao } = body

    const updates: string[] = []
    const values: any[] = []

    if (cpf) {
      const normalized = normalizeCPF(String(cpf))
      if (!validateCPF(normalized)) return NextResponse.json({ error: "CPF inválido" }, { status: 400 })
      updates.push("cpf = ?"); values.push(normalized)
    }
    if (nome) { updates.push("nome = ?"); values.push(String(nome).trim()) }
    if (email) {
      if (!validateEmail(String(email))) return NextResponse.json({ error: "Email inválido" }, { status: 400 })
      updates.push("email = ?"); values.push(String(email).trim().toLowerCase())
    }
    if (area !== undefined) {
      if (area !== null && !validateArea(String(area))) return NextResponse.json({ error: "Área inválida" }, { status: 400 })
      updates.push("area = ?"); values.push(area || null)
    }
    if (usuario_login) {
      const v = validateUsuarioLogin(String(usuario_login))
      if (!v.valid) return NextResponse.json({ error: v.error || "Usuário inválido" }, { status: 400 })
      updates.push("usuario_login = ?"); values.push(String(usuario_login).trim())
    }
    if (classificacao !== undefined) {
      const raw = String(classificacao).toUpperCase()
      const val = raw === "USUARIO" ? "USER" : raw
      if (!["ADMIN", "USER"].includes(val)) return NextResponse.json({ error: "Classificação inválida" }, { status: 400 })
      updates.push("classificacao = ?"); values.push(val)
    }
    if (senha) {
      const v = validatePasswordStrength(String(senha))
      if (!v.valid) return NextResponse.json({ error: v.errors?.join(", ") }, { status: 400 })
      const hash = await hashPassword(String(senha))
      updates.push("senha = ?"); values.push(hash)
    }

    if (updates.length === 0) return NextResponse.json({ error: "Nada para atualizar" }, { status: 400 })

    connection = await getDBConnection()

    // Checar duplicidades quando email/usuario_login/cpf foram alterados
    if (cpf || email || usuario_login) {
      const [dups] = await connection.execute(
        `SELECT id FROM registro_usuarios_web_bonificacao WHERE (cpf = ? OR email = ? OR usuario_login = ?) AND id <> ?`,
        [body.cpf ? normalizeCPF(String(body.cpf)) : "", body.email ? String(body.email).toLowerCase() : "", body.usuario_login || "", idStr]
      )
      if ((dups as any[]).length > 0) return NextResponse.json({ error: "CPF, email ou usuário já cadastrado" }, { status: 409 })
    }

    const sql = `UPDATE registro_usuarios_web_bonificacao SET ${updates.join(", ")} WHERE id = ?`
    values.push(idStr)
    await connection.execute(sql, values)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[Admin Users] Update error:", error)
    return NextResponse.json({ error: "Erro interno" }, { status: 500 })
  } finally {
    if (connection) { try { await connection.end() } catch {} }
  }
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> | { id: string } }) {
  const auth = await requireAdminFromRequest(request)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 })

  const ctx: any = context as any
  const p = typeof ctx.params?.then === "function" ? await ctx.params : ctx.params
  let idRaw = (p?.id ?? "").toString().trim()
  if (!idRaw) {
    try { const url = new URL(request.url); const seg = url.pathname.split("/"); idRaw = (seg[seg.length - 1] || "").trim() } catch {}
  }
  const idStrDel = idRaw
  if (!/^\d+$/.test(idStrDel)) return NextResponse.json({ error: "ID inválido" }, { status: 400 })

  let connection: any = null
  try {
    connection = await getDBConnection()
    await connection.execute(`DELETE FROM registro_usuarios_web_bonificacao WHERE id = ?`, [idStrDel])
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[Admin Users] Delete error:", error)
    return NextResponse.json({ error: "Erro interno" }, { status: 500 })
  } finally {
    if (connection) { try { await connection.end() } catch {} }
  }
}


