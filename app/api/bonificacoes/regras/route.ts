import { NextRequest, NextResponse } from "next/server"
import { getDBConnection } from "@/lib/db"
import { buildChaveKey } from "@/utils/bonificacao"
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

function getOperadoraAliases(value: string): string[] {
  const v = String(value || "").trim()
  // Operadoras distintas: não agrupar aliases.
  // Mantemos apenas normalização para trim/case na comparação SQL.
  return [v]
}

export async function GET(request: NextRequest) {
  let connection: any = null
  
  try {
    // Verificar variáveis de ambiente
    if (!process.env.DB_HOST || !process.env.DB_USER || !process.env.DB_PASSWORD || !process.env.DB_NAME) {
      return NextResponse.json(
        { error: "Variáveis de ambiente não configuradas" },
        { status: 500 }
      )
    }

    // Criar conexão com charset UTF-8
    connection = await getDBConnection()
    
    // Garantir charset UTF-8 na conexão
    await connection.execute("SET NAMES 'utf8mb4' COLLATE 'utf8mb4_unicode_ci'")
    await connection.execute("SET CHARACTER SET utf8mb4")
    await connection.execute("SET character_set_connection=utf8mb4")

    // Extrair parâmetros
    const searchParams = request.nextUrl.searchParams
    const operadora = searchParams.get("operadora")
    const tipo_faixa = searchParams.get("tipo_faixa")
    const produto = searchParams.get("produto")
    const pagamento_por = searchParams.get("pagamento_por")
    const tipo_beneficiario = searchParams.get("tipo_beneficiario")
    const parcela = searchParams.get("parcela")
    const entidade = searchParams.get("entidade")
    const plano = searchParams.get("plano")
    const vigencia_inicio = searchParams.get("vigencia_inicio")
    const vigencia_fim = searchParams.get("vigencia_fim")
    const page = parseInt(searchParams.get("page") || "1")
    const pageSize = Math.min(parseInt(searchParams.get("pageSize") || "20"), 100)
    const sort = searchParams.get("sort") || "vigencia"
    const order = searchParams.get("order") || "desc"

    // Construir WHERE
    const whereConditions: string[] = []
    const whereValues: any[] = []

    if (operadora && operadora.trim()) {
      const aliases = getOperadoraAliases(operadora).map((x) => String(x).trim().toUpperCase())
      if (aliases.length > 1) {
        whereConditions.push(`UPPER(TRIM(operadora)) IN (${aliases.map(() => "?").join(", ")})`)
        whereValues.push(...aliases)
      } else {
        whereConditions.push("UPPER(TRIM(operadora)) = ?")
        whereValues.push(aliases[0])
      }
    }
    if (tipo_faixa && tipo_faixa.trim()) { whereConditions.push("tipo_faixa = ?"); whereValues.push(tipo_faixa.trim()) }
    if (produto && produto.trim()) { whereConditions.push("produto = ?"); whereValues.push(produto.trim()) }
    if (pagamento_por && pagamento_por.trim()) { whereConditions.push("pagamento_por = ?"); whereValues.push(pagamento_por.trim()) }
    if (tipo_beneficiario && tipo_beneficiario.trim()) { whereConditions.push("tipo_beneficiario = ?"); whereValues.push(tipo_beneficiario.trim()) }
    if (parcela && parcela.trim()) { whereConditions.push("parcela = ?"); whereValues.push(parcela.trim()) }
    if (entidade && entidade.trim()) { whereConditions.push("entidade LIKE ?"); whereValues.push(`%${entidade.trim()}%`) }
    if (plano && plano.trim()) { whereConditions.push("plano LIKE ?"); whereValues.push(`%${plano.trim()}%`) }
    if (vigencia_inicio && vigencia_inicio.trim()) { whereConditions.push("vigencia >= ?"); whereValues.push(vigencia_inicio.trim()) }
    if (vigencia_fim && vigencia_fim.trim()) { whereConditions.push("vigencia <= ?"); whereValues.push(vigencia_fim.trim()) }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(" AND ")}` : ""

    const tableName = await resolveRulesTable(connection)

    // Contar total
    const [countResult] = await connection.execute(
      `SELECT COUNT(*) as total FROM \`${tableName}\` ${whereClause}`,
      whereValues
    )
    const total = (countResult as any[])[0]?.total || 0

    // Paginar
    const offset = (page - 1) * pageSize

    // Ordenação fixa: 1) vigencia DESC, 2) registro DESC, 3) tipo_faixa ASC, 4) plano ASC (A-Z), 5) tipo_beneficiario DESC (Z-A - Titular antes de Dependente)
    // Buscar dados com ordenação fixa múltipla - planos iguais agrupados com Titular antes de Dependente
    let query = `SELECT * FROM \`${tableName}\` ${whereClause} ORDER BY \`vigencia\` DESC, \`registro\` DESC, \`tipo_faixa\` ASC, \`plano\` ASC, \`tipo_beneficiario\` DESC LIMIT ${pageSize} OFFSET ${offset}`
    
    const [rows] = await connection.execute(query, whereValues)
    
    return NextResponse.json(
      {
        data: rows || [],
        pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) }
      },
      {
        headers: {
          'Content-Type': 'application/json; charset=utf-8'
        }
      }
    )
  } catch (error) {
    console.error("Erro:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro desconhecido" },
      { status: 500 }
    )
  } finally {
    if (connection) {
      try { await connection.end() } catch (e) {}
    }
  }
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
function toSQLDecimal(value: any): number | null {
  if (value === undefined || value === null || value === "") return null
  if (typeof value === "number") return value
  
  // String no formato brasileiro: vírgula como separador decimal
  const sanitized = String(value).trim().replace(/\./g, "").replace(",", ".")
  const num = Number(sanitized)
  
  return isNaN(num) ? null : num
}

export async function POST(request: NextRequest) {
  let connection: any = null
  
  try {
    const body = await request.json().catch(() => ({}))
    
    // Validação dos campos obrigatórios
    if (!body.vigencia || !body.operadora || !body.entidade || !body.plano) {
      return NextResponse.json(
        { error: "Campos obrigatórios: vigencia, operadora, entidade, plano" },
        { status: 400 }
      )
    }

    // Verificar variáveis de ambiente
    if (!process.env.DB_HOST || !process.env.DB_USER || !process.env.DB_PASSWORD || !process.env.DB_NAME) {
      return NextResponse.json(
        { error: "Variáveis de ambiente não configuradas" },
        { status: 500 }
      )
    }

    // Criar conexão
    connection = await getDBConnection()
    
    // Garantir charset UTF-8 na conexão
    await connection.execute("SET NAMES 'utf8mb4' COLLATE 'utf8mb4_unicode_ci'")
    await connection.execute("SET CHARACTER SET utf8mb4")
    await connection.execute("SET character_set_connection=utf8mb4")

    const tableName = await resolveRulesTable(connection)

    // Normalizar dados
    const normalizedData = {
      vigencia: toSQLDate(body.vigencia),
      operadora: body.operadora || null,
      entidade: body.entidade || null,
      plano: body.plano || null,
      bonificacao_corretor: toSQLDecimal(body.bonificacaoCorretor || body.bonificacao_corretor),
      bonificacao_supervisor: toSQLDecimal(body.bonificacaoSupervisor || body.bonificacao_supervisor),
      parcela: body.parcela || null,
      tipo_faixa: body.tipoFaixa || body.tipo_faixa || null,
      pagamento_por: body.pagamentoPor || body.pagamento_por || null,
      tipo_beneficiario: body.tipoBeneficiario || body.tipo_beneficiario || null,
      produto: body.produto || null,
    }

    // Gerar chave usando os dados normalizados
    const chave = buildChaveKey({
      vigencia: normalizedData.vigencia,
      operadora: normalizedData.operadora,
      entidade: normalizedData.entidade,
      parcela: normalizedData.parcela,
      plano: normalizedData.plano,
      tipo_faixa: normalizedData.tipo_faixa,
      tipo_dependente: normalizedData.tipo_beneficiario, // mapear tipo_beneficiario para tipo_dependente
      produto: normalizedData.produto,
    })

    // Data atual para o campo registro (apenas data, sem hora)
    const now = new Date()
    const registro = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

    // Preparar dados para INSERT
    const insertData = {
      ...normalizedData,
      chave,
      registro,
    }

    // Construir SQL INSERT
    const columns = Object.keys(insertData)
    const placeholders = columns.map(() => "?").join(", ")
    const values = Object.values(insertData)

    const sql = `INSERT INTO \`${tableName}\` (${columns.map(col => `\`${col}\``).join(", ")}) VALUES (${placeholders})`
    
    const [result] = await connection.execute(sql, values)

    return NextResponse.json({ 
      ok: true, 
      inserted: result,
      chave: chave,
      registro: registro
    })

  } catch (error) {
    console.error("Erro:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro desconhecido" },
      { status: 500 }
    )
  } finally {
    if (connection) {
      try { await connection.end() } catch (e) {}
    }
  }
}
