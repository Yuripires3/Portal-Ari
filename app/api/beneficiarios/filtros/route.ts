export const dynamic = "force-dynamic"
export const revalidate = 0
export const fetchCache = "force-no-store"

import { NextRequest, NextResponse } from "next/server"
import { getDBConnection } from "@/lib/db"

/**
 * GET /api/beneficiarios/filtros
 * Retorna valores únicos para filtros (operadoras, entidades, tipos) do banco reg_beneficiarios
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
       FROM reg_beneficiarios 
       WHERE operadora IS NOT NULL AND operadora != ''
       ORDER BY operadora ASC`
    )

    // Buscar entidades únicas
    const [entidades]: any = await connection.execute(
      `SELECT DISTINCT entidade 
       FROM reg_beneficiarios 
       WHERE entidade IS NOT NULL AND entidade != ''
       ORDER BY entidade ASC`
    )

    // Buscar entidades por operadora
    const [entidadesPorOperadoraRaw]: any = await connection.execute(
      `SELECT DISTINCT operadora, entidade
       FROM reg_beneficiarios
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

    // Buscar tipos únicos (ordenado de Z a A)
    const [tipos]: any = await connection.execute(
      `SELECT DISTINCT tipo 
       FROM reg_beneficiarios 
       WHERE tipo IS NOT NULL AND tipo != ''
       ORDER BY tipo DESC`
    )

    // Buscar o mês mais recente de data_inicio_vigencia_beneficiario
    const [mesMaisRecente]: any = await connection.execute(
      `SELECT DATE_FORMAT(MAX(data_inicio_vigencia_beneficiario), '%Y-%m') as mes_mais_recente
       FROM reg_beneficiarios
       WHERE data_inicio_vigencia_beneficiario IS NOT NULL`
    )

    const mesMaisRecenteStr = mesMaisRecente[0]?.mes_mais_recente || null

    return NextResponse.json({
      operadoras: operadoras.map((row: any) => row.operadora).filter(Boolean),
      entidades: entidades.map((row: any) => row.entidade).filter(Boolean),
      entidadesPorOperadora,
      tipos: tipos.map((row: any) => row.tipo).filter(Boolean),
      mesMaisRecente: mesMaisRecenteStr,
    })
  } catch (error: any) {
    console.error("Erro ao buscar filtros de beneficiários:", error)
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

