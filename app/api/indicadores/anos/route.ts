export const dynamic = "force-dynamic"
export const revalidate = 0
export const fetchCache = "force-no-store"

import { NextResponse } from "next/server"
import { getDBConnection } from "@/lib/db"
import { buscarAnosDisponiveis } from "@/lib/indicadores/consolidado-service"

/** GET /api/indicadores/anos — anos com dados nas tabelas de indicadores. */
export async function GET() {
  let connection = null

  try {
    connection = await getDBConnection()
    const anos = await buscarAnosDisponiveis(connection)
    return NextResponse.json({ anos })
  } catch (error) {
    console.error("[Indicadores/Anos] Erro:", error)
    return NextResponse.json(
      {
        error: "Erro ao listar anos disponíveis",
        details: process.env.NODE_ENV === "development" && error instanceof Error ? error.message : undefined,
      },
      { status: 500 }
    )
  } finally {
    if (connection) await connection.end()
  }
}
