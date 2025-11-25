export const dynamic = "force-dynamic"
export const revalidate = 0
export const fetchCache = "force-no-store"

import { NextRequest, NextResponse } from "next/server"
import { getDBConnection } from "@/lib/db"

const DEFAULT_OPERADORA = "ASSIM SAÚDE"
const DEFAULT_PLANO_EXCLUDE_PATTERNS = ["%DENT%", "%AESP%"]

const firstDayOfMonth = (dateStr: string): string => {
  const date = new Date(dateStr)
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Data inválida: ${dateStr}`)
  }
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  return `${year}-${month}-01`
}

const lastDayOfMonth = (dateStr: string): string => {
  const date = new Date(dateStr)
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Data inválida: ${dateStr}`)
  }
  const year = date.getFullYear()
  const month = date.getMonth() + 1
  const lastDay = new Date(year, month, 0).getDate()
  return `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`
}

const listarMesesEntre = (inicio: string, fim: string): string[] => {
  const resultado: string[] = []
  const startDate = new Date(`${inicio}-01`)
  const endDate = new Date(`${fim}-01`)
  if (startDate > endDate) return resultado

  const cursor = new Date(startDate)
  while (cursor <= endDate) {
    resultado.push(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`)
    cursor.setMonth(cursor.getMonth() + 1)
  }
  return resultado
}

export async function GET(request: NextRequest) {
  let connection: any = null

  try {
    connection = await getDBConnection()

    const searchParams = request.nextUrl.searchParams
    const dataInicioParam = searchParams.get("data_inicio")
    const dataFimParam = searchParams.get("data_fim")
    const operadoraParam = searchParams.get("operadora") || DEFAULT_OPERADORA
    const planosExclusaoParam = searchParams.get("planos_excluir")

    if (!dataInicioParam || !dataFimParam) {
      return NextResponse.json(
        { error: "data_inicio e data_fim são obrigatórios" },
        { status: 400 }
      )
    }

    const inicioPrimeiroDia = firstDayOfMonth(dataInicioParam)
    const fimUltimoDia = lastDayOfMonth(dataFimParam)
    const mesesIntervalo = listarMesesEntre(
      inicioPrimeiroDia.slice(0, 7),
      fimUltimoDia.slice(0, 7)
    )

    if (mesesIntervalo.length === 0) {
      return NextResponse.json([])
    }

    const planosExclusao = planosExclusaoParam
      ? planosExclusaoParam.split(",").map(p => p.trim()).filter(Boolean)
      : DEFAULT_PLANO_EXCLUDE_PATTERNS

    const planoExclusaoClauses = planosExclusao.length > 0
      ? planosExclusao.map(() => "UPPER(b.plano) NOT LIKE ?").join(" AND ")
      : ""

    const sinistralidadeQuery = `
      WITH procedimentos_filtrados AS (
        SELECT
          DATE_FORMAT(p.data_competencia, '%Y-%m') AS mes_label,
          CAST(DATE_FORMAT(p.data_competencia, '%Y-%m-01') AS DATE) AS mes_inicio,
          LAST_DAY(p.data_competencia) AS mes_fim,
          p.cpf,
          p.valor_procedimento
        FROM reg_procedimentos p
        WHERE p.evento IS NOT NULL
          AND p.data_competencia BETWEEN ? AND ?
      ),
      beneficiarios_rankeados AS (
        SELECT
          pf.mes_label,
          pf.cpf,
          b.status_beneficiario,
          ROW_NUMBER() OVER (
            PARTITION BY pf.mes_label, pf.cpf
            ORDER BY 
              b.data_inicio_vigencia_beneficiario DESC,
              COALESCE(b.updated_at, b.data_inicio_vigencia_beneficiario) DESC,
              b.id DESC
          ) AS rn
        FROM procedimentos_filtrados pf
        LEFT JOIN reg_beneficiarios b
          ON b.cpf = pf.cpf
         AND UPPER(b.operadora) = ?
         ${planoExclusaoClauses ? `AND ${planoExclusaoClauses}` : ""}
         AND b.data_inicio_vigencia_beneficiario <= pf.mes_fim
         AND (
           b.data_exclusao IS NULL
           OR b.data_exclusao >= pf.mes_inicio
         )
      ),
      beneficiarios_mes AS (
        SELECT
          mes_label,
          cpf,
          status_beneficiario
        FROM beneficiarios_rankeados
        WHERE rn = 1
      ),
      procedimentos_com_status AS (
        SELECT
          pf.mes_label,
          pf.cpf,
          CASE
            WHEN bm.cpf IS NULL THEN 'nao_localizado'
            WHEN LOWER(bm.status_beneficiario) = 'ativo' THEN 'ativo'
            ELSE 'inativo'
          END AS categoria_status
        FROM procedimentos_filtrados pf
        LEFT JOIN beneficiarios_mes bm
          ON bm.mes_label = pf.mes_label
         AND bm.cpf = pf.cpf
      ),
      totais AS (
        SELECT
          mes_label,
          categoria_status,
          COUNT(DISTINCT cpf) AS beneficiarios_qtd
        FROM procedimentos_com_status
        GROUP BY mes_label, categoria_status
      )
      SELECT
        mes_label AS mes,
        COALESCE(MAX(CASE WHEN categoria_status = 'ativo' THEN beneficiarios_qtd END), 0) AS ativo,
        COALESCE(MAX(CASE WHEN categoria_status = 'inativo' THEN beneficiarios_qtd END), 0) AS inativo,
        COALESCE(MAX(CASE WHEN categoria_status = 'nao_localizado' THEN beneficiarios_qtd END), 0) AS nao_localizado,
        COALESCE(SUM(beneficiarios_qtd), 0) AS total
      FROM totais
      GROUP BY mes_label
      ORDER BY mes_label
    `

    const queryParams = [
      inicioPrimeiroDia,
      fimUltimoDia,
      operadoraParam.toUpperCase(),
      ...planosExclusao.map(pattern => pattern.toUpperCase()),
    ]

    const [rows]: any = await connection.execute(sinistralidadeQuery, queryParams)
    const dadosPorMes = new Map<string, any>()
    ;(rows || []).forEach((row: any) => {
      dadosPorMes.set(row.mes, {
        mes: row.mes,
        ativo: Number(row.ativo) || 0,
        inativo: Number(row.inativo) || 0,
        nao_localizado: Number(row.nao_localizado) || 0,
        total: Number(row.total) || 0,
      })
    })

    const resposta = mesesIntervalo.map(mes => {
      const registro = dadosPorMes.get(mes)
      if (registro) return registro
      return {
        mes,
        ativo: 0,
        inativo: 0,
        nao_localizado: 0,
        total: 0,
      }
    })

    return NextResponse.json(resposta)
  } catch (error: any) {
    console.error("Erro ao gerar dashboard de sinistralidade:", error)
    return NextResponse.json(
      { error: error.message || "Erro ao gerar dashboard de sinistralidade" },
      { status: 500 }
    )
  } finally {
    if (connection) {
      await connection.end()
    }
  }
}


