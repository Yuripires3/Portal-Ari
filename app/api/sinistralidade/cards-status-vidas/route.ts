export const dynamic = "force-dynamic"
export const revalidate = 0
export const fetchCache = "force-no-store"

import { NextRequest, NextResponse } from "next/server"
import { getDBConnection } from "@/lib/db"

/**
 * GET /api/sinistralidade/cards-status-vidas
 * 
 * Retorna cards de status de vidas (Ativo, Inativo, Não Localizado, Total)
 * com valores agregados por período, respeitando todos os filtros.
 * 
 * Parâmetros:
 * - meses_referencia: string separada por vírgula (ex: "2025-01,2025-02") - obrigatório
 * - operadoras: string separada por vírgula (opcional, padrão: ASSIM SAÚDE)
 * - entidades: string separada por vírgula (opcional)
 * - tipo: string (opcional, "Todos" ignora o filtro)
 * - cpf: string (opcional, apenas números)
 * 
 * Retorno:
 * {
 *   por_mes: [...],
 *   consolidado: { ativo, inativo, nao_localizado, total_vidas, valor_ativo, ... }
 * }
 * 
 * LÓGICA DE STATUS (preservada da query original):
 * - 'vazio' (não localizado): quando CPF não existe em reg_beneficiarios
 * - 'ativo': quando status_beneficiario mais recente = 'ativo' (case insensitive)
 * - 'inativo': qualquer outro caso
 */
export async function GET(request: NextRequest) {
  let connection: any = null

  try {
    const searchParams = request.nextUrl.searchParams
    const mesesReferenciaParam = searchParams.get("meses_referencia")
    const operadorasParam = searchParams.get("operadoras")
    const entidadesParam = searchParams.get("entidades")
    const tipoParam = searchParams.get("tipo")
    const cpfParam = searchParams.get("cpf")

    if (!mesesReferenciaParam) {
      return NextResponse.json(
        { error: "Parâmetro obrigatório: meses_referencia (formato: YYYY-MM,YYYY-MM,...)" },
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
        { error: "Nenhum mês válido fornecido. Formato esperado: YYYY-MM" },
        { status: 400 }
      )
    }

    // Calcular data_inicio e data_fim baseado nos meses
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
      : ["ASSIM SAÚDE"] // Default

    const entidades = entidadesParam
      ? entidadesParam.split(",").map(e => e.trim()).filter(Boolean)
      : []

    const tipo = tipoParam && tipoParam !== "Todos" ? tipoParam.trim() : null
    const cpf = cpfParam ? cpfParam.trim().replace(/\D/g, "") : null

    connection = await getDBConnection()

    // Construir condições WHERE para procedimentos
    const procedimentosConditions: string[] = []
    const procedimentosValues: any[] = []

    // Filtro de operadora nos procedimentos
    if (operadoras.length > 0) {
      procedimentosConditions.push(`p.operadora IN (${operadoras.map(() => "?").join(",")})`)
      procedimentosValues.push(...operadoras)
    }

    // Filtro de evento (sempre presente)
    procedimentosConditions.push("p.evento IS NOT NULL")

    // Filtro de data (período baseado nos meses)
    procedimentosConditions.push("DATE(p.data_competencia) BETWEEN ? AND ?")
    procedimentosValues.push(dataInicio, dataFim)

    // Filtro de mês específico (garantir que só pegue meses selecionados)
    procedimentosConditions.push(`DATE_FORMAT(p.data_competencia, '%Y-%m') IN (${mesesReferencia.map(() => "?").join(",")})`)
    procedimentosValues.push(...mesesReferencia)

    // Filtro de CPF nos procedimentos
    if (cpf) {
      procedimentosConditions.push("p.cpf = ?")
      procedimentosValues.push(cpf)
    }

    // Construir condições WHERE para beneficiários (SEM filtro de entidade para consolidado geral)
    const beneficiarioConditionsGeral: string[] = []
    const beneficiarioValuesGeral: any[] = []

    // Filtro de operadora nos beneficiários
    if (operadoras.length > 0) {
      beneficiarioConditionsGeral.push(`b.operadora IN (${operadoras.map(() => "?").join(",")})`)
      beneficiarioValuesGeral.push(...operadoras)
    }

    // NÃO incluir filtro de entidade aqui - queremos o total geral da operadora/período

    // Filtro de tipo
    if (tipo) {
      beneficiarioConditionsGeral.push("b.tipo = ?")
      beneficiarioValuesGeral.push(tipo)
    }

    // Filtro de CPF nos beneficiários
    if (cpf) {
      beneficiarioConditionsGeral.push("b.cpf = ?")
      beneficiarioValuesGeral.push(cpf)
    }

    // Excluir planos odontológicos
    beneficiarioConditionsGeral.push(`(
      UPPER(b.plano) NOT LIKE '%DENT%' 
      AND UPPER(b.plano) NOT LIKE '%AESP%' 
    )`)

    const beneficiarioWhereClauseGeral = beneficiarioConditionsGeral.length > 0
      ? `WHERE ${beneficiarioConditionsGeral.join(" AND ")}`
      : ""

    // Construir condições WHERE para beneficiários (COM filtro de entidade para cards de entidades)
    const beneficiarioConditions: string[] = []
    const beneficiarioValues: any[] = []

    // Filtro de operadora nos beneficiários
    if (operadoras.length > 0) {
      beneficiarioConditions.push(`b.operadora IN (${operadoras.map(() => "?").join(",")})`)
      beneficiarioValues.push(...operadoras)
    }

    // Filtro de entidade (usado apenas para cards de entidades)
    if (entidades.length > 0) {
      beneficiarioConditions.push(`b.entidade IN (${entidades.map(() => "?").join(",")})`)
      beneficiarioValues.push(...entidades)
    }

    // Filtro de tipo
    if (tipo) {
      beneficiarioConditions.push("b.tipo = ?")
      beneficiarioValues.push(tipo)
    }

    // Filtro de CPF nos beneficiários
    if (cpf) {
      beneficiarioConditions.push("b.cpf = ?")
      beneficiarioValues.push(cpf)
    }

    // Excluir planos odontológicos
    beneficiarioConditions.push(`(
      UPPER(b.plano) NOT LIKE '%DENT%' 
      AND UPPER(b.plano) NOT LIKE '%AESP%' 
    )`)

    const beneficiarioWhereClause = beneficiarioConditions.length > 0
      ? `WHERE ${beneficiarioConditions.join(" AND ")}`
      : ""

    // QUERY PARA CONSOLIDADO GERAL (sem filtro de entidade)
    // Os cards principais sempre mostram o total da operadora/período, independente do filtro de entidade
    const sqlGeral = `
      SELECT
        m.mes AS mes,
        -- quantidades de CPFs
        SUM(CASE WHEN m.status_final = 'ativo'   THEN 1 ELSE 0 END) AS ativo,
        SUM(CASE WHEN m.status_final = 'inativo' THEN 1 ELSE 0 END) AS inativo,
        SUM(CASE WHEN m.status_final = 'vazio'   THEN 1 ELSE 0 END) AS nao_localizado,
        COUNT(*) AS total_vidas,
        -- valores por status
        SUM(CASE WHEN m.status_final = 'ativo'   THEN m.valor_total_cpf_mes ELSE 0 END) AS valor_ativo,
        SUM(CASE WHEN m.status_final = 'inativo' THEN m.valor_total_cpf_mes ELSE 0 END) AS valor_inativo,
        SUM(CASE WHEN m.status_final = 'vazio'   THEN m.valor_total_cpf_mes ELSE 0 END) AS valor_nao_localizado,
        -- valor total no mês
        SUM(m.valor_total_cpf_mes) AS valor_total_geral
      FROM (
        -- 1 linha por CPF/mês, com valor total do CPF no mês + status final
        SELECT
          pr.mes,
          pr.cpf,
          pr.valor_total_cpf_mes,
          CASE
            WHEN b.cpf IS NULL THEN 'vazio'
            WHEN LOWER(b.status_beneficiario) = 'ativo' THEN 'ativo'
            ELSE 'inativo'
          END AS status_final
        FROM (
          -- soma todos os procedimentos de cada CPF em cada mês (sem join ainda)
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
        ${tipo || cpf ? "INNER" : "LEFT"} JOIN (
          -- garante 1 ÚNICA linha por CPF com o status da vigência mais recente
          -- SEM filtro de entidade - queremos o total geral
          SELECT
            b.cpf,
            SUBSTRING_INDEX(
              GROUP_CONCAT(
                b.status_beneficiario
                ORDER BY b.data_inicio_vigencia_beneficiario DESC
              ),
              ',',
              1
            ) AS status_beneficiario
          FROM reg_beneficiarios b
          ${beneficiarioWhereClauseGeral}
          GROUP BY
            b.cpf
        ) AS b
          ON b.cpf = pr.cpf
      ) AS m
      GROUP BY
        m.mes
      ORDER BY
        m.mes
    `

    // Query adicional para agregação por entidade separada por status
    // Retorna entidades para cada status: ativo, inativo, vazio (não localizado)
    const sqlPorEntidade = `
      SELECT
        base.entidade,
        base.status_final,
        COUNT(DISTINCT base.cpf) AS vidas,
        SUM(base.valor_total_cpf_mes) AS valor_total
      FROM (
        SELECT
          pr.mes,
          pr.cpf,
          pr.valor_total_cpf_mes,
          CASE
            WHEN b.cpf IS NULL THEN 'vazio'
            WHEN LOWER(b.status_beneficiario) = 'ativo' THEN 'ativo'
            ELSE 'inativo'
          END AS status_final,
          b.entidade,
          b.tipo
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
        ${entidades.length > 0 || tipo ? "INNER" : "LEFT"} JOIN (
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
                b.tipo
                ORDER BY b.data_inicio_vigencia_beneficiario DESC
              ),
              ',',
              1
            ) AS tipo
          FROM reg_beneficiarios b
          ${beneficiarioWhereClause}
          GROUP BY
            b.cpf
        ) AS b
          ON b.cpf = pr.cpf
      ) AS base
      WHERE base.entidade IS NOT NULL AND base.entidade != ''
      ${entidades.length > 0 ? `AND base.entidade IN (${entidades.map(() => "?").join(",")})` : ""}
      ${tipo ? "AND base.tipo = ?" : ""}
      ${cpf ? "AND base.cpf = ?" : ""}
      GROUP BY
        base.entidade,
        base.status_final
      ORDER BY
        base.status_final,
        valor_total DESC
    `

    // Executar query de status por mês (CONSOLIDADO GERAL - sem filtro de entidade)
    const [rowsGeral]: any = await connection.execute(sqlGeral, [
      ...procedimentosValues,
      ...beneficiarioValuesGeral
    ])

    // Preparar valores para query por entidade
    const entidadeValues: any[] = []
    if (entidades.length > 0) {
      entidadeValues.push(...entidades)
    }
    if (tipo) {
      entidadeValues.push(tipo)
    }
    if (cpf) {
      entidadeValues.push(cpf)
    }

    // Executar query por entidade
    const [rowsPorEntidade]: any = await connection.execute(sqlPorEntidade, [
      ...procedimentosValues,
      ...beneficiarioValues,
      ...entidadeValues
    ])

    // Processar resultados do consolidado geral (sem filtro de entidade)
    const porMesGeral = (rowsGeral || []).map((row: any) => ({
      mes: row.mes,
      ativo: Number(row.ativo) || 0,
      inativo: Number(row.inativo) || 0,
      nao_localizado: Number(row.nao_localizado) || 0,
      total_vidas: Number(row.total_vidas) || 0,
      valor_ativo: Number(row.valor_ativo) || 0,
      valor_inativo: Number(row.valor_inativo) || 0,
      valor_nao_localizado: Number(row.valor_nao_localizado) || 0,
      valor_total_geral: Number(row.valor_total_geral) || 0,
    }))

    // Calcular consolidado GERAL (soma de todos os meses, SEM filtro de entidade)
    // Este é o total da operadora/período que será usado nos cards principais
    const consolidadoGeral = porMesGeral.reduce(
      (acc, mes) => ({
        ativo: acc.ativo + mes.ativo,
        inativo: acc.inativo + mes.inativo,
        nao_localizado: acc.nao_localizado + mes.nao_localizado,
        total_vidas: acc.total_vidas + mes.total_vidas,
        valor_ativo: acc.valor_ativo + mes.valor_ativo,
        valor_inativo: acc.valor_inativo + mes.valor_inativo,
        valor_nao_localizado: acc.valor_nao_localizado + mes.valor_nao_localizado,
        valor_total_geral: acc.valor_total_geral + mes.valor_total_geral,
      }),
      {
        ativo: 0,
        inativo: 0,
        nao_localizado: 0,
        total_vidas: 0,
        valor_ativo: 0,
        valor_inativo: 0,
        valor_nao_localizado: 0,
        valor_total_geral: 0,
      }
    )

    // Consolidado para retorno (sempre usa o geral, independente de filtro de entidade)
    const consolidado = consolidadoGeral

    // Processar dados por entidade separados por status
    const entidadesPorStatus: Record<string, Array<{
      entidade: string
      vidas: number
      valor_total: number
      pct_vidas: number
      pct_valor: number
    }>> = {
      ativo: [],
      inativo: [],
      vazio: [],
    }

    // Agrupar por status
    ;(rowsPorEntidade || []).forEach((row: any) => {
      const status = row.status_final || "vazio"
      const entidade = row.entidade || ""
      const vidas = Number(row.vidas) || 0
      const valorTotal = Number(row.valor_total) || 0

      if (!entidade) return

      // Calcular percentuais baseado no CONSOLIDADO GERAL (total da operadora/período)
      // As porcentagens das entidades devem ser calculadas sobre o total das vidas dos cards mandante:
      // - Card "Vidas Ativas" → porcentagens calculadas sobre consolidadoGeral.ativo
      // - Card "Vidas Inativas" → porcentagens calculadas sobre consolidadoGeral.inativo
      // - Card "Vidas Não Localizadas" → porcentagens calculadas sobre consolidadoGeral.nao_localizado
      // - Card "Total de Vidas" → porcentagens calculadas sobre consolidadoGeral.total_vidas
      let pctVidas = 0
      let pctValor = 0

      if (status === "ativo") {
        // Porcentagem calculada sobre o total de vidas ativas do card mandante
        pctVidas = consolidadoGeral.ativo > 0 ? vidas / consolidadoGeral.ativo : 0
        pctValor = consolidadoGeral.valor_ativo > 0 ? valorTotal / consolidadoGeral.valor_ativo : 0
      } else if (status === "inativo") {
        // Porcentagem calculada sobre o total de vidas inativas do card mandante
        pctVidas = consolidadoGeral.inativo > 0 ? vidas / consolidadoGeral.inativo : 0
        pctValor = consolidadoGeral.valor_inativo > 0 ? valorTotal / consolidadoGeral.valor_inativo : 0
      } else if (status === "vazio") {
        // Porcentagem calculada sobre o total de vidas não localizadas do card mandante
        pctVidas = consolidadoGeral.nao_localizado > 0 ? vidas / consolidadoGeral.nao_localizado : 0
        pctValor = consolidadoGeral.valor_nao_localizado > 0 ? valorTotal / consolidadoGeral.valor_nao_localizado : 0
      }

      entidadesPorStatus[status].push({
        entidade,
        vidas,
        valor_total: valorTotal,
        pct_vidas: pctVidas,
        pct_valor: pctValor,
      })
    })

    // Ordenar cada lista por valor_total DESC e limitar a top 6
    Object.keys(entidadesPorStatus).forEach((status) => {
      entidadesPorStatus[status] = entidadesPorStatus[status]
        .sort((a, b) => b.valor_total - a.valor_total)
        .slice(0, 6)
    })

    // Calcular total agregado por entidade (todas as entidades juntas)
    const entidadesTotalMap = new Map<string, { entidade: string; vidas: number; valor_total: number }>()
    
    ;[...entidadesPorStatus.ativo, ...entidadesPorStatus.inativo, ...entidadesPorStatus.vazio].forEach((item) => {
      const atual = entidadesTotalMap.get(item.entidade) || { entidade: item.entidade, vidas: 0, valor_total: 0 }
      atual.vidas += item.vidas
      atual.valor_total += item.valor_total
      entidadesTotalMap.set(item.entidade, atual)
    })

    const entidadesTotal = Array.from(entidadesTotalMap.values())
      .sort((a, b) => b.valor_total - a.valor_total)
      .slice(0, 6)
      .map((item) => ({
        ...item,
        // Porcentagem calculada sobre o total de vidas do card mandante "Total de Vidas"
        pct_vidas: consolidadoGeral.total_vidas > 0 ? item.vidas / consolidadoGeral.total_vidas : 0,
        pct_valor: consolidadoGeral.valor_total_geral > 0 ? item.valor_total / consolidadoGeral.valor_total_geral : 0,
      }))

    // Query para distribuição por plano nos cards principais (por status)
    const sqlPorPlanoGeral = `
      SELECT
        m.status_final,
        m.plano,
        COUNT(DISTINCT m.cpf) AS vidas,
        SUM(m.valor_total_cpf_mes) AS valor
      FROM (
        SELECT
          pr.mes,
          pr.cpf,
          pr.valor_total_cpf_mes,
          CASE
            WHEN b.cpf IS NULL THEN 'vazio'
            WHEN LOWER(b.status_beneficiario) = 'ativo' THEN 'ativo'
            ELSE 'inativo'
          END AS status_final,
          b.plano
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
        ${tipo || cpf ? "INNER" : "LEFT"} JOIN (
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
                b.plano
                ORDER BY b.data_inicio_vigencia_beneficiario DESC
              ),
              ',',
              1
            ) AS plano
          FROM reg_beneficiarios b
          ${beneficiarioWhereClauseGeral}
          GROUP BY
            b.cpf
        ) AS b
          ON b.cpf = pr.cpf
      ) AS m
      WHERE m.plano IS NOT NULL AND m.plano != ''
      GROUP BY
        m.status_final,
        m.plano
      ORDER BY
        m.status_final,
        COUNT(DISTINCT m.cpf) DESC
    `

    // Query para distribuição por plano nos cards de entidade (por entidade e status)
    const sqlPorPlanoEntidade = `
      SELECT
        base.entidade,
        base.status_final,
        base.plano,
        COUNT(DISTINCT base.cpf) AS vidas,
        SUM(base.valor_total_cpf_mes) AS valor
      FROM (
        SELECT
          pr.mes,
          pr.cpf,
          pr.valor_total_cpf_mes,
          CASE
            WHEN b.cpf IS NULL THEN 'vazio'
            WHEN LOWER(b.status_beneficiario) = 'ativo' THEN 'ativo'
            ELSE 'inativo'
          END AS status_final,
          b.entidade,
          b.plano,
          b.tipo
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
        ${entidades.length > 0 || tipo ? "INNER" : "LEFT"} JOIN (
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
            ) AS tipo
          FROM reg_beneficiarios b
          ${beneficiarioWhereClause}
          GROUP BY
            b.cpf
        ) AS b
          ON b.cpf = pr.cpf
      ) AS base
      WHERE base.entidade IS NOT NULL AND base.entidade != ''
        AND base.plano IS NOT NULL AND base.plano != ''
      ${entidades.length > 0 ? `AND base.entidade IN (${entidades.map(() => "?").join(",")})` : ""}
      ${tipo ? "AND base.tipo = ?" : ""}
      ${cpf ? "AND base.cpf = ?" : ""}
      GROUP BY
        base.entidade,
        base.status_final,
        base.plano
      ORDER BY
        base.entidade,
        base.status_final,
        COUNT(DISTINCT base.cpf) DESC
    `

    // Executar queries de distribuição por plano
    const [rowsPorPlanoGeral]: any = await connection.execute(sqlPorPlanoGeral, [
      ...procedimentosValues,
      ...beneficiarioValuesGeral
    ])

    const [rowsPorPlanoEntidade]: any = await connection.execute(sqlPorPlanoEntidade, [
      ...procedimentosValues,
      ...beneficiarioValues,
      ...entidadeValues
    ])

    // Processar distribuição por plano para cards principais
    const porPlanoGeral: Record<string, Array<{ plano: string; vidas: number; valor: number }>> = {
      ativo: [],
      inativo: [],
      vazio: [],
      total: [],
    }

    const planoTotalMap = new Map<string, { vidas: number; valor: number }>()

    ;(rowsPorPlanoGeral || []).forEach((row: any) => {
      const status = row.status_final || "vazio"
      const plano = row.plano || ""
      const vidas = Number(row.vidas) || 0
      const valor = Number(row.valor) || 0

      if (!plano) return

      if (status === "ativo" || status === "inativo" || status === "vazio") {
        if (!porPlanoGeral[status]) {
          porPlanoGeral[status] = []
        }
        porPlanoGeral[status].push({ plano, vidas, valor })
      }

      // Acumular para total
      const atual = planoTotalMap.get(plano) || { vidas: 0, valor: 0 }
      atual.vidas += vidas
      atual.valor += valor
      planoTotalMap.set(plano, atual)
    })

    // Ordenar cada array por vidas (do maior para o menor)
    Object.keys(porPlanoGeral).forEach((status) => {
      if (porPlanoGeral[status]) {
        porPlanoGeral[status].sort((a, b) => b.vidas - a.vidas)
      }
    })

    porPlanoGeral.total = Array.from(planoTotalMap.entries())
      .map(([plano, { vidas, valor }]) => ({ plano, vidas, valor }))
      .sort((a, b) => b.vidas - a.vidas)

    // Processar distribuição por plano para cards de entidade
    const porPlanoEntidade: Record<string, Record<string, Array<{ plano: string; vidas: number; valor: number }>>> = {}

    ;(rowsPorPlanoEntidade || []).forEach((row: any) => {
      const entidade = row.entidade || ""
      const status = row.status_final || "vazio"
      const plano = row.plano || ""
      const vidas = Number(row.vidas) || 0
      const valor = Number(row.valor) || 0

      if (!entidade || !plano) return

      if (!porPlanoEntidade[entidade]) {
        porPlanoEntidade[entidade] = {}
      }
      if (!porPlanoEntidade[entidade][status]) {
        porPlanoEntidade[entidade][status] = []
      }
      porPlanoEntidade[entidade][status].push({ plano, vidas, valor })
    })

    // Ordenar planos por vidas (do maior para o menor) em cada entidade/status
    Object.keys(porPlanoEntidade).forEach((entidade) => {
      Object.keys(porPlanoEntidade[entidade]).forEach((status) => {
        if (porPlanoEntidade[entidade][status]) {
          porPlanoEntidade[entidade][status].sort((a, b) => b.vidas - a.vidas)
        }
      })
    })

    // Adicionar distribuição por plano aos dados de entidade
    const entidadesComPlano = {
      ativo: entidadesPorStatus.ativo.map((ent) => ({
        ...ent,
        por_plano: porPlanoEntidade[ent.entidade]?.ativo || [],
      })),
      inativo: entidadesPorStatus.inativo.map((ent) => ({
        ...ent,
        por_plano: porPlanoEntidade[ent.entidade]?.inativo || [],
      })),
      nao_localizado: entidadesPorStatus.vazio.map((ent) => ({
        ...ent,
        por_plano: porPlanoEntidade[ent.entidade]?.vazio || [],
      })),
      total: entidadesTotal.map((ent) => {
        // Para total, somar todos os planos de todos os status da entidade
        const planosMap = new Map<string, { vidas: number; valor: number }>()
        Object.values(porPlanoEntidade[ent.entidade] || {}).forEach((planos) => {
          planos.forEach((p) => {
            const atual = planosMap.get(p.plano) || { vidas: 0, valor: 0 }
            atual.vidas += p.vidas
            atual.valor += p.valor
            planosMap.set(p.plano, atual)
          })
        })
        return {
          ...ent,
          por_plano: Array.from(planosMap.entries())
            .map(([plano, { vidas, valor }]) => ({ plano, vidas, valor }))
            .sort((a, b) => b.vidas - a.vidas),
        }
      }),
    }

    return NextResponse.json({
      por_mes: porMesGeral,
      consolidado: {
        ...consolidado,
        por_plano: {
          ativo: porPlanoGeral.ativo,
          inativo: porPlanoGeral.inativo,
          nao_localizado: porPlanoGeral.vazio,
          total: porPlanoGeral.total,
        },
      },
      por_entidade: entidadesComPlano,
    })
  } catch (error: any) {
    console.error("Erro ao buscar cards de status de vidas:", error)
    return NextResponse.json(
      { error: error.message || "Erro ao buscar cards de status de vidas" },
      { status: 500 }
    )
  } finally {
    if (connection) {
      await connection.end()
    }
  }
}

