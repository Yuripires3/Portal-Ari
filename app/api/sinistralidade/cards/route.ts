export const dynamic = "force-dynamic"
export const revalidate = 0
export const fetchCache = "force-no-store"

import { NextRequest, NextResponse } from "next/server"
import { getDBConnection } from "@/lib/db"

// Função auxiliar para log de performance
const logPerformance = (label: string, startTime: number) => {
  const duration = Date.now() - startTime
  console.log(`[PERFORMANCE] ${label}: ${duration}ms`)
  return duration
}

/**
 * GET /api/sinistralidade/cards
 * Retorna cards de sinistralidade agrupados por mês com faixa etária
 * OTIMIZADO: Query única combinada, cálculos no backend, logs de performance
 * 
 * Parâmetros:
 * - data_inicio: YYYY-MM-DD (opcional se mes_referencia for fornecido)
 * - data_fim: YYYY-MM-DD (opcional se mes_referencia for fornecido)
 * - mes_referencia: YYYY-MM (opcional, converte para data_inicio e data_fim)
 */
export async function GET(request: NextRequest) {
  const apiStartTime = Date.now()
  let connection: any = null

  try {
    const searchParams = request.nextUrl.searchParams
    let dataInicio = searchParams.get("data_inicio")
    let dataFim = searchParams.get("data_fim")
    const mesReferencia = searchParams.get("mes_referencia")
    const operadorasParam = searchParams.get("operadoras")
    const entidadesParam = searchParams.get("entidades")
    const tipo = searchParams.get("tipo")
    const cpf = searchParams.get("cpf")

    // Se mes_referencia for fornecido, converter para data_inicio e data_fim
    if (mesReferencia) {
      const [ano, mes] = mesReferencia.split("-")
      if (ano && mes && ano.length === 4 && mes.length === 2) {
        const anoNum = Number(ano)
        const mesNum = Number(mes)
        if (!Number.isNaN(anoNum) && !Number.isNaN(mesNum) && mesNum >= 1 && mesNum <= 12) {
          // Primeiro dia do mês
          dataInicio = `${ano}-${mes}-01`
          // Último dia do mês
          const ultimoDia = new Date(anoNum, mesNum, 0).getDate()
          dataFim = `${ano}-${mes}-${String(ultimoDia).padStart(2, "0")}`
        }
      }
    }

    if (!dataInicio || !dataFim) {
      return NextResponse.json(
        { error: "Parâmetros obrigatórios: data_inicio e data_fim, ou mes_referencia (YYYY-MM)" },
        { status: 400 }
      )
    }

    const connectionStartTime = Date.now()
    connection = await getDBConnection()
    logPerformance("DB Connection", connectionStartTime)

    // Processar filtros
    const operadoras = operadorasParam ? operadorasParam.split(",").map(op => op.trim()).filter(Boolean) : []
    const entidades = entidadesParam ? entidadesParam.split(",").map(e => e.trim()).filter(Boolean) : []
    const tipoFiltro = tipo && tipo !== "Todos" ? tipo : null
    const cpfFiltro = cpf ? cpf.trim() : null

    // Construir condições WHERE para procedimentos
    // IMPORTANTE: Filtros de entidade e tipo não se aplicam diretamente aos procedimentos
    // mas serão aplicados via JOIN com beneficiários
    const procedimentosConditions: string[] = [
      "p.operadora = 'ASSIM SAÚDE'",
      "p.evento IS NOT NULL",
      "DATE(p.data_competencia) BETWEEN ? AND ?"
    ]
    const procedimentosValues: any[] = [dataInicio, dataFim]

    // CPF sempre se aplica aos procedimentos
    if (cpfFiltro) {
      procedimentosConditions.push("p.cpf = ?")
      procedimentosValues.push(cpfFiltro)
    }

    // Construir condições WHERE para beneficiários (para filtros de entidade/tipo)
    const beneficiarioConditions: string[] = [
      "b.operadora = 'ASSIM SAÚDE'",
      "UPPER(b.plano) NOT LIKE '%DENT%'",
      "UPPER(b.plano) NOT LIKE '%AESP%'"
    ]
    const beneficiarioValues: any[] = []

    if (entidades.length > 0) {
      beneficiarioConditions.push(`b.entidade IN (${entidades.map(() => "?").join(",")})`)
      beneficiarioValues.push(...entidades)
    }

    if (tipoFiltro) {
      beneficiarioConditions.push("b.tipo = ?")
      beneficiarioValues.push(tipoFiltro)
    }

    if (cpfFiltro) {
      beneficiarioConditions.push("b.cpf = ?")
      beneficiarioValues.push(cpfFiltro)
    }

    const beneficiarioWhereClause = `WHERE ${beneficiarioConditions.join(" AND ")}`

    // QUERY CORRIGIDA: Seguindo a estrutura correta fornecida
    // Usa GROUP_CONCAT para pegar o status mais recente do beneficiário
    const queryStartTime = Date.now()
    
    // Construir subquery de beneficiários com filtros (se houver)
    const beneficiariosSubquery = `
      SELECT
        b.cpf,
        SUBSTRING_INDEX(
          GROUP_CONCAT(
            b.status_beneficiario
            ORDER BY b.data_inicio_vigencia_beneficiario DESC
          ),
          ',',
          1
        ) AS status_beneficiario,
        SUBSTRING_INDEX(
          GROUP_CONCAT(
            CAST(b.idade AS CHAR)
            ORDER BY b.data_inicio_vigencia_beneficiario DESC
          ),
          ',',
          1
        ) AS idade
      FROM reg_beneficiarios b
      ${beneficiarioWhereClause}
      GROUP BY b.cpf
    `
    
    const sql = `
      WITH procedimentos_com_status AS (
        SELECT
          pr.mes,
          pr.cpf,
          pr.valor_total_cpf_mes,
          CASE
            WHEN b.cpf IS NULL THEN 'vazio'
            WHEN LOWER(b.status_beneficiario) = 'ativo' THEN 'ativo'
            ELSE 'inativo'
          END AS status_final,
          CAST(b.idade AS UNSIGNED) AS idade
        FROM (
          SELECT
            DATE_FORMAT(p.data_competencia, '%Y-%m') AS mes,
            p.cpf,
            SUM(p.valor_procedimento) AS valor_total_cpf_mes
          FROM reg_procedimentos p
          WHERE ${procedimentosConditions.join(" AND ")}
          GROUP BY
            DATE_FORMAT(p.data_competencia, '%Y-%m'),
            p.cpf
        ) AS pr
        LEFT JOIN (
          ${beneficiariosSubquery}
        ) AS b
          ON b.cpf = pr.cpf
      ),
      cards_agregados AS (
        SELECT
          mes,
          SUM(CASE WHEN status_final = 'ativo'   THEN 1 ELSE 0 END) AS ativo,
          SUM(CASE WHEN status_final = 'inativo' THEN 1 ELSE 0 END) AS inativo,
          SUM(CASE WHEN status_final = 'vazio'   THEN 1 ELSE 0 END) AS nao_localizado,
          COUNT(*) AS total_vidas,
          SUM(CASE WHEN status_final = 'ativo'   THEN valor_total_cpf_mes ELSE 0 END) AS valor_ativo,
          SUM(CASE WHEN status_final = 'inativo' THEN valor_total_cpf_mes ELSE 0 END) AS valor_inativo,
          SUM(CASE WHEN status_final = 'vazio'   THEN valor_total_cpf_mes ELSE 0 END) AS valor_nao_localizado,
          SUM(valor_total_cpf_mes) AS valor_total_geral
        FROM procedimentos_com_status
        GROUP BY mes
      ),
      faixa_etaria_raw AS (
        SELECT
          mes,
          status_final,
          CASE
            WHEN idade IS NULL OR idade <= 18 THEN '00 a 18'
            WHEN idade <= 23 THEN '19 a 23'
            WHEN idade <= 28 THEN '24 a 28'
            WHEN idade <= 33 THEN '29 a 33'
            WHEN idade <= 38 THEN '34 a 38'
            WHEN idade <= 43 THEN '39 a 43'
            WHEN idade <= 48 THEN '44 a 48'
            WHEN idade <= 53 THEN '49 a 53'
            WHEN idade <= 58 THEN '54 a 58'
            ELSE '>59'
          END AS faixa,
          COUNT(DISTINCT cpf) AS vidas,
          SUM(valor_total_cpf_mes) AS valor_gasto
        FROM procedimentos_com_status
        WHERE status_final != 'vazio'
        GROUP BY mes, status_final, faixa
      )
      SELECT
        c.mes,
        c.ativo,
        c.inativo,
        c.nao_localizado,
        c.total_vidas,
        c.valor_ativo,
        c.valor_inativo,
        c.valor_nao_localizado,
        c.valor_total_geral,
        f.status_final,
        f.faixa,
        f.vidas AS faixa_vidas,
        f.valor_gasto AS faixa_valor_gasto
      FROM cards_agregados c
      LEFT JOIN faixa_etaria_raw f ON f.mes = c.mes
      ORDER BY c.mes, f.status_final, f.faixa
    `

    const [rows]: any = await connection.execute(sql, [
      ...procedimentosValues, 
      ...beneficiarioValues
    ])
    const queryDuration = logPerformance("SQL Query Execution", queryStartTime)

    // Processar resultados: agrupar por mês e status
    const processStartTime = Date.now()
    const dadosPorMes = new Map<string, any>()
    const faixaEtariaPorMes = new Map<string, Map<string, Map<string, { vidas: number; valorGasto: number }>>>()
    
    // Processar linhas retornadas
    ;(rows || []).forEach((row: any) => {
      const mes = row.mes
      
      // Inicializar dados do mês se não existir
      if (!dadosPorMes.has(mes)) {
        dadosPorMes.set(mes, {
          mes,
          ativo: Number(row.ativo) || 0,
          inativo: Number(row.inativo) || 0,
          nao_localizado: Number(row.nao_localizado) || 0,
          total_vidas: Number(row.total_vidas) || 0,
          valor_ativo: Number(row.valor_ativo) || 0,
          valor_inativo: Number(row.valor_inativo) || 0,
          valor_nao_localizado: Number(row.valor_nao_localizado) || 0,
          valor_total_geral: Number(row.valor_total_geral) || 0,
        })
      }
      
      // Processar faixa etária se existir
      if (row.status_final && row.faixa) {
        if (!faixaEtariaPorMes.has(mes)) {
          faixaEtariaPorMes.set(mes, new Map())
        }
        const statusMap = faixaEtariaPorMes.get(mes)!
        
        if (!statusMap.has(row.status_final)) {
          statusMap.set(row.status_final, new Map())
        }
        const faixaMap = statusMap.get(row.status_final)!
        
        const vidas = Number(row.faixa_vidas) || 0
        const valorGasto = Number(row.faixa_valor_gasto) || 0
        
        const atual = faixaMap.get(row.faixa) || { vidas: 0, valorGasto: 0 }
        faixaMap.set(row.faixa, {
          vidas: atual.vidas + vidas,
          valorGasto: atual.valorGasto + valorGasto,
        })
      }
    })

    // Formatar resultados finais com faixa etária
    const faixas = ["00 a 18", "19 a 23", "24 a 28", "29 a 33", "34 a 38", "39 a 43", "44 a 48", "49 a 53", "54 a 58", ">59"]
    
    const formattedRows = Array.from(dadosPorMes.values()).map((dadosMes: any) => {
      const mes = dadosMes.mes
      const statusMap = faixaEtariaPorMes.get(mes) || new Map()
      
      // Criar arrays de faixa etária para cada status
      const faixaEtariaAtivo = faixas.map(faixa => {
        const dados = statusMap.get("ativo")?.get(faixa) || { vidas: 0, valorGasto: 0 }
        return {
          faixa,
          vidas: dados.vidas,
          valorGasto: dados.valorGasto,
        }
      })
      
      const faixaEtariaInativo = faixas.map(faixa => {
        const dados = statusMap.get("inativo")?.get(faixa) || { vidas: 0, valorGasto: 0 }
        return {
          faixa,
          vidas: dados.vidas,
          valorGasto: dados.valorGasto,
        }
      })
      
      // Faixa etária de Não Localizados sempre zerada (não temos idade para identificar)
      const faixaEtariaNaoLocalizado = faixas.map(faixa => ({
        faixa,
        vidas: 0,
        valorGasto: 0,
      }))
      
      // Total geral: somar apenas ativos e inativos (não localizados não têm faixa etária)
      const faixaEtariaTotal = faixas.map(faixa => {
        const ativo = statusMap.get("ativo")?.get(faixa) || { vidas: 0, valorGasto: 0 }
        const inativo = statusMap.get("inativo")?.get(faixa) || { vidas: 0, valorGasto: 0 }
        // Não localizados sempre têm valores zerados (não temos idade)
        return {
          faixa,
          vidas: ativo.vidas + inativo.vidas,
          valorGasto: ativo.valorGasto + inativo.valorGasto,
        }
      })

      return {
        ...dadosMes,
        faixa_etaria_ativo: faixaEtariaAtivo,
        faixa_etaria_inativo: faixaEtariaInativo,
        faixa_etaria_nao_localizado: faixaEtariaNaoLocalizado,
        faixa_etaria_total: faixaEtariaTotal,
      }
    })

    const processDuration = logPerformance("Data Processing", processStartTime)
    const totalDuration = logPerformance("Total API Request", apiStartTime)
    
    console.log(`[PERFORMANCE SUMMARY] Query: ${queryDuration}ms | Processing: ${processDuration}ms | Total: ${totalDuration}ms`)

    return NextResponse.json(formattedRows)
  } catch (error: any) {
    const errorDuration = logPerformance("API Error (Total)", apiStartTime)
    console.error("Erro ao gerar cards de sinistralidade:", error)
    return NextResponse.json(
      { error: error.message || "Erro ao gerar cards de sinistralidade", stack: error.stack },
      { status: 500 }
    )
  } finally {
    if (connection) {
      await connection.end()
    }
  }
}


