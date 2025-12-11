export const dynamic = "force-dynamic"
export const revalidate = 0
export const fetchCache = "force-no-store"

import { NextRequest, NextResponse } from "next/server"
import { getDBConnection } from "@/lib/db"

/**
 * GET /api/sinistralidade/faixas-etarias-plano
 * 
 * Retorna distribuição por faixas etárias para um plano específico
 * 
 * Parâmetros:
 * - meses_referencia: string separada por vírgula (ex: "2025-01,2025-02") - obrigatório
 * - operadoras: string separada por vírgula (opcional, padrão: ASSIM SAÚDE)
 * - entidades: string separada por vírgula (opcional)
 * - meses_reajuste: string separada por vírgula (opcional)
 * - tipo: string (opcional, "Todos" ignora o filtro)
 * - plano: string (obrigatório) - nome do plano
 * - status: string (opcional) - "ativo", "inativo", "vazio", "total"
 */
export async function GET(request: NextRequest) {
  let connection: any = null

  try {
    const searchParams = request.nextUrl.searchParams
    const mesesReferenciaParam = searchParams.get("meses_referencia")
    const operadorasParam = searchParams.get("operadoras")
    const entidadesParam = searchParams.get("entidades")
    const mesesReajusteParam = searchParams.get("meses_reajuste")
    const tipoParam = searchParams.get("tipo")
    const planoParam = searchParams.get("plano")
    const statusParam = searchParams.get("status") || "total"

    if (!mesesReferenciaParam) {
      return NextResponse.json(
        { error: "Parâmetro obrigatório: meses_referencia" },
        { status: 400 }
      )
    }

    if (!planoParam) {
      return NextResponse.json(
        { error: "Parâmetro obrigatório: plano" },
        { status: 400 }
      )
    }

    // Processar meses de referência
    const mesesReferencia = mesesReferenciaParam
      .split(",")
      .map(m => m.trim())
      .filter(Boolean)
      .filter(m => /^\d{4}-\d{2}$/.test(m))

    if (mesesReferencia.length === 0) {
      return NextResponse.json(
        { error: "Nenhum mês válido fornecido" },
        { status: 400 }
      )
    }

    // Calcular data_inicio e data_fim
    const mesesOrdenados = [...mesesReferencia].sort()
    const primeiroMes = mesesOrdenados[0]
    const ultimoMes = mesesOrdenados[mesesOrdenados.length - 1]

    const [anoInicio, mesInicio] = primeiroMes.split("-")
    const dataInicio = `${anoInicio}-${mesInicio}-01`

    const [anoFim, mesFim] = ultimoMes.split("-")
    const anoFimNum = parseInt(anoFim)
    const mesFimNum = parseInt(mesFim)
    const ultimoDiaDate = new Date(anoFimNum, mesFimNum, 0)
    const dataFim = ultimoDiaDate.toISOString().split("T")[0]

    // Processar filtros
    const operadoras = operadorasParam
      ? operadorasParam.split(",").map(op => op.trim()).filter(Boolean)
      : ["ASSIM SAÚDE"]

    const entidades = entidadesParam
      ? entidadesParam.split(",").map(e => e.trim()).filter(Boolean)
      : []

    const mesesReajuste = mesesReajusteParam
      ? mesesReajusteParam.split(",").map(m => m.trim()).filter(Boolean)
      : []

    const tipo = tipoParam && tipoParam !== "Todos" ? tipoParam.trim() : null
    const plano = planoParam.trim()

    connection = await getDBConnection()

    // Construir condições WHERE para procedimentos
    const procedimentosConditions: string[] = []
    const procedimentosValues: any[] = []

    if (operadoras.length > 0) {
      procedimentosConditions.push(`p.operadora IN (${operadoras.map(() => "?").join(",")})`)
      procedimentosValues.push(...operadoras)
    }

    procedimentosConditions.push("p.evento IS NOT NULL")
    procedimentosConditions.push("DATE(p.data_competencia) BETWEEN ? AND ?")
    procedimentosValues.push(dataInicio, dataFim)
    procedimentosConditions.push(`DATE_FORMAT(p.data_competencia, '%Y-%m') IN (${mesesReferencia.map(() => "?").join(",")})`)
    procedimentosValues.push(...mesesReferencia)

    // 🔵 QUERY PERFEITA: Não usar filtros diferentes na subconsulta de beneficiários
    // Todos os filtros (entidade, mes_reajuste, plano) são aplicados no WHERE final
    // A subconsulta de beneficiários usa apenas o filtro de operadora

    // 🔵 QUERY PERFEITA: Usar EXATAMENTE a mesma subconsulta 'm' da query perfeita
    // Aplicar filtros apenas no WHERE final (mes, entidade, mes_reajuste, plano)
    // Não usar COUNT(DISTINCT cpf), usar COUNT(*) como na query perfeita
    const sqlFaixasEtarias = `
      SELECT
        m.faixa_etaria,
        COUNT(*) AS vidas,
        SUM(m.valor_procedimentos) AS valor,
        SUM(m.valor_faturamento) AS valor_net
      FROM (
        -- MESMA SUBCONSULTA 'm' DA QUERY PERFEITA
        SELECT
          base.mes,
          base.entidade,
          base.plano,
          base.cpf,
          base.valor_faturamento,
          base.valor_procedimentos,
          b.mes_reajuste,
          CASE
            WHEN b.cpf IS NULL THEN 'vazio'
            WHEN LOWER(b.status_beneficiario) = 'ativo' THEN 'ativo'
            ELSE 'inativo'
          END AS status_final,
          CASE
            WHEN b.idade IS NULL OR CAST(b.idade AS UNSIGNED) <= 18 THEN '00 a 18'
            WHEN CAST(b.idade AS UNSIGNED) BETWEEN 19 AND 23 THEN '19 a 23'
            WHEN CAST(b.idade AS UNSIGNED) BETWEEN 24 AND 28 THEN '24 a 28'
            WHEN CAST(b.idade AS UNSIGNED) BETWEEN 29 AND 33 THEN '29 a 33'
            WHEN CAST(b.idade AS UNSIGNED) BETWEEN 34 AND 38 THEN '34 a 38'
            WHEN CAST(b.idade AS UNSIGNED) BETWEEN 39 AND 43 THEN '39 a 43'
            WHEN CAST(b.idade AS UNSIGNED) BETWEEN 44 AND 48 THEN '44 a 48'
            WHEN CAST(b.idade AS UNSIGNED) BETWEEN 49 AND 53 THEN '49 a 53'
            WHEN CAST(b.idade AS UNSIGNED) BETWEEN 54 AND 58 THEN '54 a 58'
            ELSE '59+'
          END AS faixa_etaria
        FROM (
          -- mês x CPF + valor procedimentos + valor faturamento fixo por CPF
          SELECT
            pr.mes,
            fv.entidade,
            fv.plano,
            pr.cpf,
            pr.valor_total_procedimentos AS valor_procedimentos,
            COALESCE(fv.valor_faturamento, 0) AS valor_faturamento
          FROM (
            -- PROCEDIMENTOS: 1 linha por mês x CPF
            SELECT
              DATE_FORMAT(p.data_competencia, '%Y-%m') AS mes,
              p.cpf,
              SUM(p.valor_procedimento) AS valor_total_procedimentos
            FROM reg_procedimentos p
            WHERE ${procedimentosConditions.join(" AND ")}
            GROUP BY
              DATE_FORMAT(p.data_competencia, '%Y-%m'),
              p.cpf
          ) AS pr
          LEFT JOIN (
            -- FATURAMENTO: 1 VALOR FIXO POR CPF (independente de dt_competencia)
            SELECT
              f.cpf_do_beneficiario AS cpf,
              SUBSTRING_INDEX(GROUP_CONCAT(DISTINCT f.entidade), ',', 1) AS entidade,
              SUBSTRING_INDEX(GROUP_CONCAT(DISTINCT f.plano), ',', 1) AS plano,
              MAX(f.vlr_net) AS valor_faturamento
            FROM reg_faturamento f
            WHERE ${operadoras.length > 0 ? `f.operadora IN (${operadoras.map(() => "?").join(",")})` : "1=1"}
            GROUP BY
              f.cpf_do_beneficiario
          ) AS fv
            ON fv.cpf = pr.cpf
        ) AS base
        LEFT JOIN (
          -- STATUS + IDADE + MÊS DE REAJUSTE mais recente por CPF
          SELECT
            b.cpf,
            SUBSTRING_INDEX(
              GROUP_CONCAT(
                b.status_beneficiario ORDER BY b.data_inicio_vigencia_beneficiario DESC
              ),
              ',', 1
            ) AS status_beneficiario,
            SUBSTRING_INDEX(
              GROUP_CONCAT(
                b.idade ORDER BY b.data_inicio_vigencia_beneficiario DESC
              ),
              ',', 1
            ) AS idade,
            SUBSTRING_INDEX(
              GROUP_CONCAT(
                b.mes_reajuste ORDER BY b.data_inicio_vigencia_beneficiario DESC
              ),
              ',', 1
            ) AS mes_reajuste
          FROM reg_beneficiarios b
          WHERE ${operadoras.length > 0 ? `b.operadora IN (${operadoras.map(() => "?").join(",")})` : "1=1"}
          GROUP BY
            b.cpf
        ) AS b
          ON b.cpf = base.cpf
      ) AS m
      WHERE
        m.mes IN (${mesesReferencia.map(() => "?").join(",")})
        ${entidades.length > 0 ? `AND m.entidade IN (${entidades.map(() => "?").join(",")})` : ""}
        ${mesesReajuste.length > 0 ? `AND m.mes_reajuste IN (${mesesReajuste.map(() => "?").join(",")})` : ""}
        AND m.plano = ?
        ${statusParam !== "total" ? `AND m.status_final = ?` : ""}
      GROUP BY
        m.faixa_etaria
      ORDER BY
        CASE m.faixa_etaria
          WHEN '00 a 18' THEN 1
          WHEN '19 a 23' THEN 2
          WHEN '24 a 28' THEN 3
          WHEN '29 a 33' THEN 4
          WHEN '34 a 38' THEN 5
          WHEN '39 a 43' THEN 6
          WHEN '44 a 48' THEN 7
          WHEN '49 a 53' THEN 8
          WHEN '54 a 58' THEN 9
          ELSE 10
        END
    `

    // 🔵 QUERY PERFEITA: Ordem dos valores conforme a estrutura da query perfeita
    // 1. procedimentosValues (para WHERE dos procedimentos)
    // 2. operadoras (para JOIN com faturamento)
    // 3. operadoras (para JOIN com beneficiários - mesma lista)
    // 4. mesesReferencia (para filtro WHERE m.mes IN (...))
    // 5. entidades (para filtro WHERE m.entidade IN (...))
    // 6. mesesReajuste (para filtro WHERE m.mes_reajuste IN (...))
    // 7. plano (para filtro WHERE m.plano = ?)
    // 8. status (se não for "total")
    const queryValues: any[] = [
      ...procedimentosValues,
      ...(operadoras.length > 0 ? operadoras : []),
      ...(operadoras.length > 0 ? operadoras : []), // Para beneficiários
      ...mesesReferencia,
      ...(entidades.length > 0 ? entidades : []),
      ...(mesesReajuste.length > 0 ? mesesReajuste : []),
      plano
    ]
    
    // Adicionar status se não for "total"
    if (statusParam !== "total") {
      queryValues.push(statusParam)
    }
    
    const [rows]: any = await connection.execute(sqlFaixasEtarias, queryValues)

    // 🔵 VALIDAÇÃO OBRIGATÓRIA: Verificar se a soma das faixas = total_vidas do plano
    // Query auxiliar para buscar o total_vidas do plano usando a mesma base
    const sqlTotalPlano = `
      SELECT
        COUNT(*) AS total_vidas
      FROM (
        -- MESMA SUBCONSULTA 'm' DA QUERY PERFEITA
        SELECT
          base.mes,
          base.entidade,
          base.plano,
          base.cpf,
          base.valor_faturamento,
          base.valor_procedimentos,
          b.mes_reajuste,
          CASE
            WHEN b.cpf IS NULL THEN 'vazio'
            WHEN LOWER(b.status_beneficiario) = 'ativo' THEN 'ativo'
            ELSE 'inativo'
          END AS status_final,
          CASE
            WHEN b.idade IS NULL OR CAST(b.idade AS UNSIGNED) <= 18 THEN '00 a 18'
            WHEN CAST(b.idade AS UNSIGNED) BETWEEN 19 AND 23 THEN '19 a 23'
            WHEN CAST(b.idade AS UNSIGNED) BETWEEN 24 AND 28 THEN '24 a 28'
            WHEN CAST(b.idade AS UNSIGNED) BETWEEN 29 AND 33 THEN '29 a 33'
            WHEN CAST(b.idade AS UNSIGNED) BETWEEN 34 AND 38 THEN '34 a 38'
            WHEN CAST(b.idade AS UNSIGNED) BETWEEN 39 AND 43 THEN '39 a 43'
            WHEN CAST(b.idade AS UNSIGNED) BETWEEN 44 AND 48 THEN '44 a 48'
            WHEN CAST(b.idade AS UNSIGNED) BETWEEN 49 AND 53 THEN '49 a 53'
            WHEN CAST(b.idade AS UNSIGNED) BETWEEN 54 AND 58 THEN '54 a 58'
            ELSE '59+'
          END AS faixa_etaria
        FROM (
          SELECT
            pr.mes,
            fv.entidade,
            fv.plano,
            pr.cpf,
            pr.valor_total_procedimentos AS valor_procedimentos,
            COALESCE(fv.valor_faturamento, 0) AS valor_faturamento
          FROM (
            SELECT
              DATE_FORMAT(p.data_competencia, '%Y-%m') AS mes,
              p.cpf,
              SUM(p.valor_procedimento) AS valor_total_procedimentos
            FROM reg_procedimentos p
            WHERE ${procedimentosConditions.join(" AND ")}
            GROUP BY
              DATE_FORMAT(p.data_competencia, '%Y-%m'),
              p.cpf
          ) AS pr
          LEFT JOIN (
            SELECT
              f.cpf_do_beneficiario AS cpf,
              SUBSTRING_INDEX(GROUP_CONCAT(DISTINCT f.entidade), ',', 1) AS entidade,
              SUBSTRING_INDEX(GROUP_CONCAT(DISTINCT f.plano), ',', 1) AS plano,
              MAX(f.vlr_net) AS valor_faturamento
            FROM reg_faturamento f
            WHERE ${operadoras.length > 0 ? `f.operadora IN (${operadoras.map(() => "?").join(",")})` : "1=1"}
            GROUP BY
              f.cpf_do_beneficiario
          ) AS fv
            ON fv.cpf = pr.cpf
        ) AS base
        LEFT JOIN (
          SELECT
            b.cpf,
            SUBSTRING_INDEX(
              GROUP_CONCAT(
                b.status_beneficiario ORDER BY b.data_inicio_vigencia_beneficiario DESC
              ),
              ',', 1
            ) AS status_beneficiario,
            SUBSTRING_INDEX(
              GROUP_CONCAT(
                b.idade ORDER BY b.data_inicio_vigencia_beneficiario DESC
              ),
              ',', 1
            ) AS idade,
            SUBSTRING_INDEX(
              GROUP_CONCAT(
                b.mes_reajuste ORDER BY b.data_inicio_vigencia_beneficiario DESC
              ),
              ',', 1
            ) AS mes_reajuste
          FROM reg_beneficiarios b
          WHERE ${operadoras.length > 0 ? `b.operadora IN (${operadoras.map(() => "?").join(",")})` : "1=1"}
          GROUP BY
            b.cpf
        ) AS b
          ON b.cpf = base.cpf
      ) AS m
      WHERE
        m.mes IN (${mesesReferencia.map(() => "?").join(",")})
        ${entidades.length > 0 ? `AND m.entidade IN (${entidades.map(() => "?").join(",")})` : ""}
        ${mesesReajuste.length > 0 ? `AND m.mes_reajuste IN (${mesesReajuste.map(() => "?").join(",")})` : ""}
        AND m.plano = ?
        ${statusParam !== "total" ? `AND m.status_final = ?` : ""}
    `
    
    const [rowsTotalPlano]: any = await connection.execute(sqlTotalPlano, queryValues)
    const totalVidasPlano = rowsTotalPlano && rowsTotalPlano.length > 0 ? Number(rowsTotalPlano[0].total_vidas) || 0 : 0

    // 🔵 QUERY PERFEITA: Processar resultados usando os campos da query perfeita
    // A query retorna: faixa_etaria, vidas, valor, valor_net
    
    // Calcular total de vidas (soma de todas as faixas)
    const totalVidasFaixas = (rows || []).reduce((sum: number, row: any) => sum + (Number(row.vidas) || 0), 0)
    const totalValorFaixas = (rows || []).reduce((sum: number, row: any) => sum + (Number(row.valor) || 0), 0)
    const totalValorNetFaixas = (rows || []).reduce((sum: number, row: any) => sum + (Number(row.valor_net) || 0), 0)
    
    // 🔵 VALIDAÇÃO OBRIGATÓRIA: Verificar se a soma das faixas = total_vidas do plano
    const diffVidas = Math.abs(totalVidasFaixas - totalVidasPlano)
    if (diffVidas > 0.01) {
      console.error(`❌ VALIDAÇÃO FALHOU - Plano: ${plano}`)
      console.error(`  Total vidas do plano (query de planos): ${totalVidasPlano}`)
      console.error(`  Soma das faixas etárias: ${totalVidasFaixas}`)
      console.error(`  Diferença: ${diffVidas}`)
      console.error(`  Entidade: ${entidades.length > 0 ? entidades.join(", ") : "Todas"}`)
      console.error(`  Mês de reajuste: ${mesesReajuste.length > 0 ? mesesReajuste.join(", ") : "Todos"}`)
      console.error(`  Mês de referência: ${mesesReferencia.join(", ")}`)
      console.error(`  Status: ${statusParam}`)
      console.error(`  Detalhamento por faixa:`, (rows || []).map((r: any) => ({
        faixa: r.faixa_etaria,
        vidas: r.vidas
      })))
    } else {
      console.log(`✅ VALIDAÇÃO PASSOU - Plano: ${plano}`)
      console.log(`  Total vidas do plano: ${totalVidasPlano}`)
      console.log(`  Soma das faixas etárias: ${totalVidasFaixas}`)
    }
    
    console.log(`🔵 VALIDAÇÃO FAIXAS ETÁRIAS - Plano: ${plano}`)
    console.log(`  Total vidas nas faixas: ${totalVidasFaixas}`)
    console.log(`  Total valor nas faixas: ${totalValorFaixas}`)
    console.log(`  Total valor NET nas faixas: ${totalValorNetFaixas}`)
    console.log(`  Número de faixas retornadas: ${(rows || []).length}`)

    // Processar resultados - usar EXATAMENTE os valores retornados pela query
    const faixasEtarias: Array<{
      faixa_etaria: string
      vidas: number
      valor: number
      valor_net: number
      is?: number | null
    }> = []

    const faixasMap = new Map<string, { vidas: number; valor: number; valor_net: number }>()

    // Inicializar todas as faixas
    const todasFaixas = [
      '00 a 18', '19 a 23', '24 a 28', '29 a 33', '34 a 38',
      '39 a 43', '44 a 48', '49 a 53', '54 a 58', '59+'
    ]

    todasFaixas.forEach(faixa => {
      faixasMap.set(faixa, { vidas: 0, valor: 0, valor_net: 0 })
    })

    // 🔵 QUERY PERFEITA: Processar resultados usando os campos da query perfeita
    ;(rows || []).forEach((row: any) => {
      const faixa = row.faixa_etaria || '00 a 18'
      // Usar vidas (COUNT(*) da query perfeita)
      const vidas = Number(row.vidas) || 0
      // Usar valor (SUM(valor_procedimentos))
      const valor = Number(row.valor) || 0
      // Usar valor_net (SUM(valor_faturamento))
      const valorNet = Number(row.valor_net) || 0

      const atual = faixasMap.get(faixa) || { vidas: 0, valor: 0, valor_net: 0 }
      atual.vidas += vidas
      atual.valor += valor
      atual.valor_net += valorNet
      faixasMap.set(faixa, atual)
    })

    // Converter para array ordenado
    todasFaixas.forEach(faixa => {
      const dados = faixasMap.get(faixa) || { vidas: 0, valor: 0, valor_net: 0 }
      // IS ainda não implementado - retornar null para mostrar "-"
      faixasEtarias.push({
        faixa_etaria: faixa,
        vidas: dados.vidas,
        valor: dados.valor,
        valor_net: dados.valor_net,
        is: null
      })
    })

    return NextResponse.json({
      plano,
      faixas_etarias: faixasEtarias
    })
  } catch (error: any) {
    console.error("Erro ao buscar faixas etárias por plano:", error)
    return NextResponse.json(
      { error: error.message || "Erro ao buscar faixas etárias por plano" },
      { status: 500 }
    )
  } finally {
    if (connection) {
      await connection.end()
    }
  }
}

