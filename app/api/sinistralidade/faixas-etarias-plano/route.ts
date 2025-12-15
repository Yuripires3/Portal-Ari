export const dynamic = "force-dynamic"
export const revalidate = 0
export const fetchCache = "force-no-store"

import { NextRequest, NextResponse } from "next/server"
import { getDBConnection } from "@/lib/db"

/**
 * GET /api/sinistralidade/faixas-etarias-plano
 *
 * Retorna distribuição por faixas etárias para um plano específico.
 *
 * ⚠️ FONTE ÚNICA DE DADOS (OBRIGATÓRIA)
 * Esta rota usa EXCLUSIVAMENTE o resultado final da query oficial abaixo,
 * que é a mesma utilizada em `/api/sinistralidade/cards-status-vidas`.
 *
 * Nenhum join adicional com `reg_procedimentos` ou `reg_faturamento` é feito
 * aqui para montar faixas/vidas. Tudo é derivado por agregação das colunas:
 *   - mes, entidade, mes_reajuste, plano, faixa_etaria
 *   - ativos, ativos_sem_custo, ativos_com_custo
 *   - receita_ativos_sem_custo, receita_ativos_com_custo, custo_ativos_com_custo
 *   - inativos_com_custo, receita_inativos_com_custo, custo_inativos_com_custo
 *
 * Parâmetros:
 * - meses_referencia: string separada por vírgula (ex: "2025-01,2025-02") - obrigatório
 * - entidades: string separada por vírgula (opcional)
 * - meses_reajuste: string separada por vírgula (opcional)
 * - plano: string (obrigatório) - nome do plano
 * - status: string (opcional) - "ativo", "inativo", "vazio", "total" (padrão: total)
 *
 * Consistência obrigatória:
 *   Σ(vidas_faixa_etaria) = vidas_totais_plano (mesmo filtro aplicado)
 *
 * ---------------------------------------------------------------------------
 * QUERY OFICIAL (colada exatamente como referência / fonte da verdade)
 * ---------------------------------------------------------------------------
 *
 * WITH
 * meses AS (
 *   SELECT DATE('2025-01-01') AS mes_ref
 *   UNION ALL
 *   SELECT DATE('2025-02-01') AS mes_ref
 *   -- ...
 * ),
 * procedimentos_mes AS (
 *   SELECT
 *     DATE_FORMAT(p.data_competencia, '%Y-%m') AS mes,
 *     p.cpf,
 *     SUM(p.valor_procedimento) AS valor_procedimentos
 *   FROM reg_procedimentos p
 *   WHERE p.operadora = 'ASSIM SAÚDE'
 *     AND p.evento IS NOT NULL
 *     AND DATE(p.data_competencia) BETWEEN '2025-01-01' AND '2025-10-31'
 *   GROUP BY DATE_FORMAT(p.data_competencia, '%Y-%m'), p.cpf
 * ),
 * faturamento_mes AS (
 *   SELECT
 *     DATE_FORMAT(f.dt_competencia, '%Y-%m') AS mes,
 *     f.cpf_do_beneficiario AS cpf,
 *     SUM(f.vlr_net) AS valor_faturamento
 *   FROM reg_faturamento f
 *   WHERE f.operadora = 'ASSIM SAÚDE'
 *     AND f.dt_competencia IS NOT NULL
 *   GROUP BY DATE_FORMAT(f.dt_competencia, '%Y-%m'), f.cpf_do_beneficiario
 * ),
 * ativos_mes AS (
 *   SELECT
 *     DATE_FORMAT(m.mes_ref, '%Y-%m') AS mes,
 *     b.id_beneficiario,
 *     b.cpf,
 *     b.entidade,
 *     b.mes_reajuste,
 *     b.plano,
 *     CASE
 *       WHEN CAST(b.idade AS UNSIGNED) IS NULL OR CAST(b.idade AS UNSIGNED) <= 18 THEN '00 a 18'
 *       WHEN CAST(b.idade AS UNSIGNED) BETWEEN 19 AND 23 THEN '19 a 23'
 *       WHEN CAST(b.idade AS UNSIGNED) BETWEEN 24 AND 28 THEN '24 a 28'
 *       WHEN CAST(b.idade AS UNSIGNED) BETWEEN 29 AND 33 THEN '29 a 33'
 *       WHEN CAST(b.idade AS UNSIGNED) BETWEEN 34 AND 38 THEN '34 a 38'
 *       WHEN CAST(b.idade AS UNSIGNED) BETWEEN 39 AND 43 THEN '39 a 43'
 *       WHEN CAST(b.idade AS UNSIGNED) BETWEEN 44 AND 48 THEN '44 a 48'
 *       WHEN CAST(b.idade AS UNSIGNED) BETWEEN 49 AND 53 THEN '49 a 53'
 *       WHEN CAST(b.idade AS UNSIGNED) BETWEEN 54 AND 58 THEN '54 a 58'
 *       ELSE '59+'
 *     END AS faixa_etaria,
 *     b.data_inicio_vigencia_beneficiario,
 *     b.data_exclusao,
 *     b.status_beneficiario
 *   FROM meses m
 *   JOIN reg_beneficiarios b
 *     ON b.data_inicio_vigencia_beneficiario <= LAST_DAY(m.mes_ref)
 *    AND b.operadora = 'ASSIM SAÚDE'
 *    AND (
 *         (b.data_exclusao IS NULL AND b.status_beneficiario = 'ativo')
 *      OR (b.data_exclusao IS NOT NULL AND b.data_exclusao > LAST_DAY(m.mes_ref))
 *    )
 * ),
 * ativos_cpfs_mes AS (
 *   SELECT DISTINCT mes, cpf
 *   FROM ativos_mes
 * ),
 * ativos_linha AS (
 *   SELECT
 *     a.mes,
 *     a.entidade,
 *     a.mes_reajuste,
 *     a.plano,
 *     a.faixa_etaria,
 *     a.id_beneficiario,
 *     a.cpf,
 *     'ativo' AS status_final,
 *     COALESCE(f.valor_faturamento, 0) AS receita,
 *     COALESCE(p.valor_procedimentos, 0) AS custo
 *   FROM ativos_mes a
 *   LEFT JOIN procedimentos_mes p
 *     ON p.mes = a.mes AND p.cpf = a.cpf
 *   LEFT JOIN faturamento_mes f
 *     ON f.mes = a.mes AND f.cpf = a.cpf
 * ),
 * inativos_benef_mes AS (
 *   SELECT
 *     mes,
 *     cpf,
 *     id_beneficiario,
 *     entidade,
 *     mes_reajuste,
 *     plano,
 *     faixa_etaria
 *   FROM (
 *     SELECT
 *       p.mes,
 *       p.cpf,
 *       b.id_beneficiario,
 *       b.entidade,
 *       b.mes_reajuste,
 *       b.plano,
 *       CASE
 *         WHEN CAST(b.idade AS UNSIGNED) IS NULL OR CAST(b.idade AS UNSIGNED) <= 18 THEN '00 a 18'
 *         WHEN CAST(b.idade AS UNSIGNED) BETWEEN 19 AND 23 THEN '19 a 23'
 *         WHEN CAST(b.idade AS UNSIGNED) BETWEEN 24 AND 28 THEN '24 a 28'
 *         WHEN CAST(b.idade AS UNSIGNED) BETWEEN 29 AND 33 THEN '29 a 33'
 *         WHEN CAST(b.idade AS UNSIGNED) BETWEEN 34 AND 38 THEN '34 a 38'
 *         WHEN CAST(b.idade AS UNSIGNED) BETWEEN 39 AND 43 THEN '39 a 43'
 *         WHEN CAST(b.idade AS UNSIGNED) BETWEEN 44 AND 48 THEN '44 a 48'
 *         WHEN CAST(b.idade AS UNSIGNED) BETWEEN 49 AND 53 THEN '49 a 53'
 *         WHEN CAST(b.idade AS UNSIGNED) BETWEEN 54 AND 58 THEN '54 a 58'
 *         ELSE '59+'
 *       END AS faixa_etaria,
 *       b.data_inicio_vigencia_beneficiario,
 *       ROW_NUMBER() OVER (
 *         PARTITION BY p.mes, p.cpf
 *         ORDER BY b.data_inicio_vigencia_beneficiario DESC, b.id_beneficiario DESC
 *       ) AS rn
 *     FROM procedimentos_mes p
 *     LEFT JOIN ativos_cpfs_mes a
 *       ON a.mes = p.mes AND a.cpf = p.cpf
 *     JOIN reg_beneficiarios b
 *       ON b.operadora = 'ASSIM SAÚDE'
 *      AND b.cpf = p.cpf
 *      AND b.data_inicio_vigencia_beneficiario <= LAST_DAY(
 *            STR_TO_DATE(CONCAT(p.mes, '-01'), '%Y-%m-%d')
 *          )
 *     WHERE a.cpf IS NULL
 *   ) x
 *   WHERE rn = 1
 * ),
 * inativos_linha AS (
 *   SELECT
 *     p.mes,
 *     ib.entidade,
 *     ib.mes_reajuste,
 *     ib.plano,
 *     ib.faixa_etaria,
 *     ib.id_beneficiario,
 *     p.cpf,
 *     'inativo' AS status_final,
 *     COALESCE(f.valor_faturamento, 0) AS receita,
 *     p.valor_procedimentos AS custo
 *   FROM procedimentos_mes p
 *   JOIN inativos_benef_mes ib
 *     ON ib.mes = p.mes AND ib.cpf = p.cpf
 *   LEFT JOIN faturamento_mes f
 *     ON f.mes = p.mes AND f.cpf = p.cpf
 * ),
 * base AS (
 *   SELECT * FROM ativos_linha
 *   UNION ALL
 *   SELECT * FROM inativos_linha
 * )
 * SELECT
 *   base.mes,
 *   base.entidade,
 *   base.mes_reajuste,
 *   base.plano,
 *   base.faixa_etaria,
 *   COUNT(DISTINCT CASE WHEN base.status_final = 'ativo' THEN base.id_beneficiario END) AS ativos,
 *   COUNT(DISTINCT CASE WHEN base.status_final = 'ativo' AND base.custo = 0 THEN base.id_beneficiario END) AS ativos_sem_custo,
 *   COUNT(DISTINCT CASE WHEN base.status_final = 'ativo' AND base.custo > 0 THEN base.id_beneficiario END) AS ativos_com_custo,
 *   SUM(CASE WHEN base.status_final = 'ativo'   AND base.custo = 0 THEN base.receita ELSE 0 END) AS receita_ativos_sem_custo,
 *   SUM(CASE WHEN base.status_final = 'ativo'   AND base.custo > 0 THEN base.receita ELSE 0 END) AS receita_ativos_com_custo,
 *   SUM(CASE WHEN base.status_final = 'ativo'   AND base.custo > 0 THEN base.custo   ELSE 0 END) AS custo_ativos_com_custo,
 *   COUNT(DISTINCT CASE WHEN base.status_final = 'inativo' AND base.custo > 0 THEN base.id_beneficiario END) AS inativos_com_custo,
 *   SUM(CASE WHEN base.status_final = 'inativo' AND base.custo > 0 THEN base.receita ELSE 0 END) AS receita_inativos_com_custo,
 *   SUM(CASE WHEN base.status_final = 'inativo' AND base.custo > 0 THEN base.custo   ELSE 0 END) AS custo_inativos_com_custo
 * FROM base
 * GROUP BY
 *   base.mes,
 *   base.entidade,
 *   base.mes_reajuste,
 *   base.plano,
 *   base.faixa_etaria
 * ORDER BY
 *   base.mes,
 *   base.entidade,
 *   base.plano,
 *   base.faixa_etaria
 */

export async function GET(request: NextRequest) {
  let connection: any = null

  try {
    const searchParams = request.nextUrl.searchParams
    const mesesReferenciaParam = searchParams.get("meses_referencia")
    const entidadesParam = searchParams.get("entidades")
    const mesesReajusteParam = searchParams.get("meses_reajuste")
    const planoParam = searchParams.get("plano")
    const statusParam = (searchParams.get("status") || "total").toLowerCase()

    if (!mesesReferenciaParam) {
      return NextResponse.json(
        { error: "Parâmetro obrigatório: meses_referencia" },
        { status: 400 },
      )
    }

    if (!planoParam) {
      return NextResponse.json(
        { error: "Parâmetro obrigatório: plano" },
        { status: 400 },
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
        { status: 400 },
      )
    }

    // Calcular data_inicio e data_fim (para interpolar na query oficial)
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

    const entidades =
      entidadesParam
        ?.split(",")
        .map(e => e.trim())
        .filter(Boolean) || []

    const mesesReajuste =
      mesesReajusteParam
        ?.split(",")
        .map(m => m.trim())
        .filter(Boolean) || []

    const plano = planoParam.trim()

    connection = await getDBConnection()

    // Montar a query oficial dinamicamente (apenas datas e meses)
    const queryOficial = `
WITH
meses AS (
  ${mesesReferencia
    .map(mes => {
      const [ano, mesNum] = mes.split("-")
      return `SELECT DATE('${ano}-${mesNum}-01') AS mes_ref`
    })
    .join(" UNION ALL\n  ")}
),
procedimentos_mes AS (
  SELECT
    DATE_FORMAT(p.data_competencia, '%Y-%m') AS mes,
    p.cpf,
    SUM(p.valor_procedimento) AS valor_procedimentos
  FROM reg_procedimentos p
  WHERE p.operadora = 'ASSIM SAÚDE'
    AND p.evento IS NOT NULL
    AND DATE(p.data_competencia) BETWEEN '${dataInicio}' AND '${dataFim}'
  GROUP BY DATE_FORMAT(p.data_competencia, '%Y-%m'), p.cpf
),
faturamento_mes AS (
  SELECT
    DATE_FORMAT(f.dt_competencia, '%Y-%m') AS mes,
    f.cpf_do_beneficiario AS cpf,
    SUM(f.vlr_net) AS valor_faturamento
  FROM reg_faturamento f
  WHERE f.operadora = 'ASSIM SAÚDE'
    AND f.dt_competencia IS NOT NULL
  GROUP BY DATE_FORMAT(f.dt_competencia, '%Y-%m'), f.cpf_do_beneficiario
),
ativos_mes AS (
  SELECT
    DATE_FORMAT(m.mes_ref, '%Y-%m') AS mes,
    b.id_beneficiario,
    b.cpf,
    b.entidade,
    b.mes_reajuste,
    b.plano,
    CASE
      WHEN CAST(b.idade AS UNSIGNED) IS NULL OR CAST(b.idade AS UNSIGNED) <= 18 THEN '00 a 18'
      WHEN CAST(b.idade AS UNSIGNED) BETWEEN 19 AND 23 THEN '19 a 23'
      WHEN CAST(b.idade AS UNSIGNED) BETWEEN 24 AND 28 THEN '24 a 28'
      WHEN CAST(b.idade AS UNSIGNED) BETWEEN 29 AND 33 THEN '29 a 33'
      WHEN CAST(b.idade AS UNSIGNED) BETWEEN 34 AND 38 THEN '34 a 38'
      WHEN CAST(b.idade AS UNSIGNED) BETWEEN 39 AND 43 THEN '39 a 43'
      WHEN CAST(b.idade AS UNSIGNED) BETWEEN 44 AND 48 THEN '44 a 48'
      WHEN CAST(b.idade AS UNSIGNED) BETWEEN 49 AND 53 THEN '49 a 53'
      WHEN CAST(b.idade AS UNSIGNED) BETWEEN 54 AND 58 THEN '54 a 58'
      ELSE '59+'
    END AS faixa_etaria,
    b.data_inicio_vigencia_beneficiario,
    b.data_exclusao,
    b.status_beneficiario
  FROM meses m
  JOIN reg_beneficiarios b
    ON b.data_inicio_vigencia_beneficiario <= LAST_DAY(m.mes_ref)
   AND b.operadora = 'ASSIM SAÚDE'
   AND (
        (b.data_exclusao IS NULL AND b.status_beneficiario = 'ativo')
     OR (b.data_exclusao IS NOT NULL AND b.data_exclusao > LAST_DAY(m.mes_ref))
   )
),
ativos_cpfs_mes AS (
  SELECT DISTINCT mes, cpf
  FROM ativos_mes
),
ativos_linha AS (
  SELECT
    a.mes,
    a.entidade,
    a.mes_reajuste,
    a.plano,
    a.faixa_etaria,
    a.id_beneficiario,
    a.cpf,
    'ativo' AS status_final,
    COALESCE(f.valor_faturamento, 0) AS receita,
    COALESCE(p.valor_procedimentos, 0) AS custo
  FROM ativos_mes a
  LEFT JOIN procedimentos_mes p
    ON p.mes = a.mes AND p.cpf = a.cpf
  LEFT JOIN faturamento_mes f
    ON f.mes = a.mes AND f.cpf = a.cpf
),
inativos_benef_mes AS (
  SELECT
    mes,
    cpf,
    id_beneficiario,
    entidade,
    mes_reajuste,
    plano,
    faixa_etaria
  FROM (
    SELECT
      p.mes,
      p.cpf,
      b.id_beneficiario,
      b.entidade,
      b.mes_reajuste,
      b.plano,
      CASE
        WHEN CAST(b.idade AS UNSIGNED) IS NULL OR CAST(b.idade AS UNSIGNED) <= 18 THEN '00 a 18'
        WHEN CAST(b.idade AS UNSIGNED) BETWEEN 19 AND 23 THEN '19 a 23'
        WHEN CAST(b.idade AS UNSIGNED) BETWEEN 24 AND 28 THEN '24 a 28'
        WHEN CAST(b.idade AS UNSIGNED) BETWEEN 29 AND 33 THEN '29 a 33'
        WHEN CAST(b.idade AS UNSIGNED) BETWEEN 34 AND 38 THEN '34 a 38'
        WHEN CAST(b.idade AS UNSIGNED) BETWEEN 39 AND 43 THEN '39 a 43'
        WHEN CAST(b.idade AS UNSIGNED) BETWEEN 44 AND 48 THEN '44 a 48'
        WHEN CAST(b.idade AS UNSIGNED) BETWEEN 49 AND 53 THEN '49 a 53'
        WHEN CAST(b.idade AS UNSIGNED) BETWEEN 54 AND 58 THEN '54 a 58'
        ELSE '59+'
      END AS faixa_etaria,
      b.data_inicio_vigencia_beneficiario,
      ROW_NUMBER() OVER (
        PARTITION BY p.mes, p.cpf
        ORDER BY b.data_inicio_vigencia_beneficiario DESC, b.id_beneficiario DESC
      ) AS rn
    FROM procedimentos_mes p
    LEFT JOIN ativos_cpfs_mes a
      ON a.mes = p.mes AND a.cpf = p.cpf
    JOIN reg_beneficiarios b
      ON b.operadora = 'ASSIM SAÚDE'
     AND b.cpf = p.cpf
     AND b.data_inicio_vigencia_beneficiario <= LAST_DAY(
           STR_TO_DATE(CONCAT(p.mes, '-01'), '%Y-%m-%d')
         )
    WHERE a.cpf IS NULL
  ) x
  WHERE rn = 1
),
inativos_linha AS (
  SELECT
    p.mes,
    ib.entidade,
    ib.mes_reajuste,
    ib.plano,
    ib.faixa_etaria,
    ib.id_beneficiario,
    p.cpf,
    'inativo' AS status_final,
    COALESCE(f.valor_faturamento, 0) AS receita,
    p.valor_procedimentos AS custo
  FROM procedimentos_mes p
  JOIN inativos_benef_mes ib
    ON ib.mes = p.mes AND ib.cpf = p.cpf
  LEFT JOIN faturamento_mes f
    ON f.mes = p.mes AND f.cpf = p.cpf
),
base AS (
  SELECT * FROM ativos_linha
  UNION ALL
  SELECT * FROM inativos_linha
)
SELECT
  base.mes,
  base.entidade,
  base.mes_reajuste,
  base.plano,
  base.faixa_etaria,
  COUNT(DISTINCT CASE WHEN base.status_final = 'ativo' THEN base.id_beneficiario END) AS ativos,
  COUNT(DISTINCT CASE WHEN base.status_final = 'ativo' AND base.custo = 0 THEN base.id_beneficiario END) AS ativos_sem_custo,
  COUNT(DISTINCT CASE WHEN base.status_final = 'ativo' AND base.custo > 0 THEN base.id_beneficiario END) AS ativos_com_custo,
  SUM(CASE WHEN base.status_final = 'ativo'   AND base.custo = 0 THEN base.receita ELSE 0 END) AS receita_ativos_sem_custo,
  SUM(CASE WHEN base.status_final = 'ativo'   AND base.custo > 0 THEN base.receita ELSE 0 END) AS receita_ativos_com_custo,
  SUM(CASE WHEN base.status_final = 'ativo'   AND base.custo > 0 THEN base.custo   ELSE 0 END) AS custo_ativos_com_custo,
  COUNT(DISTINCT CASE WHEN base.status_final = 'inativo' AND base.custo > 0 THEN base.id_beneficiario END) AS inativos_com_custo,
  SUM(CASE WHEN base.status_final = 'inativo' AND base.custo > 0 THEN base.receita ELSE 0 END) AS receita_inativos_com_custo,
  SUM(CASE WHEN base.status_final = 'inativo' AND base.custo > 0 THEN base.custo   ELSE 0 END) AS custo_inativos_com_custo
FROM base
GROUP BY
  base.mes,
  base.entidade,
  base.mes_reajuste,
  base.plano,
  base.faixa_etaria
ORDER BY
  base.mes,
  base.entidade,
  base.plano,
  base.faixa_etaria
`

    const [rows]: any = await connection.execute(queryOficial)
    const dados = (rows || []) as Array<{
      mes: string
      entidade: string | null
      mes_reajuste: string | null
      plano: string | null
      faixa_etaria: string | null
      ativos: number
      ativos_sem_custo: number
      ativos_com_custo: number
      receita_ativos_sem_custo: number
      receita_ativos_com_custo: number
      custo_ativos_com_custo: number
      inativos_com_custo: number
      receita_inativos_com_custo: number
      custo_inativos_com_custo: number
    }>

    // Aplicar filtros de escopo no RESULTADO da query oficial
    const dadosFiltrados = dados.filter(row => {
      if (!row.plano || row.plano !== plano) return false

      if (entidades.length > 0 && (!row.entidade || !entidades.includes(row.entidade))) {
        return false
      }

      if (
        mesesReajuste.length > 0 &&
        (!row.mes_reajuste || !mesesReajuste.includes(row.mes_reajuste))
      ) {
        return false
      }

      // Filtro de status: usamos apenas as colunas já agregadas
      if (statusParam === "ativo") {
        const vidasAtivo =
          (row.ativos_sem_custo || 0) + (row.ativos_com_custo || 0)
        return vidasAtivo > 0
      }

      if (statusParam === "inativo") {
        return (row.inativos_com_custo || 0) > 0
      }

      if (statusParam === "vazio") {
        // A query oficial não possui "não localizados" (status vazio)
        // Mantemos compatibilidade retornando 0 em todas as faixas
        return false
      }

      // "total" não aplica filtro adicional de status
      return true
    })

    type FaixaAgg = {
      faixa_etaria: string
      vidas: number
      valor: number
      valor_net: number
    }

    const faixasMap = new Map<string, FaixaAgg>()

    const getFaixaKey = (faixa: string | null) => faixa || "00 a 18"

    dadosFiltrados.forEach(row => {
      const key = getFaixaKey(row.faixa_etaria)

      const ativos_sem_custo = Number(row.ativos_sem_custo) || 0
      const ativos_com_custo = Number(row.ativos_com_custo) || 0
      const inativos_com_custo = Number(row.inativos_com_custo) || 0
      const receita_ativos_sem_custo =
        Number(row.receita_ativos_sem_custo) || 0
      const receita_ativos_com_custo =
        Number(row.receita_ativos_com_custo) || 0
      const custo_ativos_com_custo =
        Number(row.custo_ativos_com_custo) || 0
      const receita_inativos_com_custo =
        Number(row.receita_inativos_com_custo) || 0
      const custo_inativos_com_custo =
        Number(row.custo_inativos_com_custo) || 0

      let vidas = 0
      let valor = 0
      let valor_net = 0

      if (statusParam === "ativo") {
        vidas = ativos_sem_custo + ativos_com_custo
        valor = custo_ativos_com_custo
        valor_net = receita_ativos_sem_custo + receita_ativos_com_custo
      } else if (statusParam === "inativo") {
        vidas = inativos_com_custo
        valor = custo_inativos_com_custo
        valor_net = receita_inativos_com_custo
      } else {
        // "total": ativos + inativos
        vidas = ativos_sem_custo + ativos_com_custo + inativos_com_custo
        valor = custo_ativos_com_custo + custo_inativos_com_custo
        valor_net =
          receita_ativos_sem_custo +
          receita_ativos_com_custo +
          receita_inativos_com_custo
      }

      const atual =
        faixasMap.get(key) || {
          faixa_etaria: key,
          vidas: 0,
          valor: 0,
          valor_net: 0,
        }

      atual.vidas += vidas
      atual.valor += valor
      atual.valor_net += valor_net

      faixasMap.set(key, atual)
    })

    // Ordenação de faixas fixa
    const ordemFaixas = [
      "00 a 18",
      "19 a 23",
      "24 a 28",
      "29 a 33",
      "34 a 38",
      "39 a 43",
      "44 a 48",
      "49 a 53",
      "54 a 58",
      "59+",
    ]

    const faixasEtarias = ordemFaixas
      .map(faixa => {
        const dados = faixasMap.get(faixa) || {
          faixa_etaria: faixa,
          vidas: 0,
          valor: 0,
          valor_net: 0,
        }
        return { ...dados, is: null as number | null }
      })
      .filter(f => f.vidas > 0 || f.valor !== 0 || f.valor_net !== 0)

    // Consistência: soma das faixas = total do plano (com o mesmo filtro)
    const totalVidasFaixas = faixasEtarias.reduce(
      (sum, f) => sum + f.vidas,
      0,
    )

    // Total do plano (mesmo filtro), obtido da própria base agregada
    let totalVidasPlano = 0
    dadosFiltrados.forEach(row => {
      const ativos_sem_custo = Number(row.ativos_sem_custo) || 0
      const ativos_com_custo = Number(row.ativos_com_custo) || 0
      const inativos_com_custo = Number(row.inativos_com_custo) || 0

      if (statusParam === "ativo") {
        totalVidasPlano += ativos_sem_custo + ativos_com_custo
      } else if (statusParam === "inativo") {
        totalVidasPlano += inativos_com_custo
      } else {
        totalVidasPlano +=
          ativos_sem_custo + ativos_com_custo + inativos_com_custo
      }
    })

    if (process.env.NODE_ENV === "development") {
      const diffVidas = Math.abs(totalVidasPlano - totalVidasFaixas)
      if (diffVidas > 0.01) {
        console.warn(
          `❌ CONSISTÊNCIA FAIXAS x PLANO QUEBROU - Plano: ${plano}, Status: ${statusParam}`,
        )
        console.warn(
          `  total_vidas_plano (agregado): ${totalVidasPlano}, Σ(faixas): ${totalVidasFaixas}, Diferença: ${diffVidas}`,
        )
        console.warn(
          `  Chaves de escopo -> meses: ${mesesReferencia.join(
            ",",
          )}, entidades: ${
            entidades.length > 0 ? entidades.join(",") : "Todas"
          }, meses_reajuste: ${
            mesesReajuste.length > 0 ? mesesReajuste.join(",") : "Todos"
          }`,
        )
        console.warn(
          `  Detalhe por faixa: ${JSON.stringify(
            faixasEtarias.map(f => ({
              faixa: f.faixa_etaria,
              vidas: f.vidas,
            })),
          )}`,
        )
      } else {
        console.log(
          `✅ CONSISTÊNCIA FAIXAS x PLANO OK - Plano: ${plano}, Status: ${statusParam} | total_vidas_plano=${totalVidasPlano}, Σ(faixas)=${totalVidasFaixas}`,
        )
      }
    }

    return NextResponse.json({
      plano,
      faixas_etarias: faixasEtarias,
    })
  } catch (error: any) {
    console.error("Erro ao buscar faixas etárias por plano:", error)
    return NextResponse.json(
      { error: error.message || "Erro ao buscar faixas etárias por plano" },
      { status: 500 },
    )
  } finally {
    if (connection) {
      await connection.end()
    }
  }
}


