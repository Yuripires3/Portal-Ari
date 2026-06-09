export const dynamic = "force-dynamic"
export const revalidate = 0
export const fetchCache = "force-no-store"

import { NextRequest, NextResponse } from "next/server"
import { getDBConnection } from "@/lib/db"
import { buscarConsolidado } from "@/lib/indicadores/consolidado-service"

/**
 * GET /api/indicadores/consolidado?ano=2025
 * Retorna indicadores consolidados por operadora, espelhando o Excel "Relatório Indicadores".
 */
export async function GET(request: NextRequest) {
  let connection = null

  try {
    const anoParam = request.nextUrl.searchParams.get("ano")
    const ano = anoParam ? Number(anoParam) : new Date().getFullYear()

    if (!anoParam || Number.isNaN(ano) || ano < 2000 || ano > 2100) {
      return NextResponse.json({ error: "Parâmetro 'ano' inválido" }, { status: 400 })
    }

    connection = await getDBConnection()
    await connection.execute("SET NAMES 'utf8mb4' COLLATE 'utf8mb4_unicode_ci'")

    const dados = await buscarConsolidado(connection, ano)

    return NextResponse.json(dados)
  } catch (error) {
    console.error("[Indicadores/Consolidado] Erro:", error)
    return NextResponse.json(
      {
        error: "Erro ao carregar indicadores consolidados",
        details: process.env.NODE_ENV === "development" && error instanceof Error ? error.message : undefined,
      },
      { status: 500 }
    )
  } finally {
    if (connection) await connection.end()
  }
}
