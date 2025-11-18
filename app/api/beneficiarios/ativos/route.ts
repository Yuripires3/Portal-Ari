export const dynamic = "force-dynamic"
export const revalidate = 0
export const fetchCache = "force-no-store"

import { NextRequest, NextResponse } from "next/server"
import { getDBConnection } from "@/lib/db"

/**
 * GET /api/beneficiarios/ativos
 * Retorna contagem de vidas ativas por mês de referência
 * 
 * Parâmetros:
 * - data_inicio: YYYY-MM-DD (primeiro dia do mês de referência inicial)
 * - data_fim: YYYY-MM-DD (primeiro dia do mês de referência final)
 * - operadoras: string separada por vírgula (opcional, múltiplas operadoras)
 * - entidades: string separada por vírgula (opcional)
 * - tipo: string (opcional, "Todos" ignora o filtro)
 */
export async function GET(request: NextRequest) {
  let connection: any = null

  try {
    connection = await getDBConnection()
    
    const searchParams = request.nextUrl.searchParams
    const dataInicio = searchParams.get("data_inicio")
    const dataFim = searchParams.get("data_fim")
    const operadorasParam = searchParams.get("operadoras") || searchParams.get("operadora") // Suporta ambos para compatibilidade
    const entidadesParam = searchParams.get("entidades")
    const tipo = searchParams.get("tipo")

    if (!dataInicio || !dataFim) {
      return NextResponse.json(
        { error: "data_inicio e data_fim são obrigatórios" },
        { status: 400 }
      )
    }

    // Normalizar datas para primeiro dia do mês (YYYY-MM-01)
    const parseDateToFirstOfMonth = (dateStr: string): string => {
      const date = new Date(dateStr)
      const year = date.getFullYear()
      const month = String(date.getMonth() + 1).padStart(2, "0")
      return `${year}-${month}-01`
    }

    const inicioNormalizado = parseDateToFirstOfMonth(dataInicio)
    const fimNormalizado = parseDateToFirstOfMonth(dataFim)

    // Gerar lista de meses: sempre exibir 12 meses retrocedendo a partir do mês mais recente filtrado (data_fim)
    // O mês mais recente filtrado + os 11 meses anteriores
    const meses: string[] = []
    
    // Extrair ano e mês do data_fim normalizado
    const [anoFim, mesFim] = fimNormalizado.split("-")
    const anoFimInt = parseInt(anoFim)
    const mesFimInt = parseInt(mesFim) // formato 1-12
    
    // Calcular 12 meses retrocedendo do mês mais recente
    // Começamos do mês mais antigo e vamos até o mais recente
    let ano = anoFimInt
    let mes = mesFimInt - 11 // Retroceder 11 meses
    
    // Ajustar se o mês ficou negativo (precisa voltar o ano)
    while (mes < 1) {
      mes += 12
      ano--
    }
    
    // Gerar os 12 meses
    for (let i = 0; i < 12; i++) {
      meses.push(`${ano}-${String(mes).padStart(2, "0")}`)
      
      // Avançar para o próximo mês
      mes++
      if (mes > 12) {
        mes = 1
        ano++
      }
    }

    // Construir filtros WHERE
    const whereConditions: string[] = []
    const whereValues: any[] = []

    if (operadorasParam) {
      const operadoras = operadorasParam.split(",").map(op => op.trim()).filter(Boolean)
      if (operadoras.length > 0) {
        whereConditions.push(`operadora IN (${operadoras.map(() => "?").join(",")})`)
        whereValues.push(...operadoras)
      }
    }

    if (entidadesParam) {
      const entidades = entidadesParam.split(",").map(e => e.trim()).filter(Boolean)
      if (entidades.length > 0) {
        whereConditions.push(`entidade IN (${entidades.map(() => "?").join(",")})`)
        whereValues.push(...entidades)
      }
    }

    if (tipo && tipo !== "Todos") {
      whereConditions.push("tipo = ?")
      whereValues.push(tipo)
    }

    const whereClause = whereConditions.length > 0 
      ? `WHERE ${whereConditions.join(" AND ")}` 
      : ""

    // Para cada mês, contar vidas ativas
    // Beneficiário ativo em um mês M (YYYY-MM):
    // - data_inicio_vigencia_beneficiario <= último dia de M
    // - Se data_exclusao IS NULL: status_beneficiario deve ser 'ativo' (minúsculo)
    // - Se data_exclusao IS NOT NULL:
    //   - Se data_exclusao > CURDATE(): considerar ativo (data de exclusão é futura)
    //   - Se data_exclusao <= CURDATE(): verificar se data_exclusao > último dia de M (ainda estava ativo naquele mês)
    const resultados: Array<{ mes_referencia: string; vidas_ativas: number }> = []

    for (const mes of meses) {
      const [ano, mesNum] = mes.split("-")
      // Último dia do mês: JavaScript Date usa mês 0-indexed (0=janeiro, 1=fevereiro, 2=março...)
      // Para pegar o último dia do mês M (em formato 1-12), usamos new Date(ano, M, 0)
      // Porque mês M em Date = mês M+1, e dia 0 = último dia do mês anterior (mês M)
      const anoInt = parseInt(ano)
      const mesInt = parseInt(mesNum) // mesInt está em formato 1-12
      // Para pegar o último dia do mês mesInt (formato 1-12), usamos new Date(ano, mesInt + 1, 0)
      // JavaScript Date usa mês 0-indexed (0=janeiro, 1=fevereiro, ...)
      // new Date(ano, mesInt + 1, 0) retorna o último dia do mês mesInt
      // Exemplo: mesInt=1 (janeiro) -> new Date(2025, 2, 0) = último dia de janeiro (31/01/2025) ✓
      // Exemplo: mesInt=2 (fevereiro) -> new Date(2025, 3, 0) = último dia de fevereiro (28/02/2025) ✓
      // Exemplo: mesInt=12 (dezembro) -> new Date(2025, 13, 0) = último dia de dezembro (31/12/2025) ✓
      const ultimoDiaMes = new Date(anoInt, mesInt + 1, 0)
      const ultimoDiaMesStr = ultimoDiaMes.toISOString().split("T")[0]

      // Construir query com filtros WHERE
      const queryWhere = whereConditions.length > 0 
        ? `${whereClause} AND` 
        : "WHERE"

      const query = `
        SELECT COUNT(DISTINCT id_beneficiario) as vidas_ativas
        FROM reg_beneficiarios
        ${queryWhere} data_inicio_vigencia_beneficiario <= ?
        AND (
          (data_exclusao IS NULL AND status_beneficiario = 'ativo')
          OR (data_exclusao IS NOT NULL AND (
            data_exclusao > CURDATE()
            OR data_exclusao > ?
          ))
        )
      `

      const [rows]: any = await connection.execute(query, [
        ...whereValues,
        ultimoDiaMesStr,
        ultimoDiaMesStr
      ])

      resultados.push({
        mes_referencia: mes,
        vidas_ativas: rows[0]?.vidas_ativas || 0
      })
    }

    return NextResponse.json(resultados)
  } catch (error: any) {
    console.error("Erro ao buscar vidas ativas:", error)
    return NextResponse.json(
      { error: error.message || "Erro ao buscar vidas ativas" },
      { status: 500 }
    )
  } finally {
    if (connection) {
      await connection.end()
    }
  }
}

