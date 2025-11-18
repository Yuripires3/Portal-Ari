export const dynamic = "force-dynamic"
export const revalidate = 0
export const fetchCache = "force-no-store"

import { NextRequest, NextResponse } from "next/server"
import { getDBConnection } from "@/lib/db"

/**
 * GET /api/beneficiarios/detalhados
 * Retorna lista detalhada de beneficiários com procedimentos
 * 
 * Filtros aplicados:
 * - Exclui planos que contenham 'DENT', 'AESP' e 'STANDARD'
 * - Retorna apenas linhas que possuem procedimentos (evento não nulo)
 * 
 * Parâmetros:
 * - data_inicio: YYYY-MM-DD (primeiro dia do mês de referência inicial)
 * - data_fim: YYYY-MM-DD (último dia do mês de referência final)
 * - operadoras: string separada por vírgula (opcional)
 * - entidades: string separada por vírgula (opcional)
 * - tipo: string (opcional, "Todos" ignora o filtro)
 * - pagina: número (opcional, padrão 1)
 * - limite: número (opcional, padrão 20)
 */
export async function GET(request: NextRequest) {
  let connection: any = null

  try {
    connection = await getDBConnection()
    
    const searchParams = request.nextUrl.searchParams
    const dataInicio = searchParams.get("data_inicio")
    const dataFim = searchParams.get("data_fim")
    const operadorasParam = searchParams.get("operadoras") || searchParams.get("operadora")
    const entidadesParam = searchParams.get("entidades")
    const tipo = searchParams.get("tipo")
    const pagina = parseInt(searchParams.get("pagina") || "1")
    const limite = parseInt(searchParams.get("limite") || "20")
    const offset = (pagina - 1) * limite

    if (!dataInicio || !dataFim) {
      return NextResponse.json(
        { error: "data_inicio e data_fim são obrigatórios" },
        { status: 400 }
      )
    }

    // Normalizar data_fim para último dia do mês
    // Se dataFim já está no formato YYYY-MM-DD, extrair ano e mês e calcular último dia
    const parseDateToLastOfMonth = (dateStr: string): string => {
      // Se já está no formato YYYY-MM-DD, extrair diretamente
      const parts = dateStr.split("-")
      if (parts.length >= 2) {
        const year = parseInt(parts[0])
        const month = parseInt(parts[1]) // mês em formato 1-12
        // Validar mês
        if (month < 1 || month > 12) {
          throw new Error(`Mês inválido: ${month}`)
        }
        // Calcular último dia do mês: new Date(year, month, 0) retorna último dia do mês anterior
        // Então new Date(year, month, 0) onde month está em formato 1-12 retorna último dia do mês (month-1)
        // Para pegar último dia do mês atual, usamos new Date(year, month, 0)
        const lastDay = new Date(year, month, 0).getDate()
        return `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`
      }
      // Fallback: usar Date
      const date = new Date(dateStr)
      if (isNaN(date.getTime())) {
        throw new Error(`Data inválida: ${dateStr}`)
      }
      const year = date.getFullYear()
      const month = date.getMonth() + 1
      const lastDay = new Date(year, month, 0).getDate()
      return `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`
    }

    let dataFimNormalizada: string
    try {
      dataFimNormalizada = parseDateToLastOfMonth(dataFim)
    } catch (error: any) {
      console.error("Erro ao normalizar data_fim:", error, "dataFim recebida:", dataFim)
      return NextResponse.json(
        { error: `Data fim inválida: ${dataFim}. ${error.message}` },
        { status: 400 }
      )
    }

    // Construir filtros WHERE para beneficiários
    const whereConditions: string[] = []
    const whereValues: any[] = []

    // Condições obrigatórias para beneficiários ativos
    whereConditions.push("b.data_inicio_vigencia_beneficiario <= ?")
    whereValues.push(dataFimNormalizada)
    
    whereConditions.push(`(
      (b.data_exclusao IS NULL AND b.status_beneficiario = 'ativo')
      OR (b.data_exclusao IS NOT NULL AND (
        b.data_exclusao > CURDATE()
        OR b.data_exclusao > ?
      ))
    )`)
    whereValues.push(dataFimNormalizada)

    // Filtros opcionais
    if (operadorasParam) {
      const operadoras = operadorasParam.split(",").map(op => op.trim()).filter(Boolean)
      if (operadoras.length > 0) {
        whereConditions.push(`b.operadora IN (${operadoras.map(() => "?").join(",")})`)
        whereValues.push(...operadoras)
      }
    }

    if (entidadesParam) {
      const entidades = entidadesParam.split(",").map(e => e.trim()).filter(Boolean)
      if (entidades.length > 0) {
        whereConditions.push(`b.entidade IN (${entidades.map(() => "?").join(",")})`)
        whereValues.push(...entidades)
      }
    }

    if (tipo && tipo !== "Todos") {
      whereConditions.push("b.tipo = ?")
      whereValues.push(tipo)
    }

    // Excluir planos que contenham 'DENT', 'AESP' e 'STANDARD'
    whereConditions.push(`(
      UPPER(b.plano) NOT LIKE '%DENT%' 
      AND UPPER(b.plano) NOT LIKE '%AESP%' 
      AND UPPER(b.plano) NOT LIKE '%STANDARD%'
    )`)

    const whereClause = whereConditions.length > 0 
      ? `WHERE ${whereConditions.join(" AND ")}` 
      : ""

    // Query para buscar beneficiários ativos no período e seus procedimentos
    // Excluir planos DENT, AESP e STANDARD
    // Mostrar apenas linhas que tenham procedimentos (INNER JOIN)
    const query = `
      SELECT DISTINCT
        b.operadora as OPERADORA,
        b.plano as PLANO,
        b.cpf as CPF,
        b.nome as NOME,
        b.entidade as ENTIDADE,
        b.status_beneficiario as STATUS,
        b.idade as IDADE,
        p.evento as EVENTO,
        p.descricao as DESCRICAO,
        p.especialidade as ESPECIALIDADE,
        p.valor_procedimento as VALOR,
        p.data_competencia as DATA_COMPETENCIA
      FROM reg_beneficiarios b
      INNER JOIN reg_procedimentos p ON b.cpf = p.cpf 
        AND p.data_competencia >= ? 
        AND p.data_competencia <= ?
      ${whereClause}
      AND p.evento IS NOT NULL
      ORDER BY b.nome, p.data_competencia DESC
      LIMIT ${limite} OFFSET ${offset}
    `

    const [rows]: any = await connection.execute(query, [
      dataInicio,
      dataFimNormalizada,
      ...whereValues
    ])

    // Buscar total de registros para paginação
    // Excluir planos DENT, AESP e STANDARD e mostrar apenas com procedimentos
    const countQuery = `
      SELECT COUNT(DISTINCT CONCAT(b.cpf, '-', p.evento, '-', p.data_competencia)) as total
      FROM reg_beneficiarios b
      INNER JOIN reg_procedimentos p ON b.cpf = p.cpf 
        AND p.data_competencia >= ? 
        AND p.data_competencia <= ?
      ${whereClause}
      AND p.evento IS NOT NULL
    `

    const [countRows]: any = await connection.execute(countQuery, [
      dataInicio,
      dataFimNormalizada,
      ...whereValues
    ])

    const total = countRows[0]?.total || 0

    return NextResponse.json({
      dados: rows || [],
      total,
      pagina,
      limite,
      totalPaginas: Math.ceil(total / limite)
    })
  } catch (error: any) {
    console.error("Erro ao buscar beneficiários detalhados:", error)
    return NextResponse.json(
      { error: error.message || "Erro ao buscar dados detalhados" },
      { status: 500 }
    )
  } finally {
    if (connection) {
      await connection.end()
    }
  }
}

