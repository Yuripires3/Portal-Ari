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
    // INTEGRAÇÃO: Adicionado LEFT JOIN com reg_faturamento para trazer vlr_net por CPF
    const sqlGeral = `
      SELECT
        m.mes AS mes,
        -- quantidades de CPFs
        SUM(CASE WHEN m.status_final = 'ativo'   THEN 1 ELSE 0 END) AS ativo,
        SUM(CASE WHEN m.status_final = 'inativo' THEN 1 ELSE 0 END) AS inativo,
        SUM(CASE WHEN m.status_final = 'vazio'   THEN 1 ELSE 0 END) AS nao_localizado,
        COUNT(*) AS total_vidas,
        -- valores por status (procedimentos)
        SUM(CASE WHEN m.status_final = 'ativo'   THEN m.valor_total_cpf_mes ELSE 0 END) AS valor_ativo,
        SUM(CASE WHEN m.status_final = 'inativo' THEN m.valor_total_cpf_mes ELSE 0 END) AS valor_inativo,
        SUM(CASE WHEN m.status_final = 'vazio'   THEN m.valor_total_cpf_mes ELSE 0 END) AS valor_nao_localizado,
        -- valor total no mês (procedimentos)
        SUM(m.valor_total_cpf_mes) AS valor_total_geral,
        -- valores de faturamento NET por status
        SUM(CASE WHEN m.status_final = 'ativo'   THEN COALESCE(m.vlr_net_cpf, 0) ELSE 0 END) AS valor_net_ativo,
        SUM(CASE WHEN m.status_final = 'inativo' THEN COALESCE(m.vlr_net_cpf, 0) ELSE 0 END) AS valor_net_inativo,
        SUM(CASE WHEN m.status_final = 'vazio'   THEN COALESCE(m.vlr_net_cpf, 0) ELSE 0 END) AS valor_net_nao_localizado,
        SUM(COALESCE(m.vlr_net_cpf, 0)) AS valor_net_total_geral
      FROM (
        -- 1 linha por CPF/mês, com valor total do CPF no mês + status final + valores de faturamento
        SELECT
          pr.mes,
          pr.cpf,
          pr.valor_total_cpf_mes,
          CASE
            WHEN b.cpf IS NULL THEN 'vazio'
            WHEN LOWER(b.status_beneficiario) = 'ativo' THEN 'ativo'
            ELSE 'inativo'
          END AS status_final,
          COALESCE(f.vlr_net, 0) AS vlr_net_cpf
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
        LEFT JOIN (
          -- Trazer valores de faturamento por CPF (1 registro por CPF conforme especificação)
          -- Usar MAX para garantir apenas 1 valor por CPF caso haja inconsistências
          SELECT
            f.cpf_do_beneficiario AS cpf,
            MAX(f.vlr_net) AS vlr_net
          FROM reg_faturamento f
          GROUP BY f.cpf_do_beneficiario
        ) AS f
          ON f.cpf = pr.cpf
      ) AS m
      GROUP BY
        m.mes
      ORDER BY
        m.mes
    `

    // Query adicional para agregação por entidade separada por status e mês de reajuste
    // Retorna entidades para cada status: ativo, inativo, vazio (não localizado)
    // INTEGRAÇÃO: Adicionado LEFT JOIN com reg_faturamento para trazer vlr_net por CPF
    const sqlPorEntidade = `
      SELECT
        base.entidade,
        base.mes_reajuste,
        base.status_final,
        COUNT(DISTINCT base.cpf) AS vidas,
        SUM(base.valor_total_cpf_mes) AS valor_total,
        SUM(COALESCE(base.vlr_net_cpf, 0)) AS valor_net_total
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
          b.mes_reajuste,
          b.tipo,
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
            ) AS tipo
          FROM reg_beneficiarios b
          ${beneficiarioWhereClause}
          GROUP BY
            b.cpf
        ) AS b
          ON b.cpf = pr.cpf
        LEFT JOIN (
          -- Trazer valores de faturamento por CPF (1 registro por CPF conforme especificação)
          -- Usar MAX para garantir apenas 1 valor por CPF caso haja inconsistências
          SELECT
            f.cpf_do_beneficiario AS cpf,
            MAX(f.vlr_net) AS vlr_net
          FROM reg_faturamento f
          GROUP BY f.cpf_do_beneficiario
        ) AS f
          ON f.cpf = pr.cpf
      ) AS base
      WHERE base.entidade IS NOT NULL AND base.entidade != ''
      ${entidades.length > 0 ? `AND base.entidade IN (${entidades.map(() => "?").join(",")})` : ""}
      ${tipo ? "AND base.tipo = ?" : ""}
      ${cpf ? "AND base.cpf = ?" : ""}
      GROUP BY
        base.entidade,
        base.mes_reajuste,
        base.status_final
      ORDER BY
        base.status_final,
        base.entidade,
        base.mes_reajuste,
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
    // INTEGRAÇÃO: Incluídos campos de faturamento NET e VENDA
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
      valor_net_ativo: Number(row.valor_net_ativo) || 0,
      valor_net_inativo: Number(row.valor_net_inativo) || 0,
      valor_net_nao_localizado: Number(row.valor_net_nao_localizado) || 0,
      valor_net_total_geral: Number(row.valor_net_total_geral) || 0,
    }))

    // Calcular consolidado GERAL (soma de todos os meses, SEM filtro de entidade)
    // Este é o total da operadora/período que será usado nos cards principais
    // INTEGRAÇÃO: Incluídos campos de faturamento NET e VENDA no consolidado
    type ConsolidadoTipo = {
      ativo: number
      inativo: number
      nao_localizado: number
      total_vidas: number
      valor_ativo: number
      valor_inativo: number
      valor_nao_localizado: number
      valor_total_geral: number
      valor_net_ativo: number
      valor_net_inativo: number
      valor_net_nao_localizado: number
      valor_net_total_geral: number
    }
    type PorMesTipo = ConsolidadoTipo & { mes: string }
    const valorInicial: ConsolidadoTipo = {
      ativo: 0,
      inativo: 0,
      nao_localizado: 0,
      total_vidas: 0,
      valor_ativo: 0,
      valor_inativo: 0,
      valor_nao_localizado: 0,
      valor_total_geral: 0,
      valor_net_ativo: 0,
      valor_net_inativo: 0,
      valor_net_nao_localizado: 0,
      valor_net_total_geral: 0,
    }
    const consolidadoGeral = porMesGeral.reduce(
      (acc: ConsolidadoTipo, mes: PorMesTipo): ConsolidadoTipo => ({
        ativo: acc.ativo + mes.ativo,
        inativo: acc.inativo + mes.inativo,
        nao_localizado: acc.nao_localizado + mes.nao_localizado,
        total_vidas: acc.total_vidas + mes.total_vidas,
        valor_ativo: acc.valor_ativo + mes.valor_ativo,
        valor_inativo: acc.valor_inativo + mes.valor_inativo,
        valor_nao_localizado: acc.valor_nao_localizado + mes.valor_nao_localizado,
        valor_total_geral: acc.valor_total_geral + mes.valor_total_geral,
        valor_net_ativo: acc.valor_net_ativo + mes.valor_net_ativo,
        valor_net_inativo: acc.valor_net_inativo + mes.valor_net_inativo,
        valor_net_nao_localizado: acc.valor_net_nao_localizado + mes.valor_net_nao_localizado,
        valor_net_total_geral: acc.valor_net_total_geral + mes.valor_net_total_geral,
      }),
      valorInicial
    )

    // Consolidado para retorno (sempre usa o geral, independente de filtro de entidade)
    const consolidado = consolidadoGeral

    // Processar dados por entidade separados por status e mês de reajuste
    // INTEGRAÇÃO: Incluídos campos de faturamento NET e VENDA
    const entidadesPorStatus: Record<string, Array<{
      entidade: string
      mes_reajuste?: string | null
      vidas: number
      valor_total: number
      valor_net_total: number
      pct_vidas: number
      pct_valor: number
    }>> = {
      ativo: [],
      inativo: [],
      vazio: [],
    }

    // Agrupar por status e mês de reajuste
    // INTEGRAÇÃO: Incluídos valores de faturamento NET e VENDA
    ;(rowsPorEntidade || []).forEach((row: any) => {
      const status = row.status_final || "vazio"
      const entidade = row.entidade || ""
      const mesReajuste = row.mes_reajuste || null
      const vidas = Number(row.vidas) || 0
      const valorTotal = Number(row.valor_total) || 0
      const valorNetTotal = Number(row.valor_net_total) || 0

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
        mes_reajuste: mesReajuste,
        vidas,
        valor_total: valorTotal,
        valor_net_total: valorNetTotal,
        pct_vidas: pctVidas,
        pct_valor: pctValor,
      })
    })

    // Ordenar cada lista: primeiro por entidade, depois por mês de reajuste, depois por valor_total DESC
    Object.keys(entidadesPorStatus).forEach((status) => {
      entidadesPorStatus[status] = entidadesPorStatus[status]
        .sort((a, b) => {
          // Primeiro ordena por entidade
          if (a.entidade !== b.entidade) {
            return a.entidade.localeCompare(b.entidade)
          }
          // Depois por mês de reajuste (nulls por último)
          if (a.mes_reajuste !== b.mes_reajuste) {
            if (!a.mes_reajuste) return 1
            if (!b.mes_reajuste) return -1
            return a.mes_reajuste.localeCompare(b.mes_reajuste)
          }
          // Por último por valor_total DESC
          return b.valor_total - a.valor_total
        })
    })

    // Calcular total agregado por entidade e mês de reajuste (todas as entidades juntas)
    // Manter separado por mês de reajuste para exibir cards individuais
    // INTEGRAÇÃO: Incluídos campos de faturamento NET e VENDA
    const entidadesTotal: Array<{
      entidade: string
      mes_reajuste?: string | null
      vidas: number
      valor_total: number
      valor_net_total: number
      pct_vidas: number
      pct_valor: number
    }> = []
    
    ;[...entidadesPorStatus.ativo, ...entidadesPorStatus.inativo, ...entidadesPorStatus.vazio].forEach((item) => {
      entidadesTotal.push({
        entidade: item.entidade,
        mes_reajuste: item.mes_reajuste,
        vidas: item.vidas,
        valor_total: item.valor_total,
        valor_net_total: item.valor_net_total,
        // Porcentagem calculada sobre o total de vidas do card mandante "Total de Vidas"
        pct_vidas: consolidadoGeral.total_vidas > 0 ? item.vidas / consolidadoGeral.total_vidas : 0,
        pct_valor: consolidadoGeral.valor_total_geral > 0 ? item.valor_total / consolidadoGeral.valor_total_geral : 0,
      })
    })

    // Ordenar por entidade, depois por mês de reajuste, depois por valor_total DESC
    entidadesTotal.sort((a, b) => {
      if (a.entidade !== b.entidade) {
        return a.entidade.localeCompare(b.entidade)
      }
      if (a.mes_reajuste !== b.mes_reajuste) {
        if (!a.mes_reajuste) return -1
        if (!b.mes_reajuste) return 1
        return a.mes_reajuste.localeCompare(b.mes_reajuste)
      }
      return b.valor_total - a.valor_total
    })

    // Query para distribuição por plano nos cards principais (por status)
    // INTEGRAÇÃO: Adicionado LEFT JOIN com reg_faturamento para trazer vlr_net por CPF
    const sqlPorPlanoGeral = `
      SELECT
        m.status_final,
        m.plano,
        COUNT(DISTINCT m.cpf) AS vidas,
        SUM(m.valor_total_cpf_mes) AS valor,
        SUM(COALESCE(m.vlr_net_cpf, 0)) AS valor_net
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
          b.plano,
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
        LEFT JOIN (
          SELECT
            f.cpf_do_beneficiario AS cpf,
            MAX(f.vlr_net) AS vlr_net
          FROM reg_faturamento f
          GROUP BY f.cpf_do_beneficiario
        ) AS f
          ON f.cpf = pr.cpf
      ) AS m
      WHERE m.plano IS NOT NULL AND m.plano != ''
      GROUP BY
        m.status_final,
        m.plano
      ORDER BY
        m.status_final,
        COUNT(DISTINCT m.cpf) DESC
    `

    // Query para distribuição por plano nos cards de entidade (por entidade, mês de reajuste e status)
    // INTEGRAÇÃO: Adicionado LEFT JOIN com reg_faturamento para trazer vlr_net por CPF
    // CORREÇÃO PROBLEMA 1: Garantir que o NET seja somado corretamente no nível do plano
    // IMPORTANTE: O NET é um valor único por CPF, não por mês. Precisamos garantir que cada CPF
    // contribua apenas uma vez com seu NET, mesmo que apareça em múltiplos meses.
    const sqlPorPlanoEntidade = `
      SELECT
        base_agregado.entidade,
        base_agregado.mes_reajuste,
        base_agregado.status_final,
        base_agregado.plano,
        COUNT(DISTINCT base_agregado.cpf) AS vidas,
        SUM(base_agregado.valor_total_cpf) AS valor,
        -- CORREÇÃO PROBLEMA 1: Somar o NET de cada CPF único
        -- Como cada CPF tem apenas 1 valor NET (já garantido no base_agregado com MAX),
        -- e estamos agrupando por CPF no base_agregado, cada CPF aparece apenas uma vez
        -- por combinação de (entidade, mes_reajuste, status_final, plano)
        -- Portanto, a soma está correta - estamos somando o NET de CPFs diferentes
        -- IMPORTANTE: Usar COALESCE para garantir que NULL seja tratado como 0
        -- Mas preservar valores válidos (incluindo 0, que é um valor válido)
        COALESCE(SUM(base_agregado.vlr_net_cpf), 0) AS valor_net
      FROM (
        SELECT
          base.cpf,
          base.entidade,
          base.mes_reajuste,
          base.status_final,
          base.plano,
          -- Somar valores de procedimentos de todos os meses para este CPF
          SUM(base.valor_total_cpf_mes) AS valor_total_cpf,
          -- CORREÇÃO PROBLEMA 1: Garantir que cada CPF tenha apenas 1 valor NET
          -- Como cada CPF tem apenas 1 valor NET em reg_faturamento, e estamos fazendo
          -- JOIN com uma subquery que já agrupa por CPF, todos os valores de vlr_net_cpf
          -- para o mesmo CPF serão iguais. Usar MAX para garantir que pegamos o valor único.
          -- IMPORTANTE: Não usar SUM aqui porque o NET é por CPF, não por mês!
          MAX(COALESCE(base.vlr_net_cpf, 0)) AS vlr_net_cpf
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
          b.mes_reajuste,
          b.plano,
          b.tipo,
          -- CORREÇÃO PROBLEMA 1: Garantir que o NET seja trazido corretamente
          -- O JOIN com reg_faturamento já garante 1 valor por CPF (subquery com GROUP BY)
          -- Usar COALESCE para garantir que sempre tenha um valor (0 se NULL)
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
            ) AS tipo
          FROM reg_beneficiarios b
          ${beneficiarioWhereClause}
          GROUP BY
            b.cpf
        ) AS b
          ON b.cpf = pr.cpf
        LEFT JOIN (
          -- CORREÇÃO PROBLEMA 1: Garantir apenas 1 registro por CPF de reg_faturamento
          -- Usar subquery com GROUP BY para garantir unicidade antes do JOIN
          -- Isso é CRÍTICO para evitar duplicação do NET
          SELECT
            f.cpf_do_beneficiario AS cpf,
            MAX(f.vlr_net) AS vlr_net
          FROM reg_faturamento f
          GROUP BY f.cpf_do_beneficiario
        ) AS f
          ON f.cpf = pr.cpf
      ) AS base
      WHERE base.entidade IS NOT NULL AND base.entidade != ''
        AND base.plano IS NOT NULL AND base.plano != ''
      ${entidades.length > 0 ? `AND base.entidade IN (${entidades.map(() => "?").join(",")})` : ""}
      ${tipo ? "AND base.tipo = ?" : ""}
      ${cpf ? "AND base.cpf = ?" : ""}
      -- CORREÇÃO PROBLEMA 1: Agrupar por CPF + outros campos para garantir que cada CPF
      -- apareça apenas uma vez por combinação de (entidade, mes_reajuste, status_final, plano)
      -- IMPORTANTE: Não incluir 'mes' no GROUP BY porque queremos agregar todos os meses
      -- Isso garante que o NET seja contado apenas uma vez por CPF, mesmo que apareça em múltiplos meses
      GROUP BY
        base.cpf,
        base.entidade,
        base.mes_reajuste,
        base.status_final,
        base.plano
      ) AS base_agregado
      -- Agrupar por plano para obter totais por plano
      GROUP BY
        base_agregado.entidade,
        base_agregado.mes_reajuste,
        base_agregado.status_final,
        base_agregado.plano
      ORDER BY
        base_agregado.entidade,
        base_agregado.mes_reajuste,
        base_agregado.status_final,
        COUNT(DISTINCT base_agregado.cpf) DESC
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

    // DEBUG TEMPORÁRIO: Verificar se o NET está sendo retornado corretamente da query
    if (rowsPorPlanoEntidade && rowsPorPlanoEntidade.length > 0) {
      // Procurar por ANEC ASSIM MAX QC
      const exemplo = rowsPorPlanoEntidade.find((r: any) => 
        (r.entidade === "ANEC" || r.entidade === "UGES") && 
        r.plano && 
        (r.plano.includes("ASSIM MAX QC") || r.plano.includes("IDEAL QC R"))
      )
      if (exemplo) {
        console.log("DEBUG NET - Exemplo encontrado:", {
          entidade: exemplo.entidade,
          plano: exemplo.plano,
          status: exemplo.status_final,
          vidas: exemplo.vidas,
          valor: exemplo.valor,
          valor_net: exemplo.valor_net,
          valor_net_type: typeof exemplo.valor_net,
          valor_net_is_null: exemplo.valor_net === null,
          valor_net_is_undefined: exemplo.valor_net === undefined,
          valor_net_raw: JSON.stringify(exemplo.valor_net)
        })
      } else {
        console.log("DEBUG NET - Nenhum exemplo encontrado. Total de linhas:", rowsPorPlanoEntidade.length)
        if (rowsPorPlanoEntidade.length > 0) {
          console.log("DEBUG NET - Primeiras 3 linhas:", rowsPorPlanoEntidade.slice(0, 3).map((r: any) => ({
            entidade: r.entidade,
            plano: r.plano,
            valor_net: r.valor_net
          })))
        }
      }
    }

    // Processar distribuição por plano para cards principais
    // INTEGRAÇÃO: Incluído campo valor_net
    const porPlanoGeral: Record<string, Array<{ plano: string; vidas: number; valor: number; valor_net: number }>> = {
      ativo: [],
      inativo: [],
      vazio: [],
      total: [],
    }

    const planoTotalMap = new Map<string, { vidas: number; valor: number; valor_net: number }>()

    ;(rowsPorPlanoGeral || []).forEach((row: any) => {
      const status = row.status_final || "vazio"
      const plano = row.plano || ""
      const vidas = Number(row.vidas) || 0
      const valor = Number(row.valor) || 0
      const valorNet = Number(row.valor_net) || 0

      if (!plano) return

      if (status === "ativo" || status === "inativo" || status === "vazio") {
        if (!porPlanoGeral[status]) {
          porPlanoGeral[status] = []
        }
        porPlanoGeral[status].push({ plano, vidas, valor, valor_net: valorNet })
      }

      // Acumular para total
      const atual = planoTotalMap.get(plano) || { vidas: 0, valor: 0, valor_net: 0 }
      atual.vidas += vidas
      atual.valor += valor
      atual.valor_net += valorNet
      planoTotalMap.set(plano, atual)
    })

    // Ordenar cada array por vidas (do maior para o menor)
    Object.keys(porPlanoGeral).forEach((status) => {
      if (porPlanoGeral[status]) {
        porPlanoGeral[status].sort((a, b) => b.vidas - a.vidas)
      }
    })

    porPlanoGeral.total = Array.from(planoTotalMap.entries())
      .map(([plano, { vidas, valor, valor_net }]) => ({ plano, vidas, valor, valor_net }))
      .sort((a, b) => b.vidas - a.vidas)

    // Processar distribuição por plano para cards de entidade (agrupado por entidade, mês de reajuste e status)
    // INTEGRAÇÃO: Incluído campo valor_net
    const porPlanoEntidade: Record<string, Record<string, Record<string, Array<{ plano: string; vidas: number; valor: number; valor_net: number }>>>> = {}

    ;(rowsPorPlanoEntidade || []).forEach((row: any) => {
      const entidade = row.entidade || ""
      const mesReajuste = row.mes_reajuste || null
      const status = row.status_final || "vazio"
      const plano = row.plano || ""
      const vidas = Number(row.vidas) || 0
      const valor = Number(row.valor) || 0
      // CORREÇÃO PROBLEMA 1: Garantir que valor_net seja tratado corretamente
      // IMPORTANTE: Não tratar 0 como ausência de valor - 0 é um valor válido
      // Apenas tratar null/undefined como 0
      const valorNetRaw = row.valor_net
      const valorNet = (valorNetRaw !== null && valorNetRaw !== undefined && !isNaN(Number(valorNetRaw))) 
        ? Number(valorNetRaw) 
        : 0

      // DEBUG TEMPORÁRIO: Log para ANEC ASSIM MAX QC
      if (entidade === "ANEC" && plano && plano.includes("ASSIM MAX QC") && !plano.includes("R")) {
        console.log("DEBUG NET - Processando ANEC ASSIM MAX QC:", {
          entidade,
          plano,
          status,
          vidas,
          valor,
          valor_net_raw: valorNetRaw,
          valor_net_processed: valorNet,
          valor_net_type: typeof valorNetRaw,
          valor_net_is_null: valorNetRaw === null,
          valor_net_is_undefined: valorNetRaw === undefined
        })
      }

      if (!entidade || !plano) return

      const keyMesReajuste = mesReajuste || "sem_mes"

      if (!porPlanoEntidade[entidade]) {
        porPlanoEntidade[entidade] = {}
      }
      if (!porPlanoEntidade[entidade][keyMesReajuste]) {
        porPlanoEntidade[entidade][keyMesReajuste] = {}
      }
      if (!porPlanoEntidade[entidade][keyMesReajuste][status]) {
        porPlanoEntidade[entidade][keyMesReajuste][status] = []
      }
      porPlanoEntidade[entidade][keyMesReajuste][status].push({ plano, vidas, valor, valor_net: valorNet })
    })

    // Ordenar planos por vidas (do maior para o menor) em cada entidade/mês de reajuste/status
    Object.keys(porPlanoEntidade).forEach((entidade) => {
      Object.keys(porPlanoEntidade[entidade]).forEach((mesReajuste) => {
        Object.keys(porPlanoEntidade[entidade][mesReajuste]).forEach((status) => {
          if (porPlanoEntidade[entidade][mesReajuste][status]) {
            porPlanoEntidade[entidade][mesReajuste][status].sort((a, b) => b.vidas - a.vidas)
          }
        })
      })
    })

    // Adicionar distribuição por plano aos dados de entidade
    const entidadesComPlano = {
      ativo: entidadesPorStatus.ativo.map((ent) => {
        const keyMesReajuste = ent.mes_reajuste || "sem_mes"
        return {
          ...ent,
          por_plano: porPlanoEntidade[ent.entidade]?.[keyMesReajuste]?.ativo || [],
        }
      }),
      inativo: entidadesPorStatus.inativo.map((ent) => {
        const keyMesReajuste = ent.mes_reajuste || "sem_mes"
        return {
          ...ent,
          por_plano: porPlanoEntidade[ent.entidade]?.[keyMesReajuste]?.inativo || [],
        }
      }),
      nao_localizado: entidadesPorStatus.vazio.map((ent) => {
        const keyMesReajuste = ent.mes_reajuste || "sem_mes"
        return {
          ...ent,
          por_plano: porPlanoEntidade[ent.entidade]?.[keyMesReajuste]?.vazio || [],
        }
      }),
      total: entidadesTotal.map((ent) => {
        // Para total, somar todos os planos de todos os status e meses de reajuste da entidade
        // CORREÇÃO PROBLEMA 1: Somar valor_net corretamente, garantindo que valores null/undefined sejam tratados como 0
        const planosMap = new Map<string, { vidas: number; valor: number; valor_net: number }>()
        
        // DEBUG: Verificar estrutura de dados
        if (ent.entidade === "ANEC") {
          console.log("DEBUG NET TOTAL - Estrutura porPlanoEntidade para ANEC:", {
            tem_dados: !!porPlanoEntidade[ent.entidade],
            keys_mes_reajuste: porPlanoEntidade[ent.entidade] ? Object.keys(porPlanoEntidade[ent.entidade]) : [],
            exemplo_mes_reajuste: porPlanoEntidade[ent.entidade] ? Object.keys(porPlanoEntidade[ent.entidade][Object.keys(porPlanoEntidade[ent.entidade])[0]] || {}) : []
          })
        }
        
        // CORREÇÃO PROBLEMA 1: Iterar sobre meses de reajuste e status de forma explícita
        // para garantir que o NET seja preservado corretamente
        Object.keys(porPlanoEntidade[ent.entidade] || {}).forEach((mesReajuste) => {
          const porMesReajuste = porPlanoEntidade[ent.entidade][mesReajuste]
          if (!porMesReajuste) return
          
          // Iterar sobre cada status (ativo, inativo, vazio)
          Object.keys(porMesReajuste).forEach((status) => {
            const planos = porMesReajuste[status]
            if (!planos || !Array.isArray(planos)) return
            
            planos.forEach((p) => {
              const atual = planosMap.get(p.plano) || { vidas: 0, valor: 0, valor_net: 0 }
              atual.vidas += p.vidas
              atual.valor += p.valor
              // CORREÇÃO PROBLEMA 1: Somar valor_net corretamente
              // IMPORTANTE: Preservar o valor mesmo se for 0, apenas tratar null/undefined como 0
              // Não usar || 0 porque isso transformaria 0 em 0, mas também pode mascarar problemas
              // Usar verificação explícita para garantir que valores válidos (incluindo 0) sejam preservados
              const valorNetAtual = (p.valor_net !== null && p.valor_net !== undefined && !isNaN(Number(p.valor_net))) 
                ? Number(p.valor_net) 
                : 0
              
              // DEBUG TEMPORÁRIO: Log para ANEC ASSIM MAX QC no total
              if (ent.entidade === "ANEC" && p.plano && p.plano.includes("ASSIM MAX QC") && !p.plano.includes("R")) {
                console.log("DEBUG NET TOTAL - Agregando ANEC ASSIM MAX QC:", {
                  entidade: ent.entidade,
                  plano: p.plano,
                  mes_reajuste: mesReajuste,
                  status: status,
                  valor_net_original: p.valor_net,
                  valor_net_type: typeof p.valor_net,
                  valor_net_is_null: p.valor_net === null,
                  valor_net_is_undefined: p.valor_net === undefined,
                  valor_net_processado: valorNetAtual,
                  acumulado_antes: atual.valor_net,
                  acumulado_depois: atual.valor_net + valorNetAtual
                })
              }
              
              atual.valor_net += valorNetAtual
              planosMap.set(p.plano, atual)
            })
          })
        })
        return {
          ...ent,
          por_plano: Array.from(planosMap.entries())
            .map(([plano, { vidas, valor, valor_net }]) => {
              // CORREÇÃO PROBLEMA 1: Preservar o valor_net mesmo se for 0
              // IMPORTANTE: Não zerar o valor, apenas garantir que seja um número válido
              // O componente frontend decide se mostra "-" ou o valor baseado em > 0
              // Mas aqui devemos preservar o valor real (mesmo que seja 0) para que a soma esteja correta
              const netValue = (valor_net !== null && valor_net !== undefined && !isNaN(valor_net)) 
                ? valor_net 
                : 0
              return { 
                plano, 
                vidas, 
                valor, 
                valor_net: netValue
              }
            })
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

