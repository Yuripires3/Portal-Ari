export const dynamic = "force-dynamic"
export const revalidate = 0
export const fetchCache = "force-no-store"

import { NextRequest, NextResponse } from "next/server"
import { getDBConnection } from "@/lib/db"

/**
 * GET /api/beneficiarios/ativos
 * Retorna contagem de vidas ativas por mês de referência
 * 
 * Parâmetros:
 * - data_inicio: YYYY-MM-DD (primeiro dia do mês de referência inicial)
 * - data_fim: YYYY-MM-DD (primeiro dia do mês de referência final)
 * - operadoras: string separada por vírgula (opcional, múltiplas operadoras)
 * - entidades: string separada por vírgula (opcional)
 * - tipo: string (opcional, "Todos" ignora o filtro)
 */
export async function GET(request: NextRequest) {
  let connection: any = null

  try {
    connection = await getDBConnection()
    
    const searchParams = request.nextUrl.searchParams
    const dataInicio = searchParams.get("data_inicio")
    const dataFim = searchParams.get("data_fim")
    const operadorasParam = searchParams.get("operadoras") || searchParams.get("operadora") // Suporta ambos para compatibilidade
    const entidadesParam = searchParams.get("entidades")
    const tipo = searchParams.get("tipo")

    if (!dataInicio || !dataFim) {
      return NextResponse.json(
        { error: "data_inicio e data_fim são obrigatórios" },
        { status: 400 }
      )
    }

    // Normalizar datas para primeiro dia do mês (YYYY-MM-01)
    const parseDateToFirstOfMonth = (dateStr: string): string => {
      const date = new Date(dateStr)
      const year = date.getFullYear()
      const month = String(date.getMonth() + 1).padStart(2, "0")
      return `${year}-${month}-01`
    }

    const inicioNormalizado = parseDateToFirstOfMonth(dataInicio)
    const fimNormalizado = parseDateToFirstOfMonth(dataFim)

    // Gerar lista de meses: sempre exibir 12 meses retrocedendo a partir do mês mais recente filtrado (data_fim)
    // O mês mais recente filtrado + os 11 meses anteriores
    const meses: string[] = []
    
    // Extrair ano e mês do data_fim normalizado
    const [anoFimNormalizado, mesFimNormalizado] = fimNormalizado.split("-")
    const anoFimInt = parseInt(anoFimNormalizado)
    const mesFimInt = parseInt(mesFimNormalizado) // formato 1-12
    
    // Calcular 12 meses retrocedendo do mês mais recente
    // Começamos do mês mais antigo e vamos até o mais recente
    let ano = anoFimInt
    let mes = mesFimInt - 11 // Retroceder 11 meses
    
    // Ajustar se o mês ficou negativo (precisa voltar o ano)
    while (mes < 1) {
      mes += 12
      ano--
    }
    
    // Gerar os 12 meses
    for (let i = 0; i < 12; i++) {
      meses.push(`${ano}-${String(mes).padStart(2, "0")}`)
      
      // Avançar para o próximo mês
      mes++
      if (mes > 12) {
        mes = 1
        ano++
      }
    }

    // Construir filtros WHERE (tabela de beneficiários, alias b)
    const whereConditions: string[] = []
    const whereValues: any[] = []

    // Filtro fixo: considerar apenas beneficiários da operadora ASSIM SAÚDE
    whereConditions.push("UPPER(b.operadora) = 'ASSIM SAÚDE'")

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

    const whereClauseBenef = whereConditions.length > 0 
      ? `WHERE ${whereConditions.join(" AND ")}`
      : ""

    // OTIMIZAÇÃO CRÍTICA: Em vez de fazer 24 queries (loop de 12 meses), fazer uma única query otimizada
    // que calcula todos os meses de uma vez usando CTEs e agregações
    const apiStartTime = Date.now()
    
    // Calcular primeiro e último dia do período completo (12 meses)
    if (meses.length === 0) {
      return NextResponse.json([])
    }
    
    const primeiroMesStr = meses[0]
    const ultimoMesStr = meses[meses.length - 1]
    
    // Extrair componentes de data do primeiro mês
    const primeiroMesParts = primeiroMesStr.split("-")
    const anoInicioPeriodo = primeiroMesParts[0] || ""
    const mesInicioPeriodo = primeiroMesParts[1] || "01"
    
    // Extrair componentes de data do último mês
    const ultimoMesParts = ultimoMesStr.split("-")
    const anoFimPeriodo = ultimoMesParts[0] || ""
    const mesFimPeriodo = ultimoMesParts[1] || "01"
    
    // Construir datas do período
    const primeiroDiaPeriodo = `${anoInicioPeriodo}-${mesInicioPeriodo}-01`
    const anoFimNum = parseInt(anoFimPeriodo, 10)
    const mesFimNum = parseInt(mesFimPeriodo, 10)
    const ultimoDiaPeriodo = new Date(anoFimNum, mesFimNum, 0)
    const ultimoDiaPeriodoStr = ultimoDiaPeriodo.toISOString().split("T")[0]

    // Construir filtros WHERE para beneficiários na CTE beneficiarios_status
    const beneficiariosStatusWhereConditions: string[] = []
    const beneficiariosStatusWhereValues: any[] = []
    
    beneficiariosStatusWhereConditions.push("UPPER(b.operadora) = 'ASSIM SAÚDE'")
    
    if (operadorasParam) {
      const operadoras = operadorasParam.split(",").map(op => op.trim()).filter(Boolean)
      if (operadoras.length > 0) {
        beneficiariosStatusWhereConditions.push(`b.operadora IN (${operadoras.map(() => "?").join(",")})`)
        beneficiariosStatusWhereValues.push(...operadoras)
      }
    }

    if (entidadesParam) {
      const entidades = entidadesParam.split(",").map(e => e.trim()).filter(Boolean)
      if (entidades.length > 0) {
        beneficiariosStatusWhereConditions.push(`b.entidade IN (${entidades.map(() => "?").join(",")})`)
        beneficiariosStatusWhereValues.push(...entidades)
      }
    }

    if (tipo && tipo !== "Todos") {
      beneficiariosStatusWhereConditions.push("b.tipo = ?")
      beneficiariosStatusWhereValues.push(tipo)
    }

    const beneficiariosStatusWhereClause = beneficiariosStatusWhereConditions.length > 0
      ? `WHERE ${beneficiariosStatusWhereConditions.join(" AND ")}`
      : ""

    // Query única otimizada que calcula todos os meses de uma vez
    // Usa agregações condicionais em vez de CROSS JOIN para melhor performance
    const mesesValues = meses.map(mes => {
      const [ano, mesNum] = mes.split("-")
      const anoInt = parseInt(ano)
      const mesInt = parseInt(mesNum)
      const ultimoDia = new Date(anoInt, mesInt, 0)
      const ultimoDiaStr = ultimoDia.toISOString().split("T")[0]
      return { mes, ultimoDia: ultimoDiaStr }
    })

    const beneficiariosStatusWhereClauseWithBase = whereConditions.length > 0
      ? `${whereClauseBenef} AND`
      : "WHERE"

    // Query otimizada: calcula vidas ativas para todos os meses de uma vez
    const queryVidasAtivas = `
      SELECT
        ${mesesValues.map((mv, idx) => `
          COUNT(DISTINCT CASE 
            WHEN b.data_inicio_vigencia_beneficiario <= ? 
              AND (
                (b.data_exclusao IS NULL AND b.status_beneficiario = 'ativo')
                OR (b.data_exclusao IS NOT NULL AND b.data_exclusao > ?)
              )
            THEN b.id_beneficiario 
          END) AS vidas_ativas_${idx}
        `).join(", ")}
      FROM reg_beneficiarios b
      ${beneficiariosStatusWhereClauseWithBase} 1=1
    `

    const vidasAtivasParams = [
      ...whereValues,
      ...mesesValues.flatMap(mv => [mv.ultimoDia, mv.ultimoDia])
    ]

    const queryStartTime = Date.now()
    const [rowsVidasAtivas]: any = await connection.execute(queryVidasAtivas, vidasAtivasParams)
    const vidasAtivasPorMes = meses.map((_, idx) => Number(rowsVidasAtivas[0]?.[`vidas_ativas_${idx}`]) || 0)

    // Query para vidas com procedimento: uma única query que agrupa por mês
    const queryVidasComProcedimento = `
      WITH procedimentos_mes AS (
        SELECT
          DATE_FORMAT(p.data_competencia, '%Y-%m') AS mes,
          p.cpf
        FROM reg_procedimentos p
        WHERE
          UPPER(p.operadora) = 'ASSIM SAÚDE'
          AND p.evento IS NOT NULL
          AND DATE(p.data_competencia) BETWEEN ? AND ?
      ),
      beneficiarios_status AS (
        SELECT
          b.cpf,
          SUBSTRING_INDEX(
            GROUP_CONCAT(
              b.status_beneficiario
              ORDER BY b.data_inicio_vigencia_beneficiario DESC
            ),
            ',',
            1
          ) AS status_beneficiario
        FROM reg_beneficiarios b
        ${beneficiariosStatusWhereClause}
        GROUP BY b.cpf
      )
      SELECT
        pm.mes AS mes_referencia,
        COUNT(DISTINCT pm.cpf) AS vidas_com_procedimento
      FROM procedimentos_mes pm
      LEFT JOIN beneficiarios_status bs ON bs.cpf = pm.cpf
      WHERE LOWER(COALESCE(bs.status_beneficiario, '')) = 'ativo'
      GROUP BY pm.mes
    `

    const vidasComProcedimentoParams = [
      primeiroDiaPeriodo,
      ultimoDiaPeriodoStr,
      ...beneficiariosStatusWhereValues,
    ]

    const [rowsVidasComProc]: any = await connection.execute(queryVidasComProcedimento, vidasComProcedimentoParams)
    const queryDuration = Date.now() - queryStartTime
    
    console.log(`[PERFORMANCE] /api/beneficiarios/ativos - Queries otimizadas: ${queryDuration}ms (antes: ~24 queries)`)

    // Mapear resultados
    const vidasComProcedimentoMap = new Map<string, number>()
    ;(rowsVidasComProc || []).forEach((row: any) => {
      vidasComProcedimentoMap.set(row.mes_referencia, Number(row.vidas_com_procedimento) || 0)
    })

    const resultados = meses.map((mes, idx) => {
      const vidasAtivas = vidasAtivasPorMes[idx] || 0
      const vidasComProcedimento = vidasComProcedimentoMap.get(mes) || 0
      const vidasSemProcedimento = Math.max(vidasAtivas - vidasComProcedimento, 0)
      
      return {
        mes_referencia: mes,
        vidas_ativas: vidasAtivas,
        vidas_ativas_com_procedimento: vidasComProcedimento,
        vidas_ativas_sem_procedimento: vidasSemProcedimento,
      }
    })

    const totalDuration = Date.now() - apiStartTime
    console.log(`[PERFORMANCE] /api/beneficiarios/ativos - Total: ${totalDuration}ms (antes: ~24 queries, agora: 2 queries)`)

    return NextResponse.json(resultados)
  } catch (error: any) {
    console.error("Erro ao buscar vidas ativas:", error)
    return NextResponse.json(
      { error: error.message || "Erro ao buscar vidas ativas" },
      { status: 500 }
    )
  } finally {
    if (connection) {
      await connection.end()
    }
  }
}

