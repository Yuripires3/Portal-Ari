export const dynamic = "force-dynamic"
export const revalidate = 0
export const fetchCache = "force-no-store"

import { NextRequest, NextResponse } from "next/server"
import { getDBConnection } from "@/lib/db"

/**
 * GET /api/sinistralidade/vidas-ativas
 *
 * Calcula a quantidade de vidas ativas por mês (posição) para a operadora ASSIM SAÚDE,
 * para uma janela de 12 meses: mês de referência + 11 meses anteriores.
 *
 * Parâmetros:
 * - mes_referencia: string no formato "YYYY-MM" (obrigatório)
 *
 * Regra de vida ativa no mês M:
 * - data_inicio_vigencia_beneficiario <= LAST_DAY(M)
 * - E (
 *     (data_exclusao IS NULL AND status_beneficiario = 'ativo')
 *     OR (data_exclusao IS NOT NULL AND data_exclusao > LAST_DAY(M))
 *   )
 * - Apenas operadora 'ASSIM SAÚDE'
 *
 * Retorno: array de objetos no formato
 * [
 *   { ano_mes_referencia: 'YYYY-MM', vidas_ativas: number },
 *   ...
 * ]
 */
export async function GET(request: NextRequest) {
  let connection: any = null

  try {
    const searchParams = request.nextUrl.searchParams
    const mesReferencia = searchParams.get("mes_referencia") // formato esperado: YYYY-MM

    if (!mesReferencia || !/^\d{4}-\d{2}$/.test(mesReferencia)) {
      return NextResponse.json(
        { error: "Parâmetro obrigatório mes_referencia no formato YYYY-MM" },
        { status: 400 }
      )
    }

    // Converter para uma data no primeiro dia do mês de referência (YYYY-MM-01)
    const baseDate = `${mesReferencia}-01`

    connection = await getDBConnection()

    // Query MySQL 5.7 compatível (sem WITH RECURSIVE) para gerar 12 meses
    // a partir do mês de referência (mês ref + 11 anteriores)
    const sql = `
      SELECT
        DATE_FORMAT(m.mes_ref, '%Y-%m') AS ano_mes_referencia,
        COUNT(DISTINCT b.id_beneficiario) AS vidas_ativas
      FROM (
        SELECT DATE_SUB(?, INTERVAL 11 MONTH) AS mes_ref
        UNION ALL SELECT DATE_SUB(?, INTERVAL 10 MONTH)
        UNION ALL SELECT DATE_SUB(?, INTERVAL 9  MONTH)
        UNION ALL SELECT DATE_SUB(?, INTERVAL 8  MONTH)
        UNION ALL SELECT DATE_SUB(?, INTERVAL 7  MONTH)
        UNION ALL SELECT DATE_SUB(?, INTERVAL 6  MONTH)
        UNION ALL SELECT DATE_SUB(?, INTERVAL 5  MONTH)
        UNION ALL SELECT DATE_SUB(?, INTERVAL 4  MONTH)
        UNION ALL SELECT DATE_SUB(?, INTERVAL 3  MONTH)
        UNION ALL SELECT DATE_SUB(?, INTERVAL 2  MONTH)
        UNION ALL SELECT DATE_SUB(?, INTERVAL 1  MONTH)
        UNION ALL SELECT DATE_SUB(?, INTERVAL 0  MONTH)
      ) AS m
      JOIN reg_beneficiarios b
        ON b.operadora = 'ASSIM SAÚDE'
        AND b.data_inicio_vigencia_beneficiario <= LAST_DAY(m.mes_ref)
        AND (
          (b.data_exclusao IS NULL AND b.status_beneficiario = 'ativo')
          OR (b.data_exclusao IS NOT NULL AND b.data_exclusao > LAST_DAY(m.mes_ref))
        )
      GROUP BY
        ano_mes_referencia
      ORDER BY
        ano_mes_referencia
    `

    // Passar a mesma data base 12 vezes (uma para cada DATE_SUB)
    const params = new Array(12).fill(baseDate)

    const [rows]: any = await connection.execute(sql, params)

    const resultado = (rows || []).map((row: any) => ({
      ano_mes_referencia: row.ano_mes_referencia as string,
      vidas_ativas: Number(row.vidas_ativas) || 0,
    }))

    return NextResponse.json(resultado)
  } catch (error: any) {
    console.error("Erro ao calcular vidas ativas por mês (sinistralidade):", error)
    return NextResponse.json(
      { error: error.message || "Erro ao calcular vidas ativas por mês" },
      { status: 500 }
    )
  } finally {
    if (connection) {
      await connection.end()
    }
  }
}


