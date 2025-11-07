import { NextRequest, NextResponse } from "next/server"
import { getDBConnection } from "@/lib/db"
import { formatDateISO } from "@/lib/date-utils"

/**
 * GET /api/dashboard/filtros
 * Retorna valores únicos para filtros (operadoras, entidades)
 */
export async function GET(request: NextRequest) {
  let connection: any = null

  try {
    connection = await getDBConnection()
    
    // Garantir charset UTF-8 na conexão
    await connection.execute("SET NAMES 'utf8mb4' COLLATE 'utf8mb4_unicode_ci'")
    await connection.execute("SET CHARACTER SET utf8mb4")
    await connection.execute("SET character_set_connection=utf8mb4")

    // Buscar operadoras únicas
    const [operadoras]: any = await connection.execute(
      `SELECT DISTINCT operadora 
       FROM unificado_bonificacao 
       WHERE operadora IS NOT NULL AND operadora != ''
       ORDER BY operadora ASC`
    )

    // Buscar entidades únicas
    const [entidades]: any = await connection.execute(
      `SELECT DISTINCT entidade 
       FROM unificado_bonificacao 
       WHERE entidade IS NOT NULL AND entidade != ''
       ORDER BY entidade ASC`
    )

    // Buscar entidades por operadora em todo o histórico
    const [entidadesPorOperadoraRaw]: any = await connection.execute(
      `SELECT DISTINCT operadora, entidade
       FROM unificado_bonificacao
       WHERE operadora IS NOT NULL AND operadora != ''
         AND entidade IS NOT NULL AND entidade != ''
       ORDER BY operadora ASC, entidade ASC`
    )

    const entidadesPorOperadora = entidadesPorOperadoraRaw.reduce((acc: Record<string, string[]>, row: any) => {
      const operadora = row.operadora
      const entidade = row.entidade

      if (!operadora || !entidade) return acc

      if (!acc[operadora]) {
        acc[operadora] = []
      }

      if (!acc[operadora].includes(entidade)) {
        acc[operadora].push(entidade)
      }
      return acc
    }, {})

    // Buscar última data registrada
    const [ultimaData]: any = await connection.execute(
      `SELECT MAX(COALESCE(dt_pagamento, dt_analise)) as ultima_data
       FROM unificado_bonificacao
       WHERE dt_pagamento IS NOT NULL OR dt_analise IS NOT NULL`
    )

    const ultimaDataStr = ultimaData[0]?.ultima_data 
      ? formatDateISO(ultimaData[0].ultima_data)
      : null

    return NextResponse.json({
      operadoras: operadoras.map((row: any) => row.operadora).filter(Boolean),
      entidades: entidades.map((row: any) => row.entidade).filter(Boolean),
      entidadesPorOperadora,
      ultimaData: ultimaDataStr
    })
  } catch (error: any) {
    console.error("Erro ao buscar filtros:", error)
    return NextResponse.json(
      { error: error.message || "Erro ao buscar filtros" },
      { status: 500 }
    )
  } finally {
    if (connection) {
      await connection.end()
    }
  }
}

