export const dynamic = "force-dynamic"
export const revalidate = 0
export const fetchCache = "force-no-store"

import { NextRequest, NextResponse } from "next/server"
import { buscarConsolidado } from "@/lib/indicadores/consolidado-service"

/**
 * GET /api/indicadores/consolidado?ano=2025
 * Dados estáticos importados de data/indicadores.xlsx (abas 2021–2026).
 */
export async function GET(request: NextRequest) {
  try {
    const anoParam = request.nextUrl.searchParams.get("ano")
    const ano = anoParam ? Number(anoParam) : new Date().getFullYear()

    if (!anoParam || Number.isNaN(ano) || ano < 2000 || ano > 2100) {
      return NextResponse.json({ error: "Parâmetro 'ano' inválido" }, { status: 400 })
    }

    const dados = buscarConsolidado(ano)
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
  }
}
