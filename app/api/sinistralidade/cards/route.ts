export const dynamic = "force-dynamic"
export const revalidate = 0
export const fetchCache = "force-no-store"

import { NextRequest, NextResponse } from "next/server"
import { getDBConnection } from "@/lib/db"

/**
 * GET /api/sinistralidade/cards
 * Retorna cards de sinistralidade agrupados por mês
 * 
 * Parâmetros:
 * - data_inicio: YYYY-MM-DD (opcional se mes_referencia for fornecido)
 * - data_fim: YYYY-MM-DD (opcional se mes_referencia for fornecido)
 * - mes_referencia: YYYY-MM (opcional, converte para data_inicio e data_fim)
 */
export async function GET(request: NextRequest) {
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

    connection = await getDBConnection()

    // Processar filtros
    const operadoras = operadorasParam ? operadorasParam.split(",").map(op => op.trim()).filter(Boolean) : []
    const entidades = entidadesParam ? entidadesParam.split(",").map(e => e.trim()).filter(Boolean) : []
    const tipoFiltro = tipo && tipo !== "Todos" ? tipo : null
    const cpfFiltro = cpf ? cpf.trim() : null

    // Construir condições WHERE para procedimentos
    const procedimentosConditions: string[] = [
      "p.operadora = 'ASSIM SAÚDE'",
      "p.evento IS NOT NULL",
      "DATE(p.data_competencia) BETWEEN ? AND ?"
    ]
    const procedimentosValues: any[] = [dataInicio, dataFim]

    if (cpfFiltro) {
      procedimentosConditions.push("p.cpf = ?")
      procedimentosValues.push(cpfFiltro)
    }

    // Construir condições WHERE para beneficiários
    const beneficiarioConditions: string[] = [
      "b.operadora = 'ASSIM SAÚDE'"
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

    // Excluir planos odontológicos
    beneficiarioConditions.push(`(
      UPPER(b.plano) NOT LIKE '%DENT%' 
      AND UPPER(b.plano) NOT LIKE '%AESP%' 
    )`)

    const beneficiarioWhereClause = beneficiarioConditions.length > 0
      ? `WHERE ${beneficiarioConditions.join(" AND ")}`
      : ""

    // Função para calcular faixa etária baseada na idade
    const getFaixaEtaria = (idade: number | null): string => {
      if (idade === null || idade === undefined || isNaN(idade)) return ">59"
      if (idade <= 18) return "00 a 18"
      if (idade <= 23) return "19 a 23"
      if (idade <= 28) return "24 a 28"
      if (idade <= 33) return "29 a 33"
      if (idade <= 38) return "34 a 38"
      if (idade <= 43) return "39 a 43"
      if (idade <= 48) return "44 a 48"
      if (idade <= 53) return "49 a 53"
      if (idade <= 58) return "54 a 58"
      return ">59"
    }

    const sql = `
      SELECT
        m.mes AS mes,
        SUM(CASE WHEN m.status_final = 'ativo'   THEN 1 ELSE 0 END) AS ativo,
        SUM(CASE WHEN m.status_final = 'inativo' THEN 1 ELSE 0 END) AS inativo,
        SUM(CASE WHEN m.status_final = 'vazio'   THEN 1 ELSE 0 END) AS nao_localizado,
        COUNT(*) AS total_vidas,
        SUM(CASE WHEN m.status_final = 'ativo'   THEN m.valor_total_cpf_mes ELSE 0 END) AS valor_ativo,
        SUM(CASE WHEN m.status_final = 'inativo' THEN m.valor_total_cpf_mes ELSE 0 END) AS valor_inativo,
        SUM(CASE WHEN m.status_final = 'vazio'   THEN m.valor_total_cpf_mes ELSE 0 END) AS valor_nao_localizado,
        SUM(m.valor_total_cpf_mes) AS valor_total_geral
      FROM (
        SELECT
          pr.mes,
          pr.cpf,
          pr.valor_total_cpf_mes,
          CASE
            WHEN b.cpf IS NULL THEN 'vazio'
            WHEN LOWER(b.status_beneficiario) = 'ativo' THEN 'ativo'
            ELSE 'inativo'
          END AS status_final
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
          ${beneficiarioWhereClause}
          GROUP BY
            b.cpf
        ) AS b
          ON b.cpf = pr.cpf
      ) AS m
      GROUP BY
        m.mes
      ORDER BY
        m.mes
    `

    const [rows]: any = await connection.execute(sql, [...procedimentosValues, ...beneficiarioValues])

    // Query para faixa etária por status e mês, incluindo valor gasto
    const faixaEtariaSql = `
      SELECT
        m.mes AS mes,
        m.status_final,
        b_idade.idade,
        COUNT(DISTINCT m.cpf) AS vidas,
        SUM(m.valor_total_cpf_mes) AS valor_gasto
      FROM (
        SELECT
          pr.mes,
          pr.cpf,
          pr.valor_total_cpf_mes,
          CASE
            WHEN b.cpf IS NULL THEN 'vazio'
            WHEN LOWER(b.status_beneficiario) = 'ativo' THEN 'ativo'
            ELSE 'inativo'
          END AS status_final
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
          ${beneficiarioWhereClause}
          GROUP BY
            b.cpf
        ) AS b
          ON b.cpf = pr.cpf
      ) AS m
      LEFT JOIN (
        SELECT
          b.cpf,
          SUBSTRING_INDEX(
            GROUP_CONCAT(
              b.idade
              ORDER BY b.data_inicio_vigencia_beneficiario DESC
            ),
            ',',
            1
          ) AS idade
        FROM reg_beneficiarios b
        ${beneficiarioWhereClause}
        GROUP BY
          b.cpf
      ) AS b_idade
        ON b_idade.cpf = m.cpf
      GROUP BY
        m.mes,
        m.status_final,
        b_idade.idade
    `

    const [faixaEtariaRows]: any = await connection.execute(faixaEtariaSql, [...procedimentosValues, ...beneficiarioValues, ...beneficiarioValues])

    // Processar faixa etária por mês e status (vidas e valor gasto)
    const faixaEtariaPorMes = new Map<string, Map<string, Map<string, { vidas: number; valorGasto: number }>>>()
    
    ;(faixaEtariaRows || []).forEach((row: any) => {
      const mes = row.mes
      const status = row.status_final || "vazio"
      const idade = row.idade ? Number(row.idade) : null
      const faixa = getFaixaEtaria(idade)
      const vidas = Number(row.vidas) || 0
      const valorGasto = Number(row.valor_gasto) || 0

      if (!faixaEtariaPorMes.has(mes)) {
        faixaEtariaPorMes.set(mes, new Map())
      }
      const statusMap = faixaEtariaPorMes.get(mes)!
      
      if (!statusMap.has(status)) {
        statusMap.set(status, new Map())
      }
      const faixaMap = statusMap.get(status)!
      
      const atual = faixaMap.get(faixa) || { vidas: 0, valorGasto: 0 }
      faixaMap.set(faixa, {
        vidas: atual.vidas + vidas,
        valorGasto: atual.valorGasto + valorGasto,
      })
    })

    // Formatar os resultados para garantir tipos numéricos
    const formattedRows = (rows || []).map((row: any) => {
      const mes = row.mes
      const statusMap = faixaEtariaPorMes.get(mes) || new Map()
      
      // Criar arrays de faixa etária para cada status
      const faixas = ["00 a 18", "19 a 23", "24 a 28", "29 a 33", "34 a 38", "39 a 43", "44 a 48", "49 a 53", "54 a 58", ">59"]
      
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
      
      const faixaEtariaNaoLocalizado = faixas.map(faixa => {
        const dados = statusMap.get("vazio")?.get(faixa) || { vidas: 0, valorGasto: 0 }
        return {
          faixa,
          vidas: dados.vidas,
          valorGasto: dados.valorGasto,
        }
      })
      
      // Total geral: somar todas as faixas de todos os status
      const faixaEtariaTotal = faixas.map(faixa => {
        const ativo = statusMap.get("ativo")?.get(faixa) || { vidas: 0, valorGasto: 0 }
        const inativo = statusMap.get("inativo")?.get(faixa) || { vidas: 0, valorGasto: 0 }
        const vazio = statusMap.get("vazio")?.get(faixa) || { vidas: 0, valorGasto: 0 }
        return {
          faixa,
          vidas: ativo.vidas + inativo.vidas + vazio.vidas,
          valorGasto: ativo.valorGasto + inativo.valorGasto + vazio.valorGasto,
        }
      })

      return {
        mes: row.mes,
        ativo: Number(row.ativo) || 0,
        inativo: Number(row.inativo) || 0,
        nao_localizado: Number(row.nao_localizado) || 0,
        total_vidas: Number(row.total_vidas) || 0,
        valor_ativo: Number(row.valor_ativo) || 0,
        valor_inativo: Number(row.valor_inativo) || 0,
        valor_nao_localizado: Number(row.valor_nao_localizado) || 0,
        valor_total_geral: Number(row.valor_total_geral) || 0,
        faixa_etaria_ativo: faixaEtariaAtivo,
        faixa_etaria_inativo: faixaEtariaInativo,
        faixa_etaria_nao_localizado: faixaEtariaNaoLocalizado,
        faixa_etaria_total: faixaEtariaTotal,
      }
    })

    return NextResponse.json(formattedRows)
  } catch (error: any) {
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


