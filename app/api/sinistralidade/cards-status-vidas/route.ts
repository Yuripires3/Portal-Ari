export const dynamic = "force-dynamic"
export const revalidate = 0
export const fetchCache = "force-no-store"

import { NextRequest, NextResponse } from "next/server"
import { getDBConnection } from "@/lib/db"

/**
 * GET /api/sinistralidade/cards-status-vidas
 * 
 * Retorna cards de sinistralidade usando EXATAMENTE a query SQL oficial fornecida.
 * 
 * Estrutura:
 * - Cards Mãe: Agregados por mês (soma de todas as entidades, planos, meses de reajuste e faixas etárias)
 * - Cards Filhos: Drilldown hierárquico: entidade > plano > mes_reajuste > faixa_etaria
 * 
 * Parâmetros:
 * - meses_referencia: string separada por vírgula (ex: "2025-01,2025-02") - obrigatório
 * 
 * Retorno:
 * {
 *   por_mes: [...], // Cards Mãe - um por mês
 *   consolidado: { ... }, // Consolidado geral
 *   por_entidade: { ... } // Cards Filhos com drilldown
 * }
 */
export async function GET(request: NextRequest) {
  let connection: any = null
  const startTime = Date.now()

  try {
    const searchParams = request.nextUrl.searchParams
    const mesesReferenciaParam = searchParams.get("meses_referencia")

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

    connection = await getDBConnection()

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

    // ⚠️ QUERY ÚNICA E OFICIAL - USAR SEM MODIFICAÇÕES NA LÓGICA
    // Apenas ajustando as datas hardcoded para usar os meses fornecidos dinamicamente
    // Esta query retorna dados agrupados por: mes, entidade, mes_reajuste, plano, faixa_etaria
    const queryOficial = `
WITH
meses AS (
  ${mesesReferencia.map(mes => {
    const [ano, mesNum] = mes.split("-")
    return `SELECT DATE('${ano}-${mesNum}-01') AS mes_ref`
  }).join(" UNION ALL\n  ")}
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

    // Executar a query oficial
    const [rows]: any = await connection.execute(queryOficial)
    const dados = rows || []

    console.log(`⏱️ Query executada em ${Date.now() - startTime}ms`)
    console.log(`📊 Total de linhas retornadas: ${dados.length}`)

    // Processar dados para criar Cards Mãe (agregados por mês)
    // Cada Card Mãe representa um mês e soma TODAS as entidades, planos, meses de reajuste e faixas etárias
    const cardsMaeMap = new Map<string, {
      mes: string
      ativos: number
      ativos_sem_custo: number
      ativos_com_custo: number
      receita_ativos_sem_custo: number
      receita_ativos_com_custo: number
      custo_ativos_com_custo: number
      inativos_com_custo: number
      receita_inativos_com_custo: number
      custo_inativos_com_custo: number
    }>()

    dados.forEach((row: any) => {
      const mes = row.mes
      const atual = cardsMaeMap.get(mes) || {
        mes,
        ativos: 0,
        ativos_sem_custo: 0,
        ativos_com_custo: 0,
        receita_ativos_sem_custo: 0,
        receita_ativos_com_custo: 0,
        custo_ativos_com_custo: 0,
        inativos_com_custo: 0,
        receita_inativos_com_custo: 0,
        custo_inativos_com_custo: 0,
      }

      // Somar diretamente os valores da query (sem recalcular)
      atual.ativos += Number(row.ativos) || 0
      atual.ativos_sem_custo += Number(row.ativos_sem_custo) || 0
      atual.ativos_com_custo += Number(row.ativos_com_custo) || 0
      atual.receita_ativos_sem_custo += Number(row.receita_ativos_sem_custo) || 0
      atual.receita_ativos_com_custo += Number(row.receita_ativos_com_custo) || 0
      atual.custo_ativos_com_custo += Number(row.custo_ativos_com_custo) || 0
      atual.inativos_com_custo += Number(row.inativos_com_custo) || 0
      atual.receita_inativos_com_custo += Number(row.receita_inativos_com_custo) || 0
      atual.custo_inativos_com_custo += Number(row.custo_inativos_com_custo) || 0

      cardsMaeMap.set(mes, atual)
    })

    const porMesGeral = Array.from(cardsMaeMap.values()).sort((a, b) => a.mes.localeCompare(b.mes))

    // Calcular consolidado geral (soma de todos os meses)
    const consolidado = porMesGeral.reduce((acc, mes) => ({
      ativos: acc.ativos + mes.ativos,
      ativos_sem_custo: acc.ativos_sem_custo + mes.ativos_sem_custo,
      ativos_com_custo: acc.ativos_com_custo + mes.ativos_com_custo,
      receita_ativos_sem_custo: acc.receita_ativos_sem_custo + mes.receita_ativos_sem_custo,
      receita_ativos_com_custo: acc.receita_ativos_com_custo + mes.receita_ativos_com_custo,
      custo_ativos_com_custo: acc.custo_ativos_com_custo + mes.custo_ativos_com_custo,
      inativos_com_custo: acc.inativos_com_custo + mes.inativos_com_custo,
      receita_inativos_com_custo: acc.receita_inativos_com_custo + mes.receita_inativos_com_custo,
      custo_inativos_com_custo: acc.custo_inativos_com_custo + mes.custo_inativos_com_custo,
    }), {
      ativos: 0,
      ativos_sem_custo: 0,
      ativos_com_custo: 0,
      receita_ativos_sem_custo: 0,
      receita_ativos_com_custo: 0,
      custo_ativos_com_custo: 0,
      inativos_com_custo: 0,
      receita_inativos_com_custo: 0,
      custo_inativos_com_custo: 0,
    })

    // Processar dados para criar Cards Filhos com drilldown hierárquico
    // Hierarquia: mes > entidade > plano > mes_reajuste > faixa_etaria
    const cardsFilhosMap = new Map<string, {
      mes: string
      entidade: string
      por_plano: Map<string, { 
        plano: string
        por_mes_reajuste: Map<string, {
          mes_reajuste: string | null
          por_faixa_etaria: Map<string, {
            faixa_etaria: string
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
          // Totais do mes_reajuste (soma das faixas)
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
        // Totais do plano (soma dos meses de reajuste)
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
      // Totais da entidade (soma dos planos)
      ativos: number
      ativos_sem_custo: number
      ativos_com_custo: number
      receita_ativos_sem_custo: number
      receita_ativos_com_custo: number
      custo_ativos_com_custo: number
      inativos_com_custo: number
      receita_inativos_com_custo: number
      custo_inativos_com_custo: number
    }>()

    dados.forEach((row: any) => {
      const mes = row.mes
      const entidade = row.entidade || ''
      const plano = row.plano || ''
      const mesReajuste = row.mes_reajuste || null
      const faixaEtaria = row.faixa_etaria || ''
      
      if (!entidade) return

      const keyEntidade = `${mes}|${entidade}`
      let cardEntidade = cardsFilhosMap.get(keyEntidade)

      if (!cardEntidade) {
        cardEntidade = {
          mes,
          entidade,
          por_plano: new Map(),
          ativos: 0,
          ativos_sem_custo: 0,
          ativos_com_custo: 0,
          receita_ativos_sem_custo: 0,
          receita_ativos_com_custo: 0,
          custo_ativos_com_custo: 0,
          inativos_com_custo: 0,
          receita_inativos_com_custo: 0,
          custo_inativos_com_custo: 0,
        }
        cardsFilhosMap.set(keyEntidade, cardEntidade)
      }

      // Nível: Plano
      let cardPlano = cardEntidade.por_plano.get(plano)
      if (!cardPlano) {
        cardPlano = {
          plano,
          por_mes_reajuste: new Map(),
          ativos: 0,
          ativos_sem_custo: 0,
          ativos_com_custo: 0,
          receita_ativos_sem_custo: 0,
          receita_ativos_com_custo: 0,
          custo_ativos_com_custo: 0,
          inativos_com_custo: 0,
          receita_inativos_com_custo: 0,
          custo_inativos_com_custo: 0,
        }
        cardEntidade.por_plano.set(plano, cardPlano)
      }

      // Nível: Mês de Reajuste
      const keyMesReajuste = mesReajuste || 'null'
      let cardMesReajuste = cardPlano.por_mes_reajuste.get(keyMesReajuste)
      if (!cardMesReajuste) {
        cardMesReajuste = {
        mes_reajuste: mesReajuste,
        por_faixa_etaria: new Map(),
          ativos: 0,
          ativos_sem_custo: 0,
          ativos_com_custo: 0,
          receita_ativos_sem_custo: 0,
          receita_ativos_com_custo: 0,
          custo_ativos_com_custo: 0,
          inativos_com_custo: 0,
          receita_inativos_com_custo: 0,
          custo_inativos_com_custo: 0,
        }
        cardPlano.por_mes_reajuste.set(keyMesReajuste, cardMesReajuste)
      }

      // Nível: Faixa Etária
      let cardFaixaEtaria = cardMesReajuste.por_faixa_etaria.get(faixaEtaria)
      if (!cardFaixaEtaria) {
        cardFaixaEtaria = {
          faixa_etaria: faixaEtaria,
          ativos: 0,
          ativos_sem_custo: 0,
          ativos_com_custo: 0,
          receita_ativos_sem_custo: 0,
          receita_ativos_com_custo: 0,
          custo_ativos_com_custo: 0,
          inativos_com_custo: 0,
          receita_inativos_com_custo: 0,
          custo_inativos_com_custo: 0,
        }
        cardMesReajuste.por_faixa_etaria.set(faixaEtaria, cardFaixaEtaria)
      }

      // Adicionar valores da linha atual (sem recalcular, usar diretamente da query)
      const valores = {
        ativos: Number(row.ativos) || 0,
        ativos_sem_custo: Number(row.ativos_sem_custo) || 0,
        ativos_com_custo: Number(row.ativos_com_custo) || 0,
        receita_ativos_sem_custo: Number(row.receita_ativos_sem_custo) || 0,
        receita_ativos_com_custo: Number(row.receita_ativos_com_custo) || 0,
        custo_ativos_com_custo: Number(row.custo_ativos_com_custo) || 0,
        inativos_com_custo: Number(row.inativos_com_custo) || 0,
        receita_inativos_com_custo: Number(row.receita_inativos_com_custo) || 0,
        custo_inativos_com_custo: Number(row.custo_inativos_com_custo) || 0,
      }

      // Adicionar à faixa etária
      cardFaixaEtaria.ativos += valores.ativos
      cardFaixaEtaria.ativos_sem_custo += valores.ativos_sem_custo
      cardFaixaEtaria.ativos_com_custo += valores.ativos_com_custo
      cardFaixaEtaria.receita_ativos_sem_custo += valores.receita_ativos_sem_custo
      cardFaixaEtaria.receita_ativos_com_custo += valores.receita_ativos_com_custo
      cardFaixaEtaria.custo_ativos_com_custo += valores.custo_ativos_com_custo
      cardFaixaEtaria.inativos_com_custo += valores.inativos_com_custo
      cardFaixaEtaria.receita_inativos_com_custo += valores.receita_inativos_com_custo
      cardFaixaEtaria.custo_inativos_com_custo += valores.custo_inativos_com_custo

      // Acumular no mês de reajuste
      cardMesReajuste.ativos += valores.ativos
      cardMesReajuste.ativos_sem_custo += valores.ativos_sem_custo
      cardMesReajuste.ativos_com_custo += valores.ativos_com_custo
      cardMesReajuste.receita_ativos_sem_custo += valores.receita_ativos_sem_custo
      cardMesReajuste.receita_ativos_com_custo += valores.receita_ativos_com_custo
      cardMesReajuste.custo_ativos_com_custo += valores.custo_ativos_com_custo
      cardMesReajuste.inativos_com_custo += valores.inativos_com_custo
      cardMesReajuste.receita_inativos_com_custo += valores.receita_inativos_com_custo
      cardMesReajuste.custo_inativos_com_custo += valores.custo_inativos_com_custo

      // Acumular no plano
      cardPlano.ativos += valores.ativos
      cardPlano.ativos_sem_custo += valores.ativos_sem_custo
      cardPlano.ativos_com_custo += valores.ativos_com_custo
      cardPlano.receita_ativos_sem_custo += valores.receita_ativos_sem_custo
      cardPlano.receita_ativos_com_custo += valores.receita_ativos_com_custo
      cardPlano.custo_ativos_com_custo += valores.custo_ativos_com_custo
      cardPlano.inativos_com_custo += valores.inativos_com_custo
      cardPlano.receita_inativos_com_custo += valores.receita_inativos_com_custo
      cardPlano.custo_inativos_com_custo += valores.custo_inativos_com_custo

      // Acumular na entidade
      cardEntidade.ativos += valores.ativos
      cardEntidade.ativos_sem_custo += valores.ativos_sem_custo
      cardEntidade.ativos_com_custo += valores.ativos_com_custo
      cardEntidade.receita_ativos_sem_custo += valores.receita_ativos_sem_custo
      cardEntidade.receita_ativos_com_custo += valores.receita_ativos_com_custo
      cardEntidade.custo_ativos_com_custo += valores.custo_ativos_com_custo
      cardEntidade.inativos_com_custo += valores.inativos_com_custo
      cardEntidade.receita_inativos_com_custo += valores.receita_inativos_com_custo
      cardEntidade.custo_inativos_com_custo += valores.custo_inativos_com_custo
    })

    // Converter Maps para arrays e estruturar hierarquicamente
    // Função auxiliar para ordenar faixas etárias
    const getOrderFaixa = (faixa: string) => {
      if (faixa === '00 a 18') return 0
      if (faixa === '59+') return 10
      if (faixa === 'Não informado') return 11
      const match = faixa.match(/(\d+)\s+a\s+(\d+)/)
      return match ? parseInt(match[1]) : 99
    }

    // Reorganizar dados por status (ativo/inativo) para compatibilidade com frontend
    // A query retorna dados agrupados, mas precisamos separar por status para criar os arrays esperados
    const entidadesPorStatus: {
      ativo: Map<string, any>
      inativo: Map<string, any>
    } = {
      ativo: new Map(),
      inativo: new Map(),
    }

    // Processar cada linha da query para separar por status
    dados.forEach((row: any) => {
      const entidade = row.entidade || ''
      const mesReajuste = row.mes_reajuste || null
      const plano = row.plano || ''
      const faixaEtaria = row.faixa_etaria || ''

      if (!entidade) return

      // Processar ativos (se houver)
      if (Number(row.ativos) > 0 || Number(row.ativos_sem_custo) > 0 || Number(row.ativos_com_custo) > 0) {
        const keyAtivo = `${entidade}|${mesReajuste || 'null'}`
        let entidadeAtivo = entidadesPorStatus.ativo.get(keyAtivo)
        
        if (!entidadeAtivo) {
          entidadeAtivo = {
            entidade,
            mes_reajuste: mesReajuste,
            vidas: 0,
            valor_total: 0,
            valor_net_total: 0,
            por_plano: new Map(),
            por_faixa_etaria: new Map(),
          }
          entidadesPorStatus.ativo.set(keyAtivo, entidadeAtivo)
        }

        entidadeAtivo.vidas += Number(row.ativos) || 0
        entidadeAtivo.valor_total += Number(row.custo_ativos_com_custo) || 0
        entidadeAtivo.valor_net_total += Number(row.receita_ativos_com_custo) || 0

        // Adicionar plano
        let planoAtivo = entidadeAtivo.por_plano.get(plano)
        if (!planoAtivo) {
          planoAtivo = {
            plano,
            vidas: 0,
            valor: 0,
            valor_net: 0,
            por_faixa_etaria: new Map(),
          }
          entidadeAtivo.por_plano.set(plano, planoAtivo)
        }
        planoAtivo.vidas += Number(row.ativos) || 0
        planoAtivo.valor += Number(row.custo_ativos_com_custo) || 0
        planoAtivo.valor_net += Number(row.receita_ativos_com_custo) || 0

        // Adicionar faixa etária
        let faixaAtivo = planoAtivo.por_faixa_etaria.get(faixaEtaria)
        if (!faixaAtivo) {
          faixaAtivo = {
            faixa_etaria: faixaEtaria,
            vidas: 0,
            valor: 0,
            valor_net: 0,
          }
          planoAtivo.por_faixa_etaria.set(faixaEtaria, faixaAtivo)
        }
        faixaAtivo.vidas += Number(row.ativos) || 0
        faixaAtivo.valor += Number(row.custo_ativos_com_custo) || 0
        faixaAtivo.valor_net += Number(row.receita_ativos_com_custo) || 0
      }

      // Processar inativos (se houver)
      if (Number(row.inativos_com_custo) > 0) {
        const keyInativo = `${entidade}|${mesReajuste || 'null'}`
        let entidadeInativo = entidadesPorStatus.inativo.get(keyInativo)
        
        if (!entidadeInativo) {
          entidadeInativo = {
            entidade,
            mes_reajuste: mesReajuste,
            vidas: 0,
            valor_total: 0,
            valor_net_total: 0,
            por_plano: new Map(),
            por_faixa_etaria: new Map(),
          }
          entidadesPorStatus.inativo.set(keyInativo, entidadeInativo)
        }

        entidadeInativo.vidas += Number(row.inativos_com_custo) || 0
        entidadeInativo.valor_total += Number(row.custo_inativos_com_custo) || 0
        entidadeInativo.valor_net_total += Number(row.receita_inativos_com_custo) || 0

        // Adicionar plano
        let planoInativo = entidadeInativo.por_plano.get(plano)
        if (!planoInativo) {
          planoInativo = {
            plano,
            vidas: 0,
            valor: 0,
            valor_net: 0,
            por_faixa_etaria: new Map(),
          }
          entidadeInativo.por_plano.set(plano, planoInativo)
        }
        planoInativo.vidas += Number(row.inativos_com_custo) || 0
        planoInativo.valor += Number(row.custo_inativos_com_custo) || 0
        planoInativo.valor_net += Number(row.receita_inativos_com_custo) || 0

        // Adicionar faixa etária
        let faixaInativo = planoInativo.por_faixa_etaria.get(faixaEtaria)
        if (!faixaInativo) {
          faixaInativo = {
            faixa_etaria: faixaEtaria,
            vidas: 0,
            valor: 0,
            valor_net: 0,
          }
          planoInativo.por_faixa_etaria.set(faixaEtaria, faixaInativo)
        }
        faixaInativo.vidas += Number(row.inativos_com_custo) || 0
        faixaInativo.valor += Number(row.custo_inativos_com_custo) || 0
        faixaInativo.valor_net += Number(row.receita_inativos_com_custo) || 0
      }
    })

    // Converter Maps para arrays e calcular percentuais
    const processarEntidades = (entidadesMap: Map<string, any>, totalVidas: number, totalValor: number) => {
      return Array.from(entidadesMap.values()).map((entidade: any) => {
        const planos = Array.from(entidade.por_plano.values()).map((plano: any) => {
          const faixas = Array.from(plano.por_faixa_etaria.values())
            .sort((a: any, b: any) => getOrderFaixa(a.faixa_etaria) - getOrderFaixa(b.faixa_etaria))

          return {
            plano: plano.plano,
            vidas: plano.vidas,
            valor: plano.valor,
            valor_net: plano.valor_net,
            por_faixa_etaria: faixas,
          }
        }).sort((a: any, b: any) => b.vidas - a.vidas)

        const faixas = Array.from(entidade.por_faixa_etaria.values())
          .sort((a: any, b: any) => getOrderFaixa(a.faixa_etaria) - getOrderFaixa(b.faixa_etaria))

        return {
          entidade: entidade.entidade,
          mes_reajuste: entidade.mes_reajuste,
          vidas: entidade.vidas,
          valor_total: entidade.valor_total,
          valor_net_total: entidade.valor_net_total,
          pct_vidas: totalVidas > 0 ? entidade.vidas / totalVidas : 0,
          pct_valor: totalValor > 0 ? entidade.valor_total / totalValor : 0,
          por_plano: planos,
          por_faixa_etaria: faixas,
        }
      }).sort((a, b) => {
        if (a.entidade !== b.entidade) return a.entidade.localeCompare(b.entidade)
        if (a.mes_reajuste !== b.mes_reajuste) {
          if (!a.mes_reajuste) return 1
          if (!b.mes_reajuste) return -1
          return (a.mes_reajuste || '').localeCompare(b.mes_reajuste || '')
        }
        return b.valor_total - a.valor_total
      })
    }

    // Calcular totais para percentuais
    const totalVidasAtivo = consolidado.ativos
    const totalValorAtivo = consolidado.custo_ativos_com_custo
    const totalVidasInativo = consolidado.inativos_com_custo
    const totalValorInativo = consolidado.custo_inativos_com_custo

    const entidadesAtivo = processarEntidades(entidadesPorStatus.ativo, totalVidasAtivo, totalValorAtivo)
    const entidadesInativo = processarEntidades(entidadesPorStatus.inativo, totalVidasInativo, totalValorInativo)

    // Criar array total (soma de ativo + inativo)
    const entidadesTotalMap = new Map<string, any>()
    ;[...entidadesAtivo, ...entidadesInativo].forEach(ent => {
      const key = `${ent.entidade}|${ent.mes_reajuste || 'null'}`
      const existente = entidadesTotalMap.get(key)
      if (existente) {
        existente.vidas += ent.vidas
        existente.valor_total += ent.valor_total
        existente.valor_net_total += ent.valor_net_total
        // Combinar planos
        ent.por_plano.forEach((plano: any) => {
          const planoExistente = existente.por_plano.find((p: any) => p.plano === plano.plano)
          if (planoExistente) {
            planoExistente.vidas += plano.vidas
            planoExistente.valor += plano.valor
            planoExistente.valor_net += plano.valor_net
          } else {
            existente.por_plano.push(plano)
          }
        })
      } else {
        entidadesTotalMap.set(key, {
          ...ent,
          por_plano: [...ent.por_plano],
        })
      }
    })
    const entidadesTotal = Array.from(entidadesTotalMap.values()).map(ent => ({
      ...ent,
      pct_vidas: (consolidado.ativos + consolidado.inativos_com_custo) > 0 
        ? ent.vidas / (consolidado.ativos + consolidado.inativos_com_custo) 
        : 0,
      pct_valor: (consolidado.custo_ativos_com_custo + consolidado.custo_inativos_com_custo) > 0
        ? ent.valor_total / (consolidado.custo_ativos_com_custo + consolidado.custo_inativos_com_custo)
        : 0,
    })).sort((a, b) => {
      if (a.entidade !== b.entidade) return a.entidade.localeCompare(b.entidade)
      if (a.mes_reajuste !== b.mes_reajuste) {
        if (!a.mes_reajuste) return 1
        if (!b.mes_reajuste) return -1
        return (a.mes_reajuste || '').localeCompare(b.mes_reajuste || '')
      }
      return b.valor_total - a.valor_total
    })

    // Validar que Cards Mãe = soma dos Cards Filhos
    const somaFilhosAtivo = entidadesAtivo.reduce((sum, e) => sum + e.vidas, 0)
    const somaFilhosInativo = entidadesInativo.reduce((sum, e) => sum + e.vidas, 0)
    const diffAtivo = Math.abs(consolidado.ativos - somaFilhosAtivo)
    const diffInativo = Math.abs(consolidado.inativos_com_custo - somaFilhosInativo)

    if (diffAtivo > 0.01) {
      console.warn(`⚠️ VALIDAÇÃO: Card Mãe ativos (${consolidado.ativos}) != Soma Filhos (${somaFilhosAtivo}). Diferença: ${diffAtivo}`)
    }
    if (diffInativo > 0.01) {
      console.warn(`⚠️ VALIDAÇÃO: Card Mãe inativos (${consolidado.inativos_com_custo}) != Soma Filhos (${somaFilhosInativo}). Diferença: ${diffInativo}`)
    }

    console.log(`✅ Processamento concluído em ${Date.now() - startTime}ms`)

    // Ajustar estrutura de por_mes para compatibilidade com frontend
    const porMesFormatado = porMesGeral.map(mes => ({
      mes: mes.mes,
      // Campos compatíveis com frontend
      ativo: mes.ativos,
      inativo: mes.inativos_com_custo,
      nao_localizado: 0, // Query não retorna não localizados
      total_vidas: mes.ativos + mes.inativos_com_custo,
      valor_ativo: mes.custo_ativos_com_custo,
      valor_inativo: mes.custo_inativos_com_custo,
      valor_nao_localizado: 0,
      valor_total_geral: mes.custo_ativos_com_custo + mes.custo_inativos_com_custo,
      valor_net_ativo: mes.receita_ativos_com_custo,
      valor_net_inativo: mes.receita_inativos_com_custo,
      valor_net_nao_localizado: 0,
      valor_net_total_geral: mes.receita_ativos_com_custo + mes.receita_inativos_com_custo,
      // Campos originais da query (mantidos para referência)
      ativos: mes.ativos,
      ativos_sem_custo: mes.ativos_sem_custo,
      ativos_com_custo: mes.ativos_com_custo,
      receita_ativos_sem_custo: mes.receita_ativos_sem_custo,
      receita_ativos_com_custo: mes.receita_ativos_com_custo,
      custo_ativos_com_custo: mes.custo_ativos_com_custo,
      inativos_com_custo: mes.inativos_com_custo,
      receita_inativos_com_custo: mes.receita_inativos_com_custo,
      custo_inativos_com_custo: mes.custo_inativos_com_custo,
    }))

    return NextResponse.json({
      por_mes: porMesFormatado,
      consolidado: {
        ...consolidado,
        // Adicionar campos compatíveis com frontend (mapeando para estrutura antiga)
        ativo: consolidado.ativos,
        inativo: consolidado.inativos_com_custo,
        nao_localizado: 0, // Query não retorna não localizados
        total_vidas: consolidado.ativos + consolidado.inativos_com_custo,
        valor_ativo: consolidado.custo_ativos_com_custo,
        valor_inativo: consolidado.custo_inativos_com_custo,
        valor_nao_localizado: 0,
        valor_total_geral: consolidado.custo_ativos_com_custo + consolidado.custo_inativos_com_custo,
        valor_net_ativo: consolidado.receita_ativos_com_custo,
        valor_net_inativo: consolidado.receita_inativos_com_custo,
        valor_net_nao_localizado: 0,
        valor_net_total_geral: consolidado.receita_ativos_com_custo + consolidado.receita_inativos_com_custo,
      },
      por_entidade: {
        ativo: entidadesAtivo,
        inativo: entidadesInativo,
        nao_localizado: [], // Query não retorna não localizados
        total: entidadesTotal,
      },
    })
  } catch (error: any) {
    console.error("Erro ao buscar cards de sinistralidade:", error)
    return NextResponse.json(
      { error: error.message || "Erro ao buscar cards de sinistralidade" },
      { status: 500 }
    )
  } finally {
    if (connection) {
      await connection.end()
    }
  }
}
