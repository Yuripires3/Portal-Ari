export const dynamic = "force-dynamic"
export const revalidate = 0
export const fetchCache = "force-no-store"

import { NextRequest, NextResponse } from "next/server"
import { getDBConnection } from "@/lib/db"

/**
 * GET /api/beneficiarios/tipos-por-mes
 * Retorna tipos de beneficiários que têm procedimentos nos meses selecionados
 * 
 * Parâmetros:
 * - data_inicio: YYYY-MM-DD
 * - data_fim: YYYY-MM-DD
 * - operadora: string (opcional, padrão: ASSIM SAÚDE)
 */
export async function GET(request: NextRequest) {
  let connection: any = null

  try {
    const searchParams = request.nextUrl.searchParams
    const dataInicio = searchParams.get("data_inicio")
    const dataFim = searchParams.get("data_fim")
    const operadora = searchParams.get("operadora") || "ASSIM SAÚDE"

    if (!dataInicio || !dataFim) {
      return NextResponse.json(
        { error: "data_inicio e data_fim são obrigatórios" },
        { status: 400 }
      )
    }

    connection = await getDBConnection()

    // Buscar tipos de beneficiários que têm procedimentos nos meses selecionados
    // e que pertencem à operadora especificada
    const sql = `
      SELECT DISTINCT b.tipo
      FROM reg_procedimentos p
      INNER JOIN reg_beneficiarios b
        ON b.cpf = p.cpf
        AND UPPER(b.operadora) = UPPER(?)
        AND b.tipo IS NOT NULL
        AND b.tipo != ''
        AND b.data_inicio_vigencia_beneficiario <= ?
        AND (
          b.data_exclusao IS NULL
          OR b.data_exclusao >= ?
        )
        AND (
          UPPER(b.plano) NOT LIKE '%DENT%' 
          AND UPPER(b.plano) NOT LIKE '%AESP%' 
        )
      WHERE
        p.operadora = ?
        AND p.evento IS NOT NULL
        AND DATE(p.data_competencia) BETWEEN ? AND ?
      ORDER BY b.tipo DESC
    `

    const [rows]: any = await connection.execute(sql, [
      operadora,
      dataFim,
      dataInicio,
      operadora,
      dataInicio,
      dataFim,
    ])

    const tipos = (rows || [])
      .map((row: any) => row.tipo)
      .filter(Boolean)


    return NextResponse.json({
      tipos,
    })
  } catch (error: any) {
    console.error("Erro ao buscar tipos por mês:", error)
    return NextResponse.json(
      { error: error.message || "Erro ao buscar tipos" },
      { status: 500 }
    )
  } finally {
    if (connection) {
      await connection.end()
    }
  }
}

