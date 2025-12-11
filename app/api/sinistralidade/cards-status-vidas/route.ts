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
    // 🔵 QUERY OFICIAL: Seguindo EXATAMENTE a estrutura fornecida
    // Agrupa por mes, entidade, plano, mes_reajuste, faixa_etaria (conforme query SQL fornecida)
    const sqlGeral = `
      SELECT
        m.mes,
        m.entidade,
        m.plano,
        m.mes_reajuste,
        m.faixa_etaria,
        SUM(CASE WHEN m.status_final = 'ativo'   THEN 1 ELSE 0 END) AS vidas_ativas,
        SUM(CASE WHEN m.status_final = 'inativo' THEN 1 ELSE 0 END) AS vidas_inativas,
        SUM(CASE WHEN m.status_final = 'vazio'   THEN 1 ELSE 0 END) AS vidas_nao_localizadas,
        COUNT(*) AS total_vidas,
        SUM(CASE WHEN m.status_final = 'ativo'   THEN m.valor_faturamento   ELSE 0 END) AS valor_fat_ativo,
        SUM(CASE WHEN m.status_final = 'inativo' THEN m.valor_faturamento   ELSE 0 END) AS valor_fat_inativo,
        SUM(CASE WHEN m.status_final = 'vazio'   THEN m.valor_faturamento   ELSE 0 END) AS valor_fat_nao_localizado,
        SUM(m.valor_faturamento) AS valor_faturamento_total,
        SUM(CASE WHEN m.status_final = 'ativo'   THEN m.valor_procedimentos ELSE 0 END) AS valor_proc_ativo,
        SUM(CASE WHEN m.status_final = 'inativo' THEN m.valor_procedimentos ELSE 0 END) AS valor_proc_inativo,
        SUM(CASE WHEN m.status_final = 'vazio'   THEN m.valor_procedimentos ELSE 0 END) AS valor_proc_nao_localizado,
        SUM(m.valor_procedimentos) AS valor_procedimentos_total
      FROM (
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
          ${beneficiarioWhereClauseGeral}
          GROUP BY
            b.cpf
        ) AS b
          ON b.cpf = base.cpf
      ) AS m
      GROUP BY
        m.mes,
        m.entidade,
        m.plano,
        m.mes_reajuste,
        m.faixa_etaria
      ORDER BY
        m.mes,
        m.entidade,
        m.plano,
        m.mes_reajuste,
        m.faixa_etaria
    `

    // Query adicional para agregação por entidade separada por status, mês de reajuste e faixa etária
    // 🔵 QUERY OFICIAL: Seguindo EXATAMENTE a estrutura da query fornecida
    // Agrupa por entidade, plano, mes_reajuste, faixa_etaria e status (conforme query SQL fornecida)
    const sqlPorEntidade = `
      SELECT
        m.entidade,
        m.plano,
        m.mes_reajuste,
        m.faixa_etaria,
        m.status_final,
        SUM(CASE WHEN m.status_final = 'ativo'   THEN 1 ELSE 0 END) AS vidas_ativas,
        SUM(CASE WHEN m.status_final = 'inativo' THEN 1 ELSE 0 END) AS vidas_inativas,
        SUM(CASE WHEN m.status_final = 'vazio'   THEN 1 ELSE 0 END) AS vidas_nao_localizadas,
        COUNT(*) AS total_vidas,
        SUM(CASE WHEN m.status_final = 'ativo'   THEN m.valor_faturamento   ELSE 0 END) AS valor_fat_ativo,
        SUM(CASE WHEN m.status_final = 'inativo' THEN m.valor_faturamento   ELSE 0 END) AS valor_fat_inativo,
        SUM(CASE WHEN m.status_final = 'vazio'   THEN m.valor_faturamento   ELSE 0 END) AS valor_fat_nao_localizado,
        SUM(m.valor_faturamento) AS valor_faturamento_total,
        SUM(CASE WHEN m.status_final = 'ativo'   THEN m.valor_procedimentos ELSE 0 END) AS valor_proc_ativo,
        SUM(CASE WHEN m.status_final = 'inativo' THEN m.valor_procedimentos ELSE 0 END) AS valor_proc_inativo,
        SUM(CASE WHEN m.status_final = 'vazio'   THEN m.valor_procedimentos ELSE 0 END) AS valor_proc_nao_localizado,
        SUM(m.valor_procedimentos) AS valor_procedimentos_total
      FROM (
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
          ${beneficiarioWhereClauseGeral}
          GROUP BY
            b.cpf
        ) AS b
          ON b.cpf = base.cpf
      ) AS m
      WHERE m.entidade IS NOT NULL AND m.entidade != ''
      ${entidades.length > 0 ? `AND m.entidade IN (${entidades.map(() => "?").join(",")})` : ""}
      ${cpf ? "AND m.cpf = ?" : ""}
      GROUP BY
        m.entidade,
        m.plano,
        m.mes_reajuste,
        m.faixa_etaria,
        m.status_final
      ORDER BY
        m.status_final,
        m.entidade,
        m.plano,
        m.mes_reajuste,
        m.faixa_etaria
    `

    // Executar query de status por mês (CONSOLIDADO GERAL - sem filtro de entidade)
    // Valores: procedimentos (inclui operadoras), operadoras para faturamento, beneficiários
    const valoresGeral: any[] = [
      ...procedimentosValues,
      ...(operadoras.length > 0 ? operadoras : []),
      ...beneficiarioValuesGeral
    ]
    const [rowsGeral]: any = await connection.execute(sqlGeral, valoresGeral)

    // 🔵 QUERY OFICIAL: Calcular consolidado geral diretamente da query (sem agregações intermediárias)
    // Esta query retorna o consolidado total somando TODAS as linhas retornadas por sqlGeral
    const consolidadoGeralDireto = (rowsGeral || []).reduce((acc: any, row: any) => {
      return {
        ativo: acc.ativo + (Number(row.vidas_ativas) || 0),
        inativo: acc.inativo + (Number(row.vidas_inativas) || 0),
        nao_localizado: acc.nao_localizado + (Number(row.vidas_nao_localizadas) || 0),
        total_vidas: acc.total_vidas + (Number(row.total_vidas) || 0),
        valor_ativo: acc.valor_ativo + (Number(row.valor_proc_ativo) || 0),
        valor_inativo: acc.valor_inativo + (Number(row.valor_proc_inativo) || 0),
        valor_nao_localizado: acc.valor_nao_localizado + (Number(row.valor_proc_nao_localizado) || 0),
        valor_total_geral: acc.valor_total_geral + (Number(row.valor_procedimentos_total) || 0),
        valor_net_ativo: acc.valor_net_ativo + (Number(row.valor_fat_ativo) || 0),
        valor_net_inativo: acc.valor_net_inativo + (Number(row.valor_fat_inativo) || 0),
        valor_net_nao_localizado: acc.valor_net_nao_localizado + (Number(row.valor_fat_nao_localizado) || 0),
        valor_net_total_geral: acc.valor_net_total_geral + (Number(row.valor_faturamento_total) || 0),
      }
    }, {
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
    })

    // Preparar valores para query por entidade
    // Valores: procedimentos (inclui operadoras), operadoras para faturamento, beneficiários gerais (para status),
    // entidades, cpf
    const entidadeValues: any[] = []
    if (entidades.length > 0) {
      entidadeValues.push(...entidades)
    }
    if (cpf) {
      entidadeValues.push(cpf)
    }

    // Executar query por entidade
    const valoresPorEntidade: any[] = [
      ...procedimentosValues,
      ...(operadoras.length > 0 ? operadoras : []),
      ...beneficiarioValuesGeral,
      ...entidadeValues
    ]
    const [rowsPorEntidade]: any = await connection.execute(sqlPorEntidade, valoresPorEntidade)

    // Processar resultados do consolidado geral (sem filtro de entidade)
    // 🔵 QUERY OFICIAL: Agregar por mês (a query retorna múltiplas linhas por mês - uma por cada combinação de entidade, plano, mes_reajuste, faixa_etaria)
    const porMesMap = new Map<string, {
      mes: string
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
    }>()

    ;(rowsGeral || []).forEach((row: any) => {
      const mes = row.mes
      const atual = porMesMap.get(mes) || {
        mes,
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

      atual.ativo += Number(row.vidas_ativas) || 0
      atual.inativo += Number(row.vidas_inativas) || 0
      atual.nao_localizado += Number(row.vidas_nao_localizadas) || 0
      atual.total_vidas += Number(row.total_vidas) || 0
      atual.valor_ativo += Number(row.valor_proc_ativo) || 0
      atual.valor_inativo += Number(row.valor_proc_inativo) || 0
      atual.valor_nao_localizado += Number(row.valor_proc_nao_localizado) || 0
      atual.valor_total_geral += Number(row.valor_procedimentos_total) || 0
      atual.valor_net_ativo += Number(row.valor_fat_ativo) || 0
      atual.valor_net_inativo += Number(row.valor_fat_inativo) || 0
      atual.valor_net_nao_localizado += Number(row.valor_fat_nao_localizado) || 0
      atual.valor_net_total_geral += Number(row.valor_faturamento_total) || 0

      porMesMap.set(mes, atual)
    })

    const porMesGeral = Array.from(porMesMap.values()).sort((a, b) => a.mes.localeCompare(b.mes))

    // 🔵 QUERY OFICIAL: Tipo para consolidado
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
    
    // 🔵 QUERY OFICIAL: Usar o consolidado calculado diretamente da query (sem agregações intermediárias)
    // O consolidadoGeralDireto já foi calculado somando TODAS as linhas retornadas pela query
    const consolidadoGeral: ConsolidadoTipo = consolidadoGeralDireto

    // Consolidado para retorno (sempre usa o geral, independente de filtro de entidade)
    const consolidado = consolidadoGeral

    // Processar dados por entidade separados por status e mês de reajuste
    // 🔵 QUERY OFICIAL: Agregar por entidade, mes_reajuste, status_final (a query retorna múltiplas linhas por combinação)
    // Também preservar drill-downs por plano e faixa_etaria
    const entidadesPorStatusMap = new Map<string, {
      entidade: string
      mes_reajuste?: string | null
      vidas: number
      valor_total: number
      valor_net_total: number
      pct_vidas: number
      pct_valor: number
      por_plano: Map<string, { 
        plano: string
        vidas: number
        valor: number
        valor_net: number
        por_faixa_etaria: Map<string, { faixa_etaria: string; vidas: number; valor: number; valor_net: number }>
      }>
      por_faixa_etaria: Map<string, { faixa_etaria: string; vidas: number; valor: number; valor_net: number }>
    }>()

    // Agrupar por entidade, mes_reajuste e status_final
    // DEBUG: Criar um mapa para rastrear linhas específicas do CLASSIFOC QC
    const debugMap = new Map<string, any[]>()
    // DEBUG: Rastrear todas as linhas processadas para verificar duplicações
    const linhasProcessadas = new Map<string, { count: number; valores: any[] }>()
    // CORREÇÃO: Usar um mapa para garantir que cada combinação única seja processada apenas uma vez
    const linhasUnicasMap = new Map<string, any>()
    
    ;(rowsPorEntidade || []).forEach((row: any) => {
      const status = row.status_final || "vazio"
      const entidade = row.entidade || ""
      const mesReajuste = row.mes_reajuste || null
      const plano = row.plano || ""
      const faixaEtaria = row.faixa_etaria || ""
      
      if (!entidade) return

      // CORREÇÃO: Criar chave única para cada combinação
      const linhaKey = `${entidade}|${mesReajuste || 'null'}|${status}|${plano}|${faixaEtaria}`
      
      // DEBUG: Verificar duplicações
      const existing = linhasProcessadas.get(linhaKey)
      if (existing) {
        existing.count++
        existing.valores.push(row)
        if (entidade === "ANEC" && plano && plano.includes("CLASSIFOC QC")) {
          console.warn(`⚠️ DUPLICAÇÃO DETECTADA: ${linhaKey} (${existing.count} vezes)`)
          console.warn(`  Valores:`, existing.valores.map((r: any) => ({
            total_vidas: r.total_vidas,
            valor_procedimentos_total: r.valor_procedimentos_total
          })))
        }
      } else {
        linhasProcessadas.set(linhaKey, { count: 1, valores: [row] })
      }
      
      // CORREÇÃO: Se já processamos esta combinação, usar o valor acumulado
      if (linhasUnicasMap.has(linhaKey)) {
        const existente = linhasUnicasMap.get(linhaKey)!
        existente.total_vidas += Number(row.total_vidas) || 0
        existente.valor_procedimentos_total += Number(row.valor_procedimentos_total) || 0
        existente.valor_faturamento_total += Number(row.valor_faturamento_total) || 0
        return // Não processar novamente, já foi acumulado
      }
      
      // Armazenar linha única
      linhasUnicasMap.set(linhaKey, {
        ...row,
        total_vidas: Number(row.total_vidas) || 0,
        valor_procedimentos_total: Number(row.valor_procedimentos_total) || 0,
        valor_faturamento_total: Number(row.valor_faturamento_total) || 0
      })

    })
    
    // CORREÇÃO: Processar apenas linhas únicas
    linhasUnicasMap.forEach((row, linhaKey) => {
      const status = row.status_final || "vazio"
      const entidade = row.entidade || ""
      const mesReajuste = row.mes_reajuste || null
      const plano = row.plano || ""
      const faixaEtaria = row.faixa_etaria || ""
      
      // DEBUG: Rastrear linhas do CLASSIFOC QC da ANEC em julho
      if (entidade === "ANEC" && plano && plano.includes("CLASSIFOC QC") && mesReajuste && mesReajuste.toLowerCase().includes("julho")) {
        const debugKey = `${entidade}|${mesReajuste}|${status}|${plano}`
        if (!debugMap.has(debugKey)) {
          debugMap.set(debugKey, [])
        }
        debugMap.get(debugKey)!.push({
          faixa_etaria: faixaEtaria,
          total_vidas: row.total_vidas,
          valor_procedimentos_total: row.valor_procedimentos_total,
          valor_faturamento_total: row.valor_faturamento_total,
          row: row
        })
      }

      const key = `${entidade}|${mesReajuste || 'null'}|${status}`
      const atual = entidadesPorStatusMap.get(key) || {
        entidade,
        mes_reajuste: mesReajuste,
        vidas: 0,
        valor_total: 0,
        valor_net_total: 0,
        pct_vidas: 0,
        pct_valor: 0,
        por_plano: new Map(),
        por_faixa_etaria: new Map(),
      }

      // Agregar valores totais (já acumulados no linhasUnicasMap)
      const vidas = row.total_vidas || 0
      const valorTotal = row.valor_procedimentos_total || 0
      const valorNetTotal = row.valor_faturamento_total || 0

      atual.vidas += vidas
      atual.valor_total += valorTotal
      atual.valor_net_total += valorNetTotal

      // CORREÇÃO: Garantir que todas as linhas sejam contadas, mesmo sem faixa_etaria
      const faixaEtariaFinal = faixaEtaria || "Não informado"

      // Drill-down por plano
      if (plano) {
        const planoAtual = atual.por_plano.get(plano) || { 
          plano, 
          vidas: 0, 
          valor: 0, 
          valor_net: 0,
          por_faixa_etaria: new Map<string, { faixa_etaria: string; vidas: number; valor: number; valor_net: number }>()
        }
        const vidasAntes = planoAtual.vidas
        planoAtual.vidas += vidas
        planoAtual.valor += valorTotal
        planoAtual.valor_net += valorNetTotal
        
        // Adicionar faixa etária ao plano específico
        const faixaPlanoAtual = planoAtual.por_faixa_etaria.get(faixaEtariaFinal) || { 
          faixa_etaria: faixaEtariaFinal, 
          vidas: 0, 
          valor: 0, 
          valor_net: 0 
        }
        faixaPlanoAtual.vidas += vidas
        faixaPlanoAtual.valor += valorTotal
        faixaPlanoAtual.valor_net += valorNetTotal
        planoAtual.por_faixa_etaria.set(faixaEtariaFinal, faixaPlanoAtual)
        
        // DEBUG: Log para CLASSIFOC QC durante a construção
        if (entidade === "ANEC" && plano.includes("CLASSIFOC QC") && mesReajuste && mesReajuste.toLowerCase().includes("julho")) {
          console.log(`🔍 DEBUG CONSTRUÇÃO POR_PLANO - ${entidade} ${mesReajuste} ${status} ${plano}:`)
          console.log(`  Faixa: ${faixaEtariaFinal}, Vidas desta linha: ${vidas}, Vidas antes: ${vidasAntes}, Vidas depois: ${planoAtual.vidas}`)
        }
        
        atual.por_plano.set(plano, planoAtual)
      }

      // Drill-down por faixa etária (da entidade)
      const faixaAtual = atual.por_faixa_etaria.get(faixaEtariaFinal) || { faixa_etaria: faixaEtariaFinal, vidas: 0, valor: 0, valor_net: 0 }
      faixaAtual.vidas += vidas
      faixaAtual.valor += valorTotal
      faixaAtual.valor_net += valorNetTotal
      atual.por_faixa_etaria.set(faixaEtariaFinal, faixaAtual)
      
      // DEBUG: Log para linhas sem faixa etária
      if (!faixaEtaria && entidade === "ANEC" && plano && plano.includes("CLASSIFOC QC")) {
        console.warn(`⚠️ LINHA SEM FAIXA ETÁRIA: ${entidade} ${mesReajuste} ${status} ${plano} - ${vidas} vidas`)
      }

      entidadesPorStatusMap.set(key, atual)
    })

    // DEBUG: Log detalhado para CLASSIFOC QC
    debugMap.forEach((linhas, key) => {
      const parts = key.split('|')
      const entidade = parts[0]
      const mesReajuste = parts[1]
      const status = parts[2]
      const plano = parts[3]
      
      const somaVidas = linhas.reduce((sum, l) => sum + (Number(l.total_vidas) || 0), 0)
      console.log(`🔍 DEBUG CLASSIFOC QC - ${entidade} ${mesReajuste} ${status} ${plano}:`)
      console.log(`  Total de linhas únicas processadas: ${linhas.length}`)
      console.log(`  Soma de vidas das faixas: ${somaVidas}`)
      linhas.forEach(l => {
        console.log(`    Faixa ${l.faixa_etaria}: ${l.total_vidas} vidas`)
      })
      
      // Verificar se há duplicações na query original
      const linhasOriginais = (rowsPorEntidade || []).filter((r: any) => 
        r.entidade === entidade && 
        r.plano && r.plano.includes("CLASSIFOC QC") && 
        r.mes_reajuste && r.mes_reajuste.toLowerCase().includes("julho") &&
        r.status_final === status
      )
      console.log(`  Total de linhas na query original: ${linhasOriginais.length}`)
      if (linhasOriginais.length !== linhas.length) {
        console.warn(`  ⚠️ DIFERENÇA: Query original tem ${linhasOriginais.length} linhas, mas processamos ${linhas.length} linhas únicas`)
      }
    })

    // Converter Map para Array e calcular percentuais
    const entidadesPorStatus: Record<string, Array<{
      entidade: string
      mes_reajuste?: string | null
      vidas: number
      valor_total: number
      valor_net_total: number
      pct_vidas: number
      pct_valor: number
      por_plano: Array<{ 
        plano: string
        vidas: number
        valor: number
        valor_net: number
        por_faixa_etaria: Array<{ faixa_etaria: string; vidas: number; valor: number; valor_net: number }>
      }>
      por_faixa_etaria: Array<{ faixa_etaria: string; vidas: number; valor: number; valor_net: number }>
    }>> = {
      ativo: [],
      inativo: [],
      vazio: [],
    }

    entidadesPorStatusMap.forEach((item, key) => {
      const status = key.split('|')[2] || "vazio"
      if (status !== "ativo" && status !== "inativo" && status !== "vazio") return

      // Calcular percentuais baseado no CONSOLIDADO GERAL
      let pctVidas = 0
      let pctValor = 0

      if (status === "ativo") {
        pctVidas = consolidadoGeral.ativo > 0 ? item.vidas / consolidadoGeral.ativo : 0
        pctValor = consolidadoGeral.valor_ativo > 0 ? item.valor_total / consolidadoGeral.valor_ativo : 0
      } else if (status === "inativo") {
        pctVidas = consolidadoGeral.inativo > 0 ? item.vidas / consolidadoGeral.inativo : 0
        pctValor = consolidadoGeral.valor_inativo > 0 ? item.valor_total / consolidadoGeral.valor_inativo : 0
      } else if (status === "vazio") {
        pctVidas = consolidadoGeral.nao_localizado > 0 ? item.vidas / consolidadoGeral.nao_localizado : 0
        pctValor = consolidadoGeral.valor_nao_localizado > 0 ? item.valor_total / consolidadoGeral.valor_nao_localizado : 0
      }

      // Função auxiliar para ordenar faixas etárias
      const getOrderFaixa = (faixa: string) => {
        if (faixa === '00 a 18') return 0
        if (faixa === '59+') return 10
        if (faixa === 'Não informado') return 11
        const match = faixa.match(/(\d+)\s+a\s+(\d+)/)
        return match ? parseInt(match[1]) : 99
      }
      
      const porPlanoArray = Array.from(item.por_plano.values()).map(plano => ({
        ...plano,
        por_faixa_etaria: Array.from(plano.por_faixa_etaria.values()).sort((a, b) => 
          getOrderFaixa(a.faixa_etaria) - getOrderFaixa(b.faixa_etaria)
        )
      })).sort((a, b) => b.vidas - a.vidas)
      
      const porFaixaArray = Array.from(item.por_faixa_etaria.values()).sort((a, b) => 
        getOrderFaixa(a.faixa_etaria) - getOrderFaixa(b.faixa_etaria)
      )

      // DEBUG: Verificar CLASSIFOC QC após agregação
      if (item.entidade === "ANEC" && item.mes_reajuste && item.mes_reajuste.toLowerCase().includes("julho")) {
        const classifocPlano = porPlanoArray.find(p => p.plano && p.plano.includes("CLASSIFOC QC"))
        if (classifocPlano) {
          const somaFaixasPlano = classifocPlano.por_faixa_etaria.reduce((sum, f) => sum + f.vidas, 0)
          const somaFaixasEntidade = porFaixaArray.reduce((sum, f) => sum + f.vidas, 0)
          console.log(`🔍 DEBUG CLASSIFOC QC APÓS AGREGAÇÃO - ${item.entidade} ${item.mes_reajuste} ${status}:`)
          console.log(`  Plano CLASSIFOC QC - Total vidas: ${classifocPlano.vidas}`)
          console.log(`  Soma das faixas do plano: ${somaFaixasPlano}`)
          console.log(`  Soma de todas as faixas da entidade: ${somaFaixasEntidade}`)
          console.log(`  Total da entidade: ${item.vidas}`)
          console.log(`  Faixas do plano CLASSIFOC QC:`)
          classifocPlano.por_faixa_etaria.forEach(f => {
            console.log(`    ${f.faixa_etaria}: ${f.vidas} vidas`)
          })
        }
      }

      entidadesPorStatus[status].push({
        entidade: item.entidade,
        mes_reajuste: item.mes_reajuste,
        vidas: item.vidas,
        valor_total: item.valor_total,
        valor_net_total: item.valor_net_total,
        pct_vidas: pctVidas,
        pct_valor: pctValor,
        por_plano: porPlanoArray,
        por_faixa_etaria: porFaixaArray,
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

    // 🔵 VALIDAÇÃO: Verificar se os cards filhos estão corretos
    const totalVidasFilhosPorStatus = {
      ativo: entidadesPorStatus.ativo.reduce((sum, e) => sum + e.vidas, 0),
      inativo: entidadesPorStatus.inativo.reduce((sum, e) => sum + e.vidas, 0),
      vazio: entidadesPorStatus.vazio.reduce((sum, e) => sum + e.vidas, 0),
    }
    
    const diffAtivo = Math.abs(totalVidasFilhosPorStatus.ativo - consolidadoGeral.ativo)
    const diffInativo = Math.abs(totalVidasFilhosPorStatus.inativo - consolidadoGeral.inativo)
    const diffVazio = Math.abs(totalVidasFilhosPorStatus.vazio - consolidadoGeral.nao_localizado)
    
    if (diffAtivo > 0.01 || diffInativo > 0.01 || diffVazio > 0.01) {
      console.warn("🔵 VALIDAÇÃO CARDS FILHOS - Diferenças encontradas:")
      if (diffAtivo > 0.01) {
        console.warn(`  ⚠️ Ativo: Cards filhos (${totalVidasFilhosPorStatus.ativo}) != Card mãe (${consolidadoGeral.ativo}). Diferença: ${diffAtivo}`)
      }
      if (diffInativo > 0.01) {
        console.warn(`  ⚠️ Inativo: Cards filhos (${totalVidasFilhosPorStatus.inativo}) != Card mãe (${consolidadoGeral.inativo}). Diferença: ${diffInativo}`)
      }
      if (diffVazio > 0.01) {
        console.warn(`  ⚠️ Não Localizado: Cards filhos (${totalVidasFilhosPorStatus.vazio}) != Card mãe (${consolidadoGeral.nao_localizado}). Diferença: ${diffVazio}`)
      }
    } else {
      console.log("✅ VALIDAÇÃO CARDS FILHOS: Todos os valores estão corretos!")
      console.log(`  Ativo: ${totalVidasFilhosPorStatus.ativo} = ${consolidadoGeral.ativo}`)
      console.log(`  Inativo: ${totalVidasFilhosPorStatus.inativo} = ${consolidadoGeral.inativo}`)
      console.log(`  Não Localizado: ${totalVidasFilhosPorStatus.vazio} = ${consolidadoGeral.nao_localizado}`)
    }

    // 🔵 VALIDAÇÃO: Verificar se a soma das faixas etárias corresponde ao total da entidade/status
    console.log("🔵 VALIDAÇÃO FAIXAS ETÁRIAS - Verificando entidades por status:")
    const validacoesFaixas: string[] = []
    
    Object.keys(entidadesPorStatus).forEach((status) => {
      entidadesPorStatus[status].forEach((entidade) => {
        const somaVidasFaixas = entidade.por_faixa_etaria.reduce((sum, f) => sum + f.vidas, 0)
        const somaValorFaixas = entidade.por_faixa_etaria.reduce((sum, f) => sum + f.valor, 0)
        const somaValorNetFaixas = entidade.por_faixa_etaria.reduce((sum, f) => sum + f.valor_net, 0)
        
        const diffVidas = Math.abs(somaVidasFaixas - entidade.vidas)
        const diffValor = Math.abs(somaValorFaixas - entidade.valor_total)
        const diffValorNet = Math.abs(somaValorNetFaixas - entidade.valor_net_total)
        
        if (diffVidas > 0.01 || diffValor > 0.01 || diffValorNet > 0.01) {
          validacoesFaixas.push(
            `⚠️ ${status.toUpperCase()} - ${entidade.entidade}${entidade.mes_reajuste ? ` (${entidade.mes_reajuste})` : ''}: ` +
            `Vidas faixas (${somaVidasFaixas}) != Total (${entidade.vidas}), ` +
            `Valor faixas (${somaValorFaixas}) != Total (${entidade.valor_total}), ` +
            `Valor Net faixas (${somaValorNetFaixas}) != Total (${entidade.valor_net_total})`
          )
        }
      })
    })
    
    if (validacoesFaixas.length > 0) {
      console.warn("🔵 VALIDAÇÃO FAIXAS ETÁRIAS - Problemas encontrados:")
      validacoesFaixas.forEach(v => console.warn(`  ${v}`))
    } else {
      console.log("✅ VALIDAÇÃO FAIXAS ETÁRIAS: Todas as somas de faixas estão corretas para entidades por status!")
    }

    // Validação mais precisa: verificar nas linhas originais da query
    const validacoesFaixasPlanosDetalhadas: string[] = []
    const faixasPorPlanoMap = new Map<string, { vidas: number; valor: number; valor_net: number }>()
    
    // DEBUG: Rastrear linhas do CLASSIFOC QC para verificar duplicações
    const debugClassifocLinhas: any[] = []
    
    ;(rowsPorEntidade || []).forEach((row: any) => {
      const status = row.status_final || "vazio"
      const entidade = row.entidade || ""
      const mesReajuste = row.mes_reajuste || null
      const plano = row.plano || ""
      const faixaEtaria = row.faixa_etaria || "Não informado"
      
      if (!entidade || !plano) return
      
      // DEBUG: Rastrear CLASSIFOC QC
      if (entidade === "ANEC" && plano && plano.includes("CLASSIFOC QC") && mesReajuste && mesReajuste.toLowerCase().includes("julho")) {
        debugClassifocLinhas.push({
          status,
          entidade,
          mesReajuste,
          plano,
          faixaEtaria,
          total_vidas: row.total_vidas,
          valor_procedimentos_total: row.valor_procedimentos_total,
          valor_faturamento_total: row.valor_faturamento_total
        })
      }
      
      const key = `${entidade}|${mesReajuste || 'null'}|${status}|${plano}|${faixaEtaria}`
      const atual = faixasPorPlanoMap.get(key) || { vidas: 0, valor: 0, valor_net: 0 }
      
      atual.vidas += Number(row.total_vidas) || 0
      atual.valor += Number(row.valor_procedimentos_total) || 0
      atual.valor_net += Number(row.valor_faturamento_total) || 0
      
      faixasPorPlanoMap.set(key, atual)
    })
    
    // DEBUG: Log das linhas do CLASSIFOC QC
    if (debugClassifocLinhas.length > 0) {
      console.log(`🔍 DEBUG CLASSIFOC QC - Linhas originais da query (${debugClassifocLinhas.length} linhas):`)
      const somaPorStatus = new Map<string, number>()
      debugClassifocLinhas.forEach(l => {
        const statusKey = l.status || "vazio"
        const atual = somaPorStatus.get(statusKey) || 0
        somaPorStatus.set(statusKey, atual + (Number(l.total_vidas) || 0))
        console.log(`  ${l.status} - ${l.faixaEtaria}: ${l.total_vidas} vidas`)
      })
      somaPorStatus.forEach((soma, status) => {
        console.log(`  Total ${status}: ${soma} vidas`)
      })
      
      // Verificar se há duplicações
      const linhasUnicas = new Set(debugClassifocLinhas.map(l => `${l.status}|${l.faixaEtaria}`))
      if (linhasUnicas.size !== debugClassifocLinhas.length) {
        console.warn(`⚠️ DUPLICAÇÃO: ${debugClassifocLinhas.length} linhas, mas apenas ${linhasUnicas.size} combinações únicas`)
      }
    }
    
    // DEBUG: Log do mapa de faixas por plano
    if (debugClassifocLinhas.length > 0) {
      console.log(`🔍 DEBUG CLASSIFOC QC - FaixasPorPlanoMap:`)
      Array.from(faixasPorPlanoMap.entries())
        .filter(([key]) => key.includes("ANEC") && key.includes("CLASSIFOC QC") && key.toLowerCase().includes("julho"))
        .forEach(([key, valores]) => {
          const parts = key.split('|')
          console.log(`  ${parts[2]} - ${parts[4]}: ${valores.vidas} vidas`)
        })
    }
    
    // Função auxiliar para normalizar mês de reajuste para comparação
    const normalizarMesReajuste = (mes: string | null | undefined): string => {
      if (!mes) return 'null'
      // Normalizar para minúsculas e remover espaços extras
      return mes.toLowerCase().trim()
    }
    
    // Agora validar: para cada plano em cada entidade/status, somar suas faixas
    Object.keys(entidadesPorStatus).forEach((status) => {
      entidadesPorStatus[status].forEach((entidade) => {
        entidade.por_plano.forEach((plano) => {
          // Somar todas as faixas deste plano nesta entidade/status
          const mesReajusteNormalizado = normalizarMesReajuste(entidade.mes_reajuste)
          const faixasFiltradas = Array.from(faixasPorPlanoMap.entries())
            .filter(([key]) => {
              const parts = key.split('|')
              const mesReajusteKey = normalizarMesReajuste(parts[1])
              return parts[0] === entidade.entidade &&
                     mesReajusteKey === mesReajusteNormalizado &&
                     parts[2] === status &&
                     parts[3] === plano.plano
            })
          
          const somaFaixas = faixasFiltradas.reduce((acc, [, valores]) => ({
            vidas: acc.vidas + valores.vidas,
            valor: acc.valor + valores.valor,
            valor_net: acc.valor_net + valores.valor_net
          }), { vidas: 0, valor: 0, valor_net: 0 })
          
          const diffVidas = Math.abs(somaFaixas.vidas - plano.vidas)
          const diffValor = Math.abs(somaFaixas.valor - plano.valor)
          const diffValorNet = Math.abs(somaFaixas.valor_net - plano.valor_net)
          
          // Validar usando por_faixa_etaria do plano (se disponível)
          const somaFaixasPlano = plano.por_faixa_etaria ? 
            plano.por_faixa_etaria.reduce((acc, f) => ({
              vidas: acc.vidas + f.vidas,
              valor: acc.valor + f.valor,
              valor_net: acc.valor_net + f.valor_net
            }), { vidas: 0, valor: 0, valor_net: 0 }) :
            somaFaixas
          
          const diffVidasPlano = Math.abs(somaFaixasPlano.vidas - plano.vidas)
          const diffValorPlano = Math.abs(somaFaixasPlano.valor - plano.valor)
          const diffValorNetPlano = Math.abs(somaFaixasPlano.valor_net - plano.valor_net)
          
          // DEBUG detalhado para CLASSIFOC QC
          if (entidade.entidade === "ANEC" && plano.plano && plano.plano.includes("CLASSIFOC QC") && entidade.mes_reajuste && entidade.mes_reajuste.toLowerCase().includes("julho")) {
            console.log(`🔍 DEBUG VALIDAÇÃO CLASSIFOC QC - ${entidade.entidade} ${entidade.mes_reajuste} ${status} ${plano.plano}:`)
            console.log(`  Total vidas do plano (por_plano): ${plano.vidas}`)
            console.log(`  Soma vidas das faixas do plano (por_faixa_etaria): ${somaFaixasPlano.vidas}`)
            console.log(`  Soma vidas das faixas (faixasPorPlanoMap): ${somaFaixas.vidas}`)
            console.log(`  Diferença (plano): ${diffVidasPlano}`)
            console.log(`  Diferença (mapa): ${diffVidas}`)
            if (plano.por_faixa_etaria) {
              console.log(`  Faixas do plano:`)
              plano.por_faixa_etaria.forEach(f => {
                console.log(`    ${f.faixa_etaria}: ${f.vidas} vidas`)
              })
            }
          }
          
          if (diffVidasPlano > 0.01 || diffValorPlano > 0.01 || diffValorNetPlano > 0.01) {
            validacoesFaixasPlanosDetalhadas.push(
              `⚠️ ${status.toUpperCase()} - ${entidade.entidade}${entidade.mes_reajuste ? ` (${entidade.mes_reajuste})` : ''} - Plano ${plano.plano}: ` +
              `Vidas faixas (${somaFaixasPlano.vidas}) != Total plano (${plano.vidas}), ` +
              `Valor faixas (${somaFaixasPlano.valor}) != Total plano (${plano.valor}), ` +
              `Valor Net faixas (${somaFaixasPlano.valor_net}) != Total plano (${plano.valor_net})`
            )
          }
        })
      })
    })
    
    if (validacoesFaixasPlanosDetalhadas.length > 0) {
      console.warn("🔵 VALIDAÇÃO FAIXAS ETÁRIAS POR PLANO - Problemas encontrados:")
      validacoesFaixasPlanosDetalhadas.forEach(v => console.warn(`  ${v}`))
    } else {
      console.log("✅ VALIDAÇÃO FAIXAS ETÁRIAS POR PLANO: Todas as somas de faixas estão corretas para os planos!")
    }

    // Calcular total agregado por entidade e mês de reajuste (todas as entidades juntas)
    // Manter separado por mês de reajuste para exibir cards individuais
    // 🔵 QUERY OFICIAL: Incluir drill-downs por plano e faixa_etaria
    const entidadesTotalMap = new Map<string, {
      entidade: string
      mes_reajuste?: string | null
      vidas: number
      valor_total: number
      valor_net_total: number
      pct_vidas: number
      pct_valor: number
      por_plano: Map<string, { 
        plano: string
        vidas: number
        valor: number
        valor_net: number
        por_faixa_etaria: Map<string, { faixa_etaria: string; vidas: number; valor: number; valor_net: number }>
      }>
      por_faixa_etaria: Map<string, { faixa_etaria: string; vidas: number; valor: number; valor_net: number }>
    }>()

    ;[...entidadesPorStatus.ativo, ...entidadesPorStatus.inativo, ...entidadesPorStatus.vazio].forEach((item) => {
      const key = `${item.entidade}|${item.mes_reajuste || 'null'}`
      const atual = entidadesTotalMap.get(key) || {
        entidade: item.entidade,
        mes_reajuste: item.mes_reajuste,
        vidas: 0,
        valor_total: 0,
        valor_net_total: 0,
        pct_vidas: 0,
        pct_valor: 0,
        por_plano: new Map(),
        por_faixa_etaria: new Map(),
      }

      atual.vidas += item.vidas
      atual.valor_total += item.valor_total
      atual.valor_net_total += item.valor_net_total

      // Agregar drill-downs por plano
      item.por_plano.forEach((planoItem) => {
        const planoAtual = atual.por_plano.get(planoItem.plano) || { 
          plano: planoItem.plano, 
          vidas: 0, 
          valor: 0, 
          valor_net: 0,
          por_faixa_etaria: new Map<string, { faixa_etaria: string; vidas: number; valor: number; valor_net: number }>()
        }
        planoAtual.vidas += planoItem.vidas
        planoAtual.valor += planoItem.valor
        planoAtual.valor_net += planoItem.valor_net
        
        // Agregar faixas etárias do plano
        planoItem.por_faixa_etaria.forEach((faixaItem) => {
          const faixaAtual = planoAtual.por_faixa_etaria.get(faixaItem.faixa_etaria) || {
            faixa_etaria: faixaItem.faixa_etaria,
            vidas: 0,
            valor: 0,
            valor_net: 0
          }
          faixaAtual.vidas += faixaItem.vidas
          faixaAtual.valor += faixaItem.valor
          faixaAtual.valor_net += faixaItem.valor_net
          planoAtual.por_faixa_etaria.set(faixaItem.faixa_etaria, faixaAtual)
        })
        
        atual.por_plano.set(planoItem.plano, planoAtual)
      })

      // Agregar drill-downs por faixa etária
      item.por_faixa_etaria.forEach((faixaItem) => {
        const faixaAtual = atual.por_faixa_etaria.get(faixaItem.faixa_etaria) || { 
          faixa_etaria: faixaItem.faixa_etaria, 
          vidas: 0, 
          valor: 0, 
          valor_net: 0 
        }
        faixaAtual.vidas += faixaItem.vidas
        faixaAtual.valor += faixaItem.valor
        faixaAtual.valor_net += faixaItem.valor_net
        atual.por_faixa_etaria.set(faixaItem.faixa_etaria, faixaAtual)
      })

      entidadesTotalMap.set(key, atual)
    })

    const getOrderFaixaTotal = (faixa: string) => {
      if (faixa === '00 a 18') return 0
      if (faixa === '59+') return 10
      if (faixa === 'Não informado') return 11
      const match = faixa.match(/(\d+)\s+a\s+(\d+)/)
      return match ? parseInt(match[1]) : 99
    }
    
    const entidadesTotal: Array<{
      entidade: string
      mes_reajuste?: string | null
      vidas: number
      valor_total: number
      valor_net_total: number
      pct_vidas: number
      pct_valor: number
      por_plano: Array<{ 
        plano: string
        vidas: number
        valor: number
        valor_net: number
        por_faixa_etaria: Array<{ faixa_etaria: string; vidas: number; valor: number; valor_net: number }>
      }>
      por_faixa_etaria: Array<{ faixa_etaria: string; vidas: number; valor: number; valor_net: number }>
    }> = Array.from(entidadesTotalMap.values()).map((item) => ({
      ...item,
      pct_vidas: consolidadoGeral.total_vidas > 0 ? item.vidas / consolidadoGeral.total_vidas : 0,
      pct_valor: consolidadoGeral.valor_total_geral > 0 ? item.valor_total / consolidadoGeral.valor_total_geral : 0,
      por_plano: Array.from(item.por_plano.values()).map(plano => ({
        ...plano,
        por_faixa_etaria: Array.from(plano.por_faixa_etaria.values()).sort((a, b) => 
          getOrderFaixaTotal(a.faixa_etaria) - getOrderFaixaTotal(b.faixa_etaria)
        )
      })).sort((a, b) => b.vidas - a.vidas),
      por_faixa_etaria: Array.from(item.por_faixa_etaria.values()).sort((a, b) => 
        getOrderFaixaTotal(a.faixa_etaria) - getOrderFaixaTotal(b.faixa_etaria)
      ),
    }))

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

    // 🔵 VALIDAÇÃO: Verificar se a soma das faixas etárias corresponde ao total da entidade (entidadesTotal)
    console.log("🔵 VALIDAÇÃO FAIXAS ETÁRIAS - Verificando entidades total:")
    const validacoesFaixasTotal: string[] = []
    
    entidadesTotal.forEach((entidade) => {
      const somaVidasFaixas = entidade.por_faixa_etaria.reduce((sum, f) => sum + f.vidas, 0)
      const somaValorFaixas = entidade.por_faixa_etaria.reduce((sum, f) => sum + f.valor, 0)
      const somaValorNetFaixas = entidade.por_faixa_etaria.reduce((sum, f) => sum + f.valor_net, 0)
      
      const diffVidas = Math.abs(somaVidasFaixas - entidade.vidas)
      const diffValor = Math.abs(somaValorFaixas - entidade.valor_total)
      const diffValorNet = Math.abs(somaValorNetFaixas - entidade.valor_net_total)
      
      if (diffVidas > 0.01 || diffValor > 0.01 || diffValorNet > 0.01) {
        validacoesFaixasTotal.push(
          `⚠️ TOTAL - ${entidade.entidade}${entidade.mes_reajuste ? ` (${entidade.mes_reajuste})` : ''}: ` +
          `Vidas faixas (${somaVidasFaixas}) != Total (${entidade.vidas}), ` +
          `Valor faixas (${somaValorFaixas}) != Total (${entidade.valor_total}), ` +
          `Valor Net faixas (${somaValorNetFaixas}) != Total (${entidade.valor_net_total})`
        )
      }
    })
    
    if (validacoesFaixasTotal.length > 0) {
      console.warn("🔵 VALIDAÇÃO FAIXAS ETÁRIAS TOTAL - Problemas encontrados:")
      validacoesFaixasTotal.forEach(v => console.warn(`  ${v}`))
    } else {
      console.log("✅ VALIDAÇÃO FAIXAS ETÁRIAS TOTAL: Todas as somas de faixas estão corretas para entidades total!")
    }

    // 🔵 VALIDAÇÃO: Verificar se a soma das faixas etárias corresponde ao total do plano (entidadesTotal)
    console.log("🔵 VALIDAÇÃO FAIXAS ETÁRIAS POR PLANO - Verificando planos em entidades total:")
    const validacoesFaixasPlanosTotal: string[] = []
    
    entidadesTotal.forEach((entidade) => {
      entidade.por_plano.forEach((plano) => {
        // Somar todas as faixas deste plano nesta entidade (todas as faixas que pertencem a este plano)
        // Como não temos a informação direta de qual faixa pertence a qual plano no entidadesTotal,
        // vamos usar os dados originais da query para validar
        const somaFaixas = Array.from(faixasPorPlanoMap.entries())
          .filter(([key]) => {
            const parts = key.split('|')
            return parts[0] === entidade.entidade &&
                   parts[1] === (entidade.mes_reajuste || 'null') &&
                   parts[3] === plano.plano
          })
          .reduce((acc, [, valores]) => ({
            vidas: acc.vidas + valores.vidas,
            valor: acc.valor + valores.valor,
            valor_net: acc.valor_net + valores.valor_net
          }), { vidas: 0, valor: 0, valor_net: 0 })
        
        const diffVidas = Math.abs(somaFaixas.vidas - plano.vidas)
        const diffValor = Math.abs(somaFaixas.valor - plano.valor)
        const diffValorNet = Math.abs(somaFaixas.valor_net - plano.valor_net)
        
        if (diffVidas > 0.01 || diffValor > 0.01 || diffValorNet > 0.01) {
          validacoesFaixasPlanosTotal.push(
            `⚠️ TOTAL - ${entidade.entidade}${entidade.mes_reajuste ? ` (${entidade.mes_reajuste})` : ''} - Plano ${plano.plano}: ` +
            `Vidas faixas (${somaFaixas.vidas}) != Total plano (${plano.vidas}), ` +
            `Valor faixas (${somaFaixas.valor}) != Total plano (${plano.valor}), ` +
            `Valor Net faixas (${somaFaixas.valor_net}) != Total plano (${plano.valor_net})`
          )
        }
      })
    })
    
    if (validacoesFaixasPlanosTotal.length > 0) {
      console.warn("🔵 VALIDAÇÃO FAIXAS ETÁRIAS POR PLANO TOTAL - Problemas encontrados:")
      validacoesFaixasPlanosTotal.forEach(v => console.warn(`  ${v}`))
    } else {
      console.log("✅ VALIDAÇÃO FAIXAS ETÁRIAS POR PLANO TOTAL: Todas as somas de faixas estão corretas para os planos em entidades total!")
    }

    // Query para distribuição por plano nos cards principais (por status)
    // 🔵 QUERY OFICIAL: Usando a mesma estrutura base da query oficial
    const sqlPorPlanoGeral = `
      SELECT
        m.status_final,
        m.plano,
        COUNT(DISTINCT m.cpf) AS vidas,
        SUM(m.valor_procedimentos) AS valor,
        SUM(m.valor_faturamento) AS valor_net
      FROM (
        SELECT
          base.mes,
          base.entidade,
          base.plano,
          base.cpf,
          base.valor_procedimentos,
          base.valor_faturamento,
          CASE
            WHEN b_status.cpf IS NULL THEN 'vazio'
            WHEN LOWER(b_status.status_beneficiario) = 'ativo' THEN 'ativo'
            ELSE 'inativo'
          END AS status_final,
          CASE
            WHEN b_status.idade IS NULL OR CAST(b_status.idade AS UNSIGNED) <= 18 THEN '00 a 18'
            WHEN CAST(b_status.idade AS UNSIGNED) BETWEEN 19 AND 23 THEN '19 a 23'
            WHEN CAST(b_status.idade AS UNSIGNED) BETWEEN 24 AND 28 THEN '24 a 28'
            WHEN CAST(b_status.idade AS UNSIGNED) BETWEEN 29 AND 33 THEN '29 a 33'
            WHEN CAST(b_status.idade AS UNSIGNED) BETWEEN 34 AND 38 THEN '34 a 38'
            WHEN CAST(b_status.idade AS UNSIGNED) BETWEEN 39 AND 43 THEN '39 a 43'
            WHEN CAST(b_status.idade AS UNSIGNED) BETWEEN 44 AND 48 THEN '44 a 48'
            WHEN CAST(b_status.idade AS UNSIGNED) BETWEEN 49 AND 53 THEN '49 a 53'
            WHEN CAST(b_status.idade AS UNSIGNED) BETWEEN 54 AND 58 THEN '54 a 58'
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
        ${tipo || cpf ? "INNER" : "LEFT"} JOIN (
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
            ) AS idade
          FROM reg_beneficiarios b
          ${beneficiarioWhereClauseGeral}
          GROUP BY
            b.cpf
        ) AS b_status
          ON b_status.cpf = base.cpf
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
          SUM(base.valor_procedimentos) AS valor_total_cpf,
          -- CORREÇÃO: Garantir que cada CPF tenha apenas 1 valor de faturamento
          -- Como cada CPF tem apenas 1 valor de faturamento em reg_faturamento, usar MAX
          MAX(base.valor_faturamento) AS vlr_net_cpf
        FROM (
          SELECT
            base.mes,
            base.entidade,
            base.plano,
            base.cpf,
            base.valor_procedimentos,
            base.valor_faturamento,
            CASE
              WHEN b_status.cpf IS NULL THEN 'vazio'
              WHEN LOWER(b_status.status_beneficiario) = 'ativo' THEN 'ativo'
              ELSE 'inativo'
            END AS status_final,
            CASE
              WHEN b_status.idade IS NULL OR CAST(b_status.idade AS UNSIGNED) <= 18 THEN '00 a 18'
              WHEN CAST(b_status.idade AS UNSIGNED) BETWEEN 19 AND 23 THEN '19 a 23'
              WHEN CAST(b_status.idade AS UNSIGNED) BETWEEN 24 AND 28 THEN '24 a 28'
              WHEN CAST(b_status.idade AS UNSIGNED) BETWEEN 29 AND 33 THEN '29 a 33'
              WHEN CAST(b_status.idade AS UNSIGNED) BETWEEN 34 AND 38 THEN '34 a 38'
              WHEN CAST(b_status.idade AS UNSIGNED) BETWEEN 39 AND 43 THEN '39 a 43'
              WHEN CAST(b_status.idade AS UNSIGNED) BETWEEN 44 AND 48 THEN '44 a 48'
              WHEN CAST(b_status.idade AS UNSIGNED) BETWEEN 49 AND 53 THEN '49 a 53'
              WHEN CAST(b_status.idade AS UNSIGNED) BETWEEN 54 AND 58 THEN '54 a 58'
              ELSE '59+'
            END AS faixa_etaria,
            b.mes_reajuste,
            b.tipo
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
              -- Traz também entidade e plano do faturamento (se por algum motivo tivesse mais de uma, pega a primeira)
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
            -- STATUS e IDADE mais recente por CPF (🔵 QUERY OFICIAL)
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
              ) AS idade
            FROM reg_beneficiarios b
            ${beneficiarioWhereClauseGeral}
            GROUP BY
              b.cpf
          ) AS b_status
            ON b_status.cpf = base.cpf
          LEFT JOIN (
            -- Mês de reajuste e tipo mais recente por CPF (entidade e plano vêm do faturamento)
            SELECT
              b.cpf,
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
            ON b.cpf = base.cpf
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
    // Valores: procedimentos (inclui operadoras), operadoras para faturamento, beneficiários (b_status)
    // O plano agora vem do faturamento, não dos beneficiários, então não precisamos mais do JOIN com b_plano
    const valoresPorPlanoGeral: any[] = [
      ...procedimentosValues,
      ...(operadoras.length > 0 ? operadoras : []),
      ...beneficiarioValuesGeral // para b_status
    ]
    const [rowsPorPlanoGeral]: any = await connection.execute(sqlPorPlanoGeral, valoresPorPlanoGeral)

    // Ordem dos valores para sqlPorPlanoEntidade:
    // 1. procedimentosValues (para subquery de procedimentos)
    // 2. operadoras (para subquery de faturamento fv)
    // 3. beneficiarioValuesGeral (para subquery de status b_status)
    // 4. beneficiarioValues (para subquery de mês de reajuste b)
    // 5. entidadeValues (para filtros WHERE externos: entidades, tipo, cpf)
    const valoresPorPlanoEntidade: any[] = [
      ...procedimentosValues,
      ...(operadoras.length > 0 ? operadoras : []),
      ...beneficiarioValuesGeral,
      ...beneficiarioValues,
      ...entidadeValues
    ]
    const [rowsPorPlanoEntidade]: any = await connection.execute(sqlPorPlanoEntidade, valoresPorPlanoEntidade)

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

    // 🔵 QUERY OFICIAL: Os dados de por_plano e por_faixa_etaria já vêm de sqlPorEntidade
    // Não precisamos mais usar porPlanoEntidade separadamente
    const entidadesComPlano = {
      ativo: entidadesPorStatus.ativo,
      inativo: entidadesPorStatus.inativo,
      nao_localizado: entidadesPorStatus.vazio,
      total: entidadesTotal,
    }

    // 🔵 VALIDAÇÕES DE CONSISTÊNCIA (conforme solicitado)
    // Validar que os cálculos estão corretos conforme a query oficial
    const validacoes: string[] = []
    
    // Validação 1: Soma de vidas por mês
    porMesGeral.forEach((mes: any) => {
      const somaVidas = mes.ativo + mes.inativo + mes.nao_localizado
      const diff = Math.abs(somaVidas - mes.total_vidas)
      if (diff > 0.01) { // Permitir pequenas diferenças de arredondamento
        validacoes.push(`⚠️ Mês ${mes.mes}: Soma de vidas (${somaVidas}) != total_vidas (${mes.total_vidas}). Diferença: ${diff}`)
      }
    })
    
    // Validação 2: Soma de valores de procedimentos por mês
    porMesGeral.forEach((mes: any) => {
      const somaValores = mes.valor_ativo + mes.valor_inativo + mes.valor_nao_localizado
      const diff = Math.abs(somaValores - mes.valor_total_geral)
      if (diff > 0.01) {
        validacoes.push(`⚠️ Mês ${mes.mes}: Soma de valores de procedimentos (${somaValores}) != valor_total_geral (${mes.valor_total_geral}). Diferença: ${diff}`)
      }
    })
    
    // Validação 3: Soma de valores de faturamento por mês
    porMesGeral.forEach((mes: any) => {
      const somaFaturamento = mes.valor_net_ativo + mes.valor_net_inativo + mes.valor_net_nao_localizado
      const diff = Math.abs(somaFaturamento - mes.valor_net_total_geral)
      if (diff > 0.01) {
        validacoes.push(`⚠️ Mês ${mes.mes}: Soma de valores de faturamento (${somaFaturamento}) != valor_net_total_geral (${mes.valor_net_total_geral}). Diferença: ${diff}`)
      }
    })
    
    // Validação 4: Consolidado geral
    const somaConsolidadoVidas = consolidado.ativo + consolidado.inativo + consolidado.nao_localizado
    const diffConsolidadoVidas = Math.abs(somaConsolidadoVidas - consolidado.total_vidas)
    if (diffConsolidadoVidas > 0.01) {
      validacoes.push(`⚠️ Consolidado: Soma de vidas (${somaConsolidadoVidas}) != total_vidas (${consolidado.total_vidas}). Diferença: ${diffConsolidadoVidas}`)
    }
    
    const somaConsolidadoValores = consolidado.valor_ativo + consolidado.valor_inativo + consolidado.valor_nao_localizado
    const diffConsolidadoValores = Math.abs(somaConsolidadoValores - consolidado.valor_total_geral)
    if (diffConsolidadoValores > 0.01) {
      validacoes.push(`⚠️ Consolidado: Soma de valores de procedimentos (${somaConsolidadoValores}) != valor_total_geral (${consolidado.valor_total_geral}). Diferença: ${diffConsolidadoValores}`)
    }
    
    const somaConsolidadoFaturamento = consolidado.valor_net_ativo + consolidado.valor_net_inativo + consolidado.valor_net_nao_localizado
    const diffConsolidadoFaturamento = Math.abs(somaConsolidadoFaturamento - consolidado.valor_net_total_geral)
    if (diffConsolidadoFaturamento > 0.01) {
      validacoes.push(`⚠️ Consolidado: Soma de valores de faturamento (${somaConsolidadoFaturamento}) != valor_net_total_geral (${consolidado.valor_net_total_geral}). Diferença: ${diffConsolidadoFaturamento}`)
    }
    
    // Log das validações (apenas se houver problemas)
    if (validacoes.length > 0) {
      console.warn("🔵 VALIDAÇÕES DE CONSISTÊNCIA - Problemas encontrados:")
      validacoes.forEach(v => console.warn(v))
    } else {
      console.log("✅ VALIDAÇÕES DE CONSISTÊNCIA: Todas as validações passaram!")
    }

    // 🔵 QUERY OFICIAL: Log dos valores retornados para debug
    console.log("🔵 VALIDAÇÃO - Consolidado Geral (calculado diretamente da query):", {
      ativo: consolidado.ativo,
      inativo: consolidado.inativo,
      nao_localizado: consolidado.nao_localizado,
      total_vidas: consolidado.total_vidas,
      valor_ativo: consolidado.valor_ativo,
      valor_inativo: consolidado.valor_inativo,
      valor_nao_localizado: consolidado.valor_nao_localizado,
      valor_total_geral: consolidado.valor_total_geral,
      valor_net_ativo: consolidado.valor_net_ativo,
      valor_net_inativo: consolidado.valor_net_inativo,
      valor_net_nao_localizado: consolidado.valor_net_nao_localizado,
      valor_net_total_geral: consolidado.valor_net_total_geral,
    })
    console.log("🔵 VALIDAÇÃO - Total de linhas retornadas pela query:", rowsGeral?.length || 0)

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
      // Incluir validações no retorno (apenas em desenvolvimento)
      ...(process.env.NODE_ENV === 'development' && validacoes.length > 0 ? { _validacoes: validacoes } : {}),
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

