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
          WHERE
            p.operadora = 'ASSIM SAÚDE'
            AND p.evento IS NOT NULL
            AND DATE(p.data_competencia) BETWEEN ? AND ?
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
          WHERE
            b.operadora = 'ASSIM SAÚDE'
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

    const [rows]: any = await connection.execute(sql, [dataInicio, dataFim])

    // Formatar os resultados para garantir tipos numéricos
    const formattedRows = (rows || []).map((row: any) => ({
      mes: row.mes,
      ativo: Number(row.ativo) || 0,
      inativo: Number(row.inativo) || 0,
      nao_localizado: Number(row.nao_localizado) || 0,
      total_vidas: Number(row.total_vidas) || 0,
      valor_ativo: Number(row.valor_ativo) || 0,
      valor_inativo: Number(row.valor_inativo) || 0,
      valor_nao_localizado: Number(row.valor_nao_localizado) || 0,
      valor_total_geral: Number(row.valor_total_geral) || 0,
    }))

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


