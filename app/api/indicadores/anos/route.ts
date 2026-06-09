export const dynamic = "force-dynamic"
export const revalidate = 0
export const fetchCache = "force-no-store"

import { NextResponse } from "next/server"
import { buscarAnosDisponiveis } from "@/lib/indicadores/consolidado-service"

/** GET /api/indicadores/anos — anos disponíveis no arquivo estático. */
export async function GET() {
  try {
    const anos = buscarAnosDisponiveis()
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
  }
}
