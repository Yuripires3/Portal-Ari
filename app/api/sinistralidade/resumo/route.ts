export const dynamic = "force-dynamic"
export const revalidate = 0
export const fetchCache = "force-no-store"

import { NextRequest, NextResponse } from "next/server"
import { getDBConnection } from "@/lib/db"

type SinistralidadeResumoRow = {
  mes: string
  entidade: string | null
  plano: string | null
  faixa_etaria: string
  vidas_ativas: number
  vidas_inativas: number
  vidas_nao_localizadas: number
  total_vidas: number
  valor_fat_ativo: number
  valor_fat_inativo: number
  valor_fat_nao_localizado: number
  valor_faturamento_total: number
  valor_proc_ativo: number
  valor_proc_inativo: number
  valor_proc_nao_localizado: number
  valor_procedimentos_total: number
  is_total?: number | null
}

const DEFAULT_DATA_INICIO = "2025-01-01"
const DEFAULT_DATA_FIM = "2025-10-31"

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const dataInicio = searchParams.get("data_inicio") || DEFAULT_DATA_INICIO
  const dataFim = searchParams.get("data_fim") || DEFAULT_DATA_FIM
  const entidadeFiltro = searchParams.get("entidade")
  const planoFiltro = searchParams.get("plano")

  let connection: any = null

  try {
    connection = await getDBConnection()

    const filtrosExterno: string[] = []
    const params: any[] = [dataInicio, dataFim]

    if (entidadeFiltro) {
      filtrosExterno.push("m.entidade = ?")
      params.push(entidadeFiltro)
    }

    if (planoFiltro) {
      filtrosExterno.push("m.plano = ?")
      params.push(planoFiltro)
    }

    const whereExterno = filtrosExterno.length > 0 ? `WHERE ${filtrosExterno.join(" AND ")}` : ""

    const sql = `
      SELECT
          m.mes,
          m.entidade,
          m.plano,
          m.faixa_etaria,
          SUM(CASE WHEN m.status_final = 'ativo'   THEN 1 ELSE 0 END) AS vidas_ativas,
          SUM(CASE WHEN m.status_final = 'inativo' THEN 1 ELSE 0 END) AS vidas_inativas,
          SUM(CASE WHEN m.status_final = 'vazio'   THEN 1 ELSE 0 END) AS vidas_nao_localizadas,
          COUNT(*) AS total_vidas,
          -- faturamento (fixo por CPF, somado por mês)
          SUM(CASE WHEN m.status_final = 'ativo'   THEN m.valor_faturamento   ELSE 0 END) AS valor_fat_ativo,
          SUM(CASE WHEN m.status_final = 'inativo' THEN m.valor_faturamento   ELSE 0 END) AS valor_fat_inativo,
          SUM(CASE WHEN m.status_final = 'vazio'   THEN m.valor_faturamento   ELSE 0 END) AS valor_fat_nao_localizado,
          SUM(m.valor_faturamento) AS valor_faturamento_total,
          -- procedimentos
          SUM(CASE WHEN m.status_final = 'ativo'   THEN m.valor_procedimentos ELSE 0 END) AS valor_proc_ativo,
          SUM(CASE WHEN m.status_final = 'inativo' THEN m.valor_procedimentos ELSE 0 END) AS valor_proc_inativo,
          SUM(CASE WHEN m.status_final = 'vazio'   THEN m.valor_procedimentos ELSE 0 END) AS valor_proc_nao_localizado,
          SUM(m.valor_procedimentos) AS valor_procedimentos_total
      FROM (
          SELECT
              base.mes,
              base.entidade,
              base.plano,
              base.cpf,
              base.valor_faturamento,
              base.valor_procedimentos,
              CASE
                  WHEN b.cpf IS NULL THEN 'vazio'
                  WHEN LOWER(b.status_beneficiario) = 'ativo' THEN 'ativo'
                  ELSE 'inativo'
              END AS status_final,
              CASE
                  WHEN b.idade IS NULL OR CAST(b.idade AS UNSIGNED) <= 18 THEN '00 a 18'
                  WHEN CAST(b.idade AS UNSIGNED) BETWEEN 19 AND 23 THEN '19 a 23'
                  WHEN CAST(b.idade AS UNSIGNED) BETWEEN 24 AND 28 THEN '24 a 28'
                  WHEN CAST(b.idade AS UNSIGNED) BETWEEN 29 AND 33 THEN '29 a 33'
                  WHEN CAST(b.idade AS UNSIGNED) BETWEEN 34 AND 38 THEN '34 a 38'
                  WHEN CAST(b.idade AS UNSIGNED) BETWEEN 39 AND 43 THEN '39 a 43'
                  WHEN CAST(b.idade AS UNSIGNED) BETWEEN 44 AND 48 THEN '44 a 48'
                  WHEN CAST(b.idade AS UNSIGNED) BETWEEN 49 AND 53 THEN '49 a 53'
                  WHEN CAST(b.idade AS UNSIGNED) BETWEEN 54 AND 58 THEN '54 a 58'
                  ELSE '59+'
              END AS faixa_etaria
          FROM (
              -- mês x CPF + valor procedimentos + valor faturamento fixo por CPF
              SELECT
                  pr.mes,
                  fv.entidade,
                  fv.plano,
                  pr.cpf,
                  pr.valor_total_procedimentos AS valor_procedimentos,
                  COALESCE(fv.valor_faturamento, 0) AS valor_faturamento
              FROM (
                  -- PROCEDIMENTOS: 1 linha por mês x CPF
                  SELECT
                      DATE_FORMAT(p.data_competencia, '%Y-%m') AS mes,
                      p.cpf,
                      SUM(p.valor_procedimento) AS valor_total_procedimentos
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
                  -- FATURAMENTO: 1 VALOR FIXO POR CPF (independente de dt_competencia)
                  SELECT
                      f.cpf_do_beneficiario AS cpf,
                      -- se por algum motivo tivesse mais de uma entidade/plano, pega a primeira
                      SUBSTRING_INDEX(GROUP_CONCAT(DISTINCT f.entidade), ',', 1) AS entidade,
                      SUBSTRING_INDEX(GROUP_CONCAT(DISTINCT f.plano),    ',', 1) AS plano,
                      MAX(f.vlr_net) AS valor_faturamento
                  FROM reg_faturamento f
                  WHERE
                      f.operadora = 'ASSIM SAÚDE'
                  GROUP BY
                      f.cpf_do_beneficiario
              ) AS fv
                  ON fv.cpf = pr.cpf
          ) AS base
          LEFT JOIN (
              -- STATUS + IDADE mais recente por CPF
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
                          b.idade
                          ORDER BY b.data_inicio_vigencia_beneficiario DESC
                      ),
                      ',',
                      1
                  ) AS idade
              FROM reg_beneficiarios b
              WHERE
                  b.operadora = 'ASSIM SAÚDE'
              GROUP BY
                  b.cpf
          ) AS b
              ON b.cpf = base.cpf
      ) AS m
      ${whereExterno}
      GROUP BY
          m.mes,
          m.entidade,
          m.plano,
          m.faixa_etaria;
    `

    const [rows] = await connection.execute(sql, params)

    const formatNumber = (value: any) => {
      if (value === null || value === undefined) return 0
      const num = Number(value)
      return Number.isNaN(num) ? 0 : num
    }

    const resultado: SinistralidadeResumoRow[] = (rows as any[]).map((row) => {
      const valorFaturamentoTotal = formatNumber(row.valor_faturamento_total)
      const valorProcedimentosTotal = formatNumber(row.valor_procedimentos_total)
      const isTotal = valorFaturamentoTotal !== 0
        ? valorProcedimentosTotal / valorFaturamentoTotal
        : null

      return {
        mes: row.mes,
        entidade: row.entidade ?? null,
        plano: row.plano ?? null,
        faixa_etaria: row.faixa_etaria,
        vidas_ativas: formatNumber(row.vidas_ativas),
        vidas_inativas: formatNumber(row.vidas_inativas),
        vidas_nao_localizadas: formatNumber(row.vidas_nao_localizadas),
        total_vidas: formatNumber(row.total_vidas),
        valor_fat_ativo: formatNumber(row.valor_fat_ativo),
        valor_fat_inativo: formatNumber(row.valor_fat_inativo),
        valor_fat_nao_localizado: formatNumber(row.valor_fat_nao_localizado),
        valor_faturamento_total: valorFaturamentoTotal,
        valor_proc_ativo: formatNumber(row.valor_proc_ativo),
        valor_proc_inativo: formatNumber(row.valor_proc_inativo),
        valor_proc_nao_localizado: formatNumber(row.valor_proc_nao_localizado),
        valor_procedimentos_total: valorProcedimentosTotal,
        is_total: isTotal,
      }
    })

    return NextResponse.json(resultado)
  } catch (error: any) {
    console.error("Erro ao gerar resumo de sinistralidade:", error)
    return NextResponse.json(
      { error: "Erro ao gerar resumo de sinistralidade" },
      { status: 500 }
    )
  } finally {
    if (connection) {
      await connection.end()
    }
  }
}


