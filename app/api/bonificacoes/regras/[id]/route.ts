import { NextRequest, NextResponse } from "next/server"
import { buildChaveKey } from "@/utils/bonificacao"
import { getDBConnection } from "@/lib/db"
import { formatDateISO } from "@/lib/date-utils"

async function resolveRulesTable(connection: any): Promise<string> {
  const candidates = ["registro_bonificacao_valores_v2", "registro_bonificacao_valores"]
  for (const table of candidates) {
    try {
      await connection.execute(`SELECT 1 FROM \`${table}\` LIMIT 1`)
      return table
    } catch {
      // tenta próxima candidata
    }
  }
  return "registro_bonificacao_valores_v2"
}

// Converte para YYYY-MM-DD (sem hora) - garante formato correto para MySQL DATE
function toSQLDate(date: any): string | null {
  if (!date) return null
  
  // Se já está no formato YYYY-MM-DD, retorna direto
  if (typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return date
  }
  
  const d = new Date(date)
  if (isNaN(d.getTime())) return null
  
  // Garante YYYY-MM-DD usando formatação consistente
  return formatDateISO(d) || null
}

// Converte valores decimais com vírgula/ponto para número real
// Exemplos: "1200,50" -> 1200.5, "1.200,50" -> 1200.5, "1200.50" -> 1200.5
function toSQLDecimal(value: any): number | null {
  if (value === undefined || value === null || value === "") return null
  if (typeof value === "number") {
    return value
  }
  
  // String no formato brasileiro: vírgula como separador decimal
  // Ex: "1200,50", "1.200,50" -> converte para número JS 1200.5
  const sanitized = String(value).trim().replace(/\./g, "").replace(",", ".")
  const num = Number(sanitized)

  return isNaN(num) ? null : num
}

export async function PUT(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  let connection: any = null
  try {
    const body = await req.json().catch(() => ({}))
    
    // Next.js 15+ requires awaiting params
    const params = await context.params
    const idRaw = params?.id ?? body?.id
    const id = Number(idRaw)
    
    if (!id || Number.isNaN(id)) {
      return NextResponse.json({ error: "id inválido" }, { status: 400 })
    }

    connection = await getDBConnection()
    await connection.execute("SET NAMES 'utf8mb4' COLLATE 'utf8mb4_unicode_ci'")
    await connection.execute("SET CHARACTER SET utf8mb4")
    await connection.execute("SET character_set_connection=utf8mb4")

    const tableName = await resolveRulesTable(connection)

    // Buscar registro atual do banco para obter todos os campos (não apenas os editados)
    const [currentRows] = await connection.execute(
      `SELECT * FROM \`${tableName}\` WHERE id = ?`,
      [id]
    )
    const currentData = (currentRows as any[])[0]
    
    if (!currentData) {
      return NextResponse.json({ error: "Registro não encontrado" }, { status: 404 })
    }

    // Merge dos dados atuais com os novos dados do body
    const mergedData = {
      ...currentData,
      ...(body.hasOwnProperty("vigencia") && { vigencia: toSQLDate(body.vigencia) }),
      ...(body.hasOwnProperty("operadora") && { operadora: body.operadora ?? null }),
      ...(body.hasOwnProperty("entidade") && { entidade: body.entidade ?? null }),
      ...(body.hasOwnProperty("plano") && { plano: body.plano ?? null }),
      ...(body.hasOwnProperty("bonificacao_corretor") && { bonificacao_corretor: toSQLDecimal(body.bonificacao_corretor) }),
      ...(body.hasOwnProperty("bonificacao_supervisor") && { bonificacao_supervisor: toSQLDecimal(body.bonificacao_supervisor) }),
      ...(body.hasOwnProperty("parcela") && { parcela: body.parcela ?? null }),
      ...(body.hasOwnProperty("tipo_faixa") && { tipo_faixa: body.tipo_faixa ?? null }),
      ...(body.hasOwnProperty("pagamento_por") && { pagamento_por: body.pagamento_por ?? null }),
      ...(body.hasOwnProperty("tipo_beneficiario") && { tipo_beneficiario: body.tipo_beneficiario ?? null }),
      ...(body.hasOwnProperty("produto") && { produto: body.produto ?? null }),
    }

    // Recalcular a chave usando os dados mergeados
    const chave = buildChaveKey({
      vigencia: mergedData.vigencia,
      operadora: mergedData.operadora,
      entidade: mergedData.entidade,
      parcela: mergedData.parcela,
      plano: mergedData.plano,
      tipo_faixa: mergedData.tipo_faixa,
      tipo_dependente: mergedData.tipo_beneficiario, // mapear tipo_beneficiario para tipo_dependente
      produto: mergedData.produto,
    })

    // Monte apenas o que chegou no body para o UPDATE
    const candidate: Record<string, any> = {
      vigencia: body.hasOwnProperty("vigencia") ? toSQLDate(body.vigencia) : undefined,
      operadora: body.hasOwnProperty("operadora") ? (body.operadora ?? null) : undefined,
      entidade: body.hasOwnProperty("entidade") ? (body.entidade ?? null) : undefined,
      plano: body.hasOwnProperty("plano") ? (body.plano ?? null) : undefined,
      bonificacao_corretor: body.hasOwnProperty("bonificacao_corretor")
        ? toSQLDecimal(body.bonificacao_corretor)
        : undefined,
      bonificacao_supervisor: body.hasOwnProperty("bonificacao_supervisor")
        ? toSQLDecimal(body.bonificacao_supervisor)
        : undefined,
      parcela: body.hasOwnProperty("parcela") ? (body.parcela ?? null) : undefined,
      tipo_faixa: body.hasOwnProperty("tipo_faixa") ? (body.tipo_faixa ?? null) : undefined,
      pagamento_por: body.hasOwnProperty("pagamento_por") ? (body.pagamento_por ?? null) : undefined,
      tipo_beneficiario: body.hasOwnProperty("tipo_beneficiario") ? (body.tipo_beneficiario ?? null) : undefined,
      produto: body.hasOwnProperty("produto") ? (body.produto ?? null) : undefined,
      // Sempre incluir a chave recalculada
      chave: chave,
    }

    // Só inclui campos presentes (v !== undefined). NULL é permitido.
    const entries = Object.entries(candidate).filter(([, v]) => v !== undefined)
    
    if (entries.length === 0) {
      return NextResponse.json({ error: "Nenhum campo para atualizar" }, { status: 400 })
    }

    const setSql = entries.map(([k]) => `\`${k}\` = ?`).join(", ")
    const values = entries.map(([, v]) => v) // aqui não haverá undefined
    values.push(id)

    const sql = `UPDATE \`${tableName}\` SET ${setSql} WHERE id = ?`
    
    const [result] = await connection.execute(sql, values)

    return NextResponse.json({ ok: true, updated: result })
  } catch (e: any) {
    console.error("Erro:", e)
    // devolve texto legível para o client
    return NextResponse.json({ error: e?.message || "Erro inesperado" }, { status: 500 })
  } finally {
    if (connection) {
      try {
        await connection.end()
      } catch (error) {}
    }
  }
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  let connection: any = null
  try {
    // Next.js 15+ requires awaiting params
    const params = await context.params

    const idRaw = params?.id
    const id = Number(idRaw)
    if (!id || Number.isNaN(id)) {
      return NextResponse.json({ error: "ID inválido" }, { status: 400 })
    }

    connection = await getDBConnection()
    await connection.execute("SET NAMES 'utf8mb4' COLLATE 'utf8mb4_unicode_ci'")
    await connection.execute("SET CHARACTER SET utf8mb4")
    await connection.execute("SET character_set_connection=utf8mb4")

    const tableName = await resolveRulesTable(connection)
    const [result] = await connection.execute(
      `DELETE FROM \`${tableName}\` WHERE id = ?`,
      [id]
    )

    return NextResponse.json({ ok: true, deleted: result })
  } catch (e: any) {
    console.error("Erro ao excluir:", e)
    return NextResponse.json({ error: e?.message || "Erro inesperado" }, { status: 500 })
  } finally {
    if (connection) {
      try {
        await connection.end()
      } catch (error) {}
    }
  }
}
