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

    // Detectar contexto: card MÃE ou card FILHO
    // Cards MÃE: não filtram por entidade/mês de reajuste (mesmo que venham nos parâmetros)
    // Cards FILHOS: filtram por entidade/mês de reajuste quando aplicável
    const isCardMae = entidades.length === 0 && mesesReajuste.length === 0

    // WHERE de beneficiários - mesma lógica dos cards correspondentes
    const beneficiarioConditionsPlano: string[] = []
    const beneficiarioValuesPlano: any[] = []

    if (operadoras.length > 0) {
      beneficiarioConditionsPlano.push(`b.operadora IN (${operadoras.map(() => "?").join(",")})`)
      beneficiarioValuesPlano.push(...operadoras)
    }

    // Para cards FILHOS, aplicar filtros de entidade e mês de reajuste
    if (!isCardMae) {
      if (entidades.length > 0) {
        beneficiarioConditionsPlano.push(`b.entidade IN (${entidades.map(() => "?").join(",")})`)
        beneficiarioValuesPlano.push(...entidades)
      }

      if (mesesReajuste.length > 0) {
        beneficiarioConditionsPlano.push(`b.mes_reajuste IN (${mesesReajuste.map(() => "?").join(",")})`)
        beneficiarioValuesPlano.push(...mesesReajuste)
      }
    }

    if (tipo) {
      beneficiarioConditionsPlano.push("b.tipo = ?")
      beneficiarioValuesPlano.push(tipo)
    }

    beneficiarioConditionsPlano.push(`(
      UPPER(b.plano) NOT LIKE '%DENT%' 
      AND UPPER(b.plano) NOT LIKE '%AESP%' 
    )`)

    const beneficiarioWhereClausePlano = beneficiarioConditionsPlano.length > 0
      ? `WHERE ${beneficiarioConditionsPlano.join(" AND ")}`
      : ""

    // Tipo de JOIN baseado no contexto (igual aos cards)
    const joinType = (isCardMae ? (tipo ? "INNER" : "LEFT") : (entidades.length > 0 || tipo ? "INNER" : "LEFT"))

    // Query para faixas etárias por plano - REPLICA EXATAMENTE a lógica dos cards
    // Cards MÃE: usa beneficiarioWhereClauseGeral (sem entidade/mês de reajuste)
    // Cards FILHOS: usa beneficiarioWhereClause (com entidade/mês de reajuste) + filtros no WHERE final
    // 
    // CORREÇÃO CRÍTICA: Para card filho com status="total", usar EXATAMENTE a mesma base_agregado
    // da query de planos (sqlPorPlanoEntidade), incluindo o agrupamento por CPF + entidade + mes_reajuste + status_final + plano
    // Isso garante que cada CPF seja contado apenas uma vez, mesmo que apareça com status diferentes
    
    // Para cards filhos com status="total", usar estrutura idêntica à query de planos
    const usarBaseAgregadaPlano = !isCardMae && statusParam === "total"
    
    const sqlFaixasEtarias = usarBaseAgregadaPlano ? `
      -- CORREÇÃO CRÍTICA: Para card filho com status="total", usar EXATAMENTE a mesma estrutura
      -- da query de planos (sqlPorPlanoEntidade), mas agrupando SEM status_final
      -- Isso garante que cada CPF seja contado apenas UMA VEZ, igual ao card mãe Total de Vidas
      WITH base AS (
        SELECT
          pr.mes,
          pr.cpf,
          pr.valor_total_cpf_mes,
          -- CORREÇÃO: Não calcular status_final aqui porque não vamos usar
          -- Quando status="total", não importa o status - queremos apenas 1 linha por CPF
          b.entidade,
          b.mes_reajuste,
          b.plano,
          b.tipo,
          -- Incluir idade para calcular faixa etária (pegar do beneficiário)
          b.idade,
          -- NET único por CPF (já agrupado no JOIN)
          COALESCE(f.vlr_net, 0) AS vlr_net_cpf
        FROM (
          SELECT
            DATE_FORMAT(p.data_competencia, '%Y-%m') AS mes,
            p.cpf,
            SUM(p.valor_procedimento) AS valor_total_cpf_mes
          FROM reg_procedimentos p
          WHERE ${procedimentosConditions.join(" AND ")}
          GROUP BY
            DATE_FORMAT(p.data_competencia, '%Y-%m'),
            p.cpf
        ) AS pr
        ${joinType} JOIN (
          SELECT
            b.cpf,
            SUBSTRING_INDEX(
              GROUP_CONCAT(
                b.status_beneficiario
                ORDER BY b.data_inicio_vigencia_beneficiario DESC
              ),
              ',',
              1
            ) AS status_beneficiario,
            SUBSTRING_INDEX(
              GROUP_CONCAT(
                b.entidade
                ORDER BY b.data_inicio_vigencia_beneficiario DESC
              ),
              ',',
              1
            ) AS entidade,
            SUBSTRING_INDEX(
              GROUP_CONCAT(
                b.mes_reajuste
                ORDER BY b.data_inicio_vigencia_beneficiario DESC
              ),
              ',',
              1
            ) AS mes_reajuste,
            SUBSTRING_INDEX(
              GROUP_CONCAT(
                b.plano
                ORDER BY b.data_inicio_vigencia_beneficiario DESC
              ),
              ',',
              1
            ) AS plano,
            SUBSTRING_INDEX(
              GROUP_CONCAT(
                b.tipo
                ORDER BY b.data_inicio_vigencia_beneficiario DESC
              ),
              ',',
              1
            ) AS tipo,
            SUBSTRING_INDEX(
              GROUP_CONCAT(
                CAST(b.idade AS CHAR)
                ORDER BY b.data_inicio_vigencia_beneficiario DESC
              ),
              ',',
              1
            ) AS idade
          FROM reg_beneficiarios b
          ${beneficiarioWhereClausePlano}
          GROUP BY
            b.cpf
        ) AS b
          ON b.cpf = pr.cpf
        LEFT JOIN (
          SELECT
            f.cpf_do_beneficiario AS cpf,
            MAX(f.vlr_net) AS vlr_net
          FROM reg_faturamento f
          GROUP BY f.cpf_do_beneficiario
        ) AS f
          ON f.cpf = pr.cpf
        WHERE b.plano = ?
          AND (b.entidade IS NOT NULL AND b.entidade != '')
          AND b.plano IS NOT NULL AND b.plano != ''
          ${entidades.length > 0 ? `AND b.entidade IN (${entidades.map(() => "?").join(",")})` : ''}
          ${mesesReajuste.length > 0 ? `AND b.mes_reajuste IN (${mesesReajuste.map(() => "?").join(",")})` : ''}
          ${tipo ? "AND b.tipo = ?" : ""}
      ),
      base_agregado AS (
        SELECT
          base.cpf,
          base.entidade,
          base.mes_reajuste,
          base.plano,
          -- Somar valores de procedimentos de TODOS os meses e TODOS os status para este CPF
          -- IMPORTANTE: Quando status="total", queremos somar valores de todos os status
          SUM(base.valor_total_cpf_mes) AS valor_total_cpf,
          -- NET único por CPF (usar MAX porque já é único por CPF)
          MAX(COALESCE(base.vlr_net_cpf, 0)) AS vlr_net_cpf,
          -- Pegar idade mais recente (ou NULL)
          -- IMPORTANTE: Pegar idade de qualquer status (não importa qual)
          -- Usar MAX para garantir que pegamos uma idade válida se houver múltiplas
          -- A idade já vem única do JOIN com beneficiários, mas usar MAX garante consistência
          MAX(CASE 
            WHEN base.idade IS NOT NULL AND CAST(base.idade AS UNSIGNED) > 0 
            THEN CAST(base.idade AS UNSIGNED) 
            ELSE NULL 
          END) AS idade
        FROM base
        -- CORREÇÃO CRÍTICA: Agrupar por CPF + entidade + mes_reajuste + plano
        -- SEM status_final e SEM mes, para garantir que cada CPF seja contado apenas UMA VEZ
        -- mesmo que apareça com status diferentes em meses diferentes
        -- Isso é EXATAMENTE a mesma base que alimenta o card mãe Total de Vidas
        -- quando somamos todos os status no front-end
        -- IMPORTANTE: Não incluir 'mes' nem 'status_final' no GROUP BY porque queremos
        -- agregar todos os meses e todos os status para cada CPF
        GROUP BY
          base.cpf,
          base.entidade,
          base.mes_reajuste,
          base.plano
      )
      SELECT
        CASE
          WHEN base_agregado.idade IS NULL OR base_agregado.idade = 0 THEN '00 a 18'
          WHEN CAST(base_agregado.idade AS UNSIGNED) <= 18 THEN '00 a 18'
          WHEN CAST(base_agregado.idade AS UNSIGNED) <= 23 THEN '19 a 23'
          WHEN CAST(base_agregado.idade AS UNSIGNED) <= 28 THEN '24 a 28'
          WHEN CAST(base_agregado.idade AS UNSIGNED) <= 33 THEN '29 a 33'
          WHEN CAST(base_agregado.idade AS UNSIGNED) <= 38 THEN '34 a 38'
          WHEN CAST(base_agregado.idade AS UNSIGNED) <= 43 THEN '39 a 43'
          WHEN CAST(base_agregado.idade AS UNSIGNED) <= 48 THEN '44 a 48'
          WHEN CAST(base_agregado.idade AS UNSIGNED) <= 53 THEN '49 a 53'
          WHEN CAST(base_agregado.idade AS UNSIGNED) <= 58 THEN '54 a 58'
          ELSE '59+'
        END AS faixa_etaria,
        -- CORREÇÃO CRÍTICA: Contar cada CPF apenas uma vez por faixa etária
        -- Como base_agregado já agrupa por CPF + entidade + mes_reajuste + plano (SEM status_final),
        -- cada CPF aparece apenas UMA VEZ em base_agregado
        -- COUNT(DISTINCT) garante que não haja duplicação mesmo se houver algum problema
        COUNT(DISTINCT base_agregado.cpf) AS vidas,
        -- Somar valores de todos os CPFs na faixa etária
        SUM(base_agregado.valor_total_cpf) AS valor,
        -- Somar valores NET de faturamento na faixa etária
        SUM(COALESCE(base_agregado.vlr_net_cpf, 0)) AS valor_net
      FROM base_agregado
      -- IMPORTANTE: Agrupar apenas por faixa_etaria
      -- Como base_agregado já tem 1 linha por CPF (agrupado por CPF + entidade + mes_reajuste + plano),
      -- cada CPF será contado apenas uma vez por faixa etária
      GROUP BY
        faixa_etaria
      ORDER BY
        CASE faixa_etaria
          WHEN '00 a 18' THEN 1
          WHEN '19 a 23' THEN 2
          WHEN '24 a 28' THEN 3
          WHEN '29 a 33' THEN 4
          WHEN '34 a 38' THEN 5
          WHEN '39 a 43' THEN 6
          WHEN '44 a 48' THEN 7
          WHEN '49 a 53' THEN 8
          WHEN '54 a 58' THEN 9
          WHEN '59+' THEN 10
          ELSE 11
        END
    ` : `
      -- Query original para cards mãe ou status diferente de "total"
      WITH base_mes_cpf AS (
        SELECT
          pr.mes,
          pr.cpf,
          pr.valor_total_cpf_mes,
          CASE
            WHEN b.cpf IS NULL THEN 'vazio'
            WHEN LOWER(b.status_beneficiario) = 'ativo' THEN 'ativo'
            ELSE 'inativo'
          END AS status_final,
          b.idade,
          b.plano,
          COALESCE(f.vlr_net, 0) AS vlr_net_cpf${!isCardMae ? `,
          b.entidade,
          b.mes_reajuste,
          b.tipo` : ''}
        FROM (
          SELECT
            DATE_FORMAT(p.data_competencia, '%Y-%m') AS mes,
            p.cpf,
            SUM(p.valor_procedimento) AS valor_total_cpf_mes
          FROM reg_procedimentos p
          WHERE ${procedimentosConditions.join(" AND ")}
          GROUP BY
            DATE_FORMAT(p.data_competencia, '%Y-%m'),
            p.cpf
        ) AS pr
        ${joinType} JOIN (
          SELECT
            b.cpf,
            SUBSTRING_INDEX(
              GROUP_CONCAT(
                b.status_beneficiario
                ORDER BY b.data_inicio_vigencia_beneficiario DESC
              ),
              ',',
              1
            ) AS status_beneficiario,
            SUBSTRING_INDEX(
              GROUP_CONCAT(
                CAST(b.idade AS CHAR)
                ORDER BY b.data_inicio_vigencia_beneficiario DESC
              ),
              ',',
              1
            ) AS idade,
            SUBSTRING_INDEX(
              GROUP_CONCAT(
                b.plano
                ORDER BY b.data_inicio_vigencia_beneficiario DESC
              ),
              ',',
              1
            ) AS plano${!isCardMae ? `,
            SUBSTRING_INDEX(
              GROUP_CONCAT(
                b.entidade
                ORDER BY b.data_inicio_vigencia_beneficiario DESC
              ),
              ',',
              1
            ) AS entidade,
            SUBSTRING_INDEX(
              GROUP_CONCAT(
                b.mes_reajuste
                ORDER BY b.data_inicio_vigencia_beneficiario DESC
              ),
              ',',
              1
            ) AS mes_reajuste,
            SUBSTRING_INDEX(
              GROUP_CONCAT(
                b.tipo
                ORDER BY b.data_inicio_vigencia_beneficiario DESC
              ),
              ',',
              1
            ) AS tipo` : ''}
          FROM reg_beneficiarios b
          ${beneficiarioWhereClausePlano}
          GROUP BY
            b.cpf
        ) AS b
          ON b.cpf = pr.cpf
        LEFT JOIN (
          SELECT
            f.cpf_do_beneficiario AS cpf,
            MAX(f.vlr_net) AS vlr_net
          FROM reg_faturamento f
          GROUP BY f.cpf_do_beneficiario
        ) AS f
          ON f.cpf = pr.cpf
        WHERE b.plano = ?
          ${!isCardMae ? `AND (b.entidade IS NOT NULL AND b.entidade != '')` : ''}
          ${!isCardMae && entidades.length > 0 ? `AND b.entidade IN (${entidades.map(() => "?").join(",")})` : ''}
          ${!isCardMae && mesesReajuste.length > 0 ? `AND b.mes_reajuste IN (${mesesReajuste.map(() => "?").join(",")})` : ''}
      ),
      base_cpf_filtrado AS (
        SELECT
          cpf,
          valor_total_cpf_mes,
          status_final,
          idade,
          vlr_net_cpf${!isCardMae ? `,
          entidade,
          mes_reajuste` : ''}
        FROM base_mes_cpf
        ${statusParam !== "total" ? `WHERE base_mes_cpf.status_final = ?` : ''}
      ),
      base_cpf_agregado AS (
        SELECT
          cpf,
          SUM(valor_total_cpf_mes) AS valor_total_cpf,
          MAX(vlr_net_cpf) AS valor_net_cpf,
          MAX(status_final) AS status_final,
          MAX(CASE 
            WHEN idade IS NOT NULL AND CAST(idade AS UNSIGNED) > 0 
            THEN CAST(idade AS UNSIGNED) 
            ELSE NULL 
          END) AS idade${!isCardMae ? `,
          MAX(entidade) AS entidade,
          MAX(mes_reajuste) AS mes_reajuste` : ''}
        FROM base_cpf_filtrado
        GROUP BY cpf
      )
      SELECT
        CASE
          WHEN base_cpf_agregado.idade IS NULL OR base_cpf_agregado.idade = 0 THEN '00 a 18'
          WHEN CAST(base_cpf_agregado.idade AS UNSIGNED) <= 18 THEN '00 a 18'
          WHEN CAST(base_cpf_agregado.idade AS UNSIGNED) <= 23 THEN '19 a 23'
          WHEN CAST(base_cpf_agregado.idade AS UNSIGNED) <= 28 THEN '24 a 28'
          WHEN CAST(base_cpf_agregado.idade AS UNSIGNED) <= 33 THEN '29 a 33'
          WHEN CAST(base_cpf_agregado.idade AS UNSIGNED) <= 38 THEN '34 a 38'
          WHEN CAST(base_cpf_agregado.idade AS UNSIGNED) <= 43 THEN '39 a 43'
          WHEN CAST(base_cpf_agregado.idade AS UNSIGNED) <= 48 THEN '44 a 48'
          WHEN CAST(base_cpf_agregado.idade AS UNSIGNED) <= 53 THEN '49 a 53'
          WHEN CAST(base_cpf_agregado.idade AS UNSIGNED) <= 58 THEN '54 a 58'
          ELSE '59+'
        END AS faixa_etaria,
        MAX(base_cpf_agregado.status_final) AS status_final,
        COUNT(DISTINCT base_cpf_agregado.cpf) AS vidas,
        SUM(base_cpf_agregado.valor_total_cpf) AS valor,
        SUM(COALESCE(base_cpf_agregado.valor_net_cpf, 0)) AS valor_net
      FROM base_cpf_agregado
      GROUP BY
        faixa_etaria
      ORDER BY
        CASE faixa_etaria
          WHEN '00 a 18' THEN 1
          WHEN '19 a 23' THEN 2
          WHEN '24 a 28' THEN 3
          WHEN '29 a 33' THEN 4
          WHEN '34 a 38' THEN 5
          WHEN '39 a 43' THEN 6
          WHEN '44 a 48' THEN 7
          WHEN '49 a 53' THEN 8
          WHEN '54 a 58' THEN 9
          WHEN '59+' THEN 10
          ELSE 11
        END
    `

    // Executar query
    // Ordem dos valores:
    // 1. procedimentosValues (para WHERE dos procedimentos)
    // 2. beneficiarioValuesPlano (para WHERE dos beneficiários - mesma base dos cards)
    //    - Para cards MÃE: apenas operadora, tipo, exclusões de odontológicos
    //    - Para cards FILHOS: operadora, entidade, mês de reajuste, tipo, exclusões de odontológicos
    // 3. plano (para filtro explícito no CTE base)
    // 4. Para cards FILHOS: entidades e mesesReajuste (para filtros no WHERE final do CTE)
    const queryValues: any[] = [
      ...procedimentosValues,
      ...beneficiarioValuesPlano,
      plano
    ]
    
    // Adicionar valores de entidade e mês de reajuste para filtros no WHERE final do CTE (cards filhos)
    // IMPORTANTE: Quando usarBaseAgregadaPlano é true, a ordem é:
    // 1. procedimentosValues
    // 2. beneficiarioValuesPlano
    // 3. plano
    // 4. entidades (se houver)
    // 5. mesesReajuste (se houver)
    // 6. tipo (se houver)
    if (!isCardMae) {
      if (entidades.length > 0) {
        queryValues.push(...entidades)
      }
      if (mesesReajuste.length > 0) {
        queryValues.push(...mesesReajuste)
      }
    }
    
    // Adicionar tipo se especificado (para usarBaseAgregadaPlano, o tipo vem do beneficiarioValuesPlano)
    // Mas precisamos adicionar aqui também se não estiver em beneficiarioValuesPlano
    // Na verdade, o tipo já está em beneficiarioValuesPlano, então não precisamos adicionar novamente
    
    // Adicionar status se não for "total" - apenas para query antiga (não usarBaseAgregadaPlano)
    if (!usarBaseAgregadaPlano && statusParam !== "total") {
      queryValues.push(statusParam)
    }
    
    const [rows]: any = await connection.execute(sqlFaixasEtarias, queryValues)

    // DEBUG TEMPORÁRIO: Verificar contagem de vidas para ANEC ASSIM MAX QC
    if (usarBaseAgregadaPlano && entidades.length > 0 && entidades.includes("ANEC") && plano && plano.includes("ASSIM MAX QC") && !plano.includes("R")) {
      const totalVidas = (rows || []).reduce((sum: number, row: any) => sum + (Number(row.vidas) || 0), 0)
      console.log("DEBUG FAIXAS ETARIAS - ANEC ASSIM MAX QC:", {
        plano,
        total_vidas_somadas: totalVidas,
        numero_faixas: (rows || []).length,
        faixas: (rows || []).map((r: any) => ({ faixa: r.faixa_etaria, vidas: r.vidas }))
      })
    }

    // Processar resultados
    // INTEGRAÇÃO: Incluído campo valor_net
    const faixasEtarias: Array<{
      faixa_etaria: string
      vidas: number
      valor: number
      valor_net: number
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

    // Processar resultados da query
    // CORREÇÃO: Quando usarBaseAgregadaPlano é true (card filho com status="total"),
    // a query não retorna status_final porque agrupamos sem ele para evitar duplicação
    ;(rows || []).forEach((row: any) => {
      const faixa = row.faixa_etaria || '00 a 18'
      const status = row.status_final || (usarBaseAgregadaPlano ? 'total' : 'vazio')
      const vidas = Number(row.vidas) || 0
      const valor = Number(row.valor) || 0
      const valorNet = Number(row.valor_net) || 0

      // Filtrar por status se especificado
      // Quando statusParam === "total" ou usarBaseAgregadaPlano, incluímos todos os status
      // Como já agrupamos por CPF sem status_final quando usarBaseAgregadaPlano, não há duplicação
      if (usarBaseAgregadaPlano || statusParam === "total" || statusParam === status) {
        const atual = faixasMap.get(faixa) || { vidas: 0, valor: 0, valor_net: 0 }
        atual.vidas += vidas
        atual.valor += valor
        atual.valor_net += valorNet
        faixasMap.set(faixa, atual)
      }
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

