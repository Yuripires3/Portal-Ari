import { NextRequest, NextResponse } from "next/server"
import { getDBConnection } from "@/lib/db"
import { hashPassword, normalizeCPF } from "@/lib/security"

/**
 * Rota para criar o usuário admin caso não exista
 * Pode ser chamada via GET ou POST para inicializar
 */
export async function GET(request: NextRequest) {
  return await seedAdmin()
}

export async function POST(request: NextRequest) {
  return await seedAdmin()
}

async function seedAdmin() {
  let connection: any = null

  try {
    connection = await getDBConnection()

    // Verificar se já existe admin
    const [existing] = await connection.execute(
      `SELECT id FROM registro_usuarios_web_bonificacao 
       WHERE usuario_login = 'admin' OR email = 'ti@qvsaude.com.br'`
    )

    const existingArray = existing as any[]

    if (existingArray.length > 0) {
      return NextResponse.json({
        success: true,
        message: "Usuário admin já existe",
        user_id: existingArray[0].id,
      })
    }

    // Criar admin
    const adminCPF = normalizeCPF("000.000.000-00")
    const adminSenhaHash = await hashPassword("Qv@2025")

    // Gerar id sequencial
    const [maxRows] = await connection.execute(`SELECT MAX(CAST(id AS UNSIGNED)) as max_id FROM registro_usuarios_web_bonificacao`)
    const max_id = (maxRows as any[])[0]?.max_id ?? 0
    const nextIdNum = Number(max_id) + 1
    const nextId = String(nextIdNum).padStart(5, "0")

    await connection.execute(
      `INSERT INTO registro_usuarios_web_bonificacao 
       (id, cpf, nome, email, area, usuario_login, senha, classificacao) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [nextId, "000.000.000-00", "Administrador do Sistema", "ti@qvsaude.com.br", "Financeiro", "admin", adminSenhaHash, "ADMIN"]
    )

    const insertResult = result as any

    return NextResponse.json({
      success: true,
      message: "Usuário admin criado com sucesso",
      user_id: insertResult.insertId,
    })
  } catch (error) {
    console.error("Erro ao criar admin:", error)
    return NextResponse.json(
      { error: "Erro ao criar usuário admin", details: error instanceof Error ? error.message : "Erro desconhecido" },
      { status: 500 }
    )
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

