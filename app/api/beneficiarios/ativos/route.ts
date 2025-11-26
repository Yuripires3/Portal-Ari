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
    const [anoFim, mesFim] = fimNormalizado.split("-")
    const anoFimInt = parseInt(anoFim)
    const mesFimInt = parseInt(mesFim) // formato 1-12
    
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

    // Para cada mês, contar:
    // - vidas ativas
    // - vidas ativas com pelo menos um procedimento no mês
    //
    // Beneficiário ativo em um mês M (YYYY-MM):
    // - data_inicio_vigencia_beneficiario <= último dia de M
    // - Se data_exclusao IS NULL: status_beneficiario deve ser 'ativo' (minúsculo)
    // - Se data_exclusao IS NOT NULL:
    //   - Se data_exclusao > CURDATE(): considerar ativo (data de exclusão é futura)
    //   - Se data_exclusao <= CURDATE(): verificar se data_exclusao > último dia de M (ainda estava ativo naquele mês)
    const resultados: Array<{
      mes_referencia: string
      vidas_ativas: number
      vidas_ativas_com_procedimento: number
      vidas_ativas_sem_procedimento: number
    }> = []

    for (const mes of meses) {
      const [ano, mesNum] = mes.split("-")
      // Último dia do mês: JavaScript Date usa mês 0-indexed (0=janeiro, 1=fevereiro, 2=março...)
      // Para pegar o último dia do mês M (em formato 1-12), usamos new Date(ano, M, 0)
      // Porque mês M em Date = mês M+1, e dia 0 = último dia do mês anterior (mês M)
      const anoInt = parseInt(ano)
      const mesInt = parseInt(mesNum) // mesInt está em formato 1-12
      // Para pegar o último dia do mês mesInt (formato 1-12), usamos new Date(ano, mesInt, 0)
      // JavaScript Date usa mês 0-indexed (0=janeiro, 1=fevereiro, ...)
      // new Date(ano, mesInt, 0) retorna o último dia do mês mesInt
      // Exemplo: mesInt=1 (janeiro) -> new Date(2025, 1, 0) = 31/01/2025
      // Exemplo: mesInt=2 (fevereiro) -> new Date(2025, 2, 0) = 28/02/2025
      // Exemplo: mesInt=12 (dezembro) -> new Date(2025, 12, 0) = 31/12/2025
      const ultimoDiaMes = new Date(anoInt, mesInt, 0)
      const ultimoDiaMesStr = ultimoDiaMes.toISOString().split("T")[0]

      // Construir query para vidas ativas com filtros WHERE
      const queryWhereAtivos = whereConditions.length > 0 
        ? `${whereClauseBenef} AND` 
        : "WHERE"

      const queryAtivos = `
        SELECT COUNT(DISTINCT b.id_beneficiario) as vidas_ativas
        FROM reg_beneficiarios b
        ${queryWhereAtivos} b.data_inicio_vigencia_beneficiario <= ?
        AND (
          (b.data_exclusao IS NULL AND b.status_beneficiario = 'ativo')
          OR (b.data_exclusao IS NOT NULL AND b.data_exclusao > ?)
        )
      `

      const [rowsAtivos]: any = await connection.execute(queryAtivos, [
        ...whereValues,
        ultimoDiaMesStr,
        ultimoDiaMesStr,
      ])

      const vidasAtivas = rowsAtivos[0]?.vidas_ativas || 0

      // Query para vidas ativas com pelo menos um procedimento no mês de referência
      // Usa a mesma lógica de identificação de "ativo" dos cards de sinistralidade:
      // - considera apenas operadora ASSIM SAÚDE
      // - status do beneficiário é o mais recente (por CPF), independente da data do procedimento
      // - conta apenas CPFs cujo status_final seja "ativo"
      // - aplica os mesmos filtros de entidade, tipo e operadoras da query de vidas ativas
      const primeiroDiaMesStr = `${ano}-${String(mesInt).padStart(2, "0")}-01`

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

      const queryComProcedimento = `
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
          GROUP BY
            b.cpf
        )
        SELECT COUNT(DISTINCT pr.cpf) AS vidas_com_procedimento
        FROM procedimentos_mes pr
        LEFT JOIN beneficiarios_status bs ON bs.cpf = pr.cpf
        WHERE pr.mes = DATE_FORMAT(?, '%Y-%m')
          AND LOWER(COALESCE(bs.status_beneficiario, '')) = 'ativo'
      `

      const [rowsComProc]: any = await connection.execute(queryComProcedimento, [
        primeiroDiaMesStr,
        ultimoDiaMesStr,
        ...beneficiariosStatusWhereValues,
        primeiroDiaMesStr,
      ])

      const vidasComProcedimento = rowsComProc[0]?.vidas_com_procedimento || 0
      const vidasSemProcedimento = Math.max(vidasAtivas - vidasComProcedimento, 0)

      resultados.push({
        mes_referencia: mes,
        vidas_ativas: vidasAtivas,
        vidas_ativas_com_procedimento: vidasComProcedimento,
        vidas_ativas_sem_procedimento: vidasSemProcedimento,
      })
    }

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

