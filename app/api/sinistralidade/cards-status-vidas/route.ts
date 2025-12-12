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
    // Hierarquia CORRETA: mes > entidade > mes_reajuste > plano > faixa_etaria
    // ⚠️ IMPORTANTE: Usar chaves completas em cada nível para evitar duplicação
    
    // Estrutura de dados hierárquica mantendo contexto completo
    type DadosFaixaEtaria = {
      faixa_etaria: string
      ativos_sem_custo: number
      ativos_com_custo: number
      inativos_com_custo: number
      receita_ativos_sem_custo: number
      receita_ativos_com_custo: number
      custo_ativos_com_custo: number
      receita_inativos_com_custo: number
      custo_inativos_com_custo: number
    }

    type DadosPlano = {
      plano: string
      por_faixa_etaria: Map<string, DadosFaixaEtaria>
      // Totais do plano (SUM direto da query)
      ativos_sem_custo: number
      ativos_com_custo: number
      inativos_com_custo: number
      receita_ativos_sem_custo: number
      receita_ativos_com_custo: number
      custo_ativos_com_custo: number
      receita_inativos_com_custo: number
      custo_inativos_com_custo: number
    }

    type DadosMesReajuste = {
      mes_reajuste: string | null
      por_plano: Map<string, DadosPlano>
      // Totais do mês de reajuste (SUM direto da query)
      ativos_sem_custo: number
      ativos_com_custo: number
      inativos_com_custo: number
      receita_ativos_sem_custo: number
      receita_ativos_com_custo: number
      custo_ativos_com_custo: number
      receita_inativos_com_custo: number
      custo_inativos_com_custo: number
    }

    type DadosEntidade = {
      mes: string
      entidade: string
      por_mes_reajuste: Map<string, DadosMesReajuste>
      // Totais da entidade (SUM direto da query)
      ativos_sem_custo: number
      ativos_com_custo: number
      inativos_com_custo: number
      receita_ativos_sem_custo: number
      receita_ativos_com_custo: number
      custo_ativos_com_custo: number
      receita_inativos_com_custo: number
      custo_inativos_com_custo: number
    }

    // Map principal: chave = mes|entidade
    const cardsFilhosMap = new Map<string, DadosEntidade>()

    // Processar cada linha da query
    dados.forEach((row: any) => {
      const mes = row.mes
      const entidade = row.entidade || ''
      const mesReajuste = row.mes_reajuste || null
      const plano = row.plano || ''
      const faixaEtaria = row.faixa_etaria || ''
      
      if (!entidade) return

      // Valores da linha atual (usar diretamente da query, sem recalcular)
      const valores: DadosFaixaEtaria = {
        faixa_etaria: faixaEtaria,
        ativos_sem_custo: Number(row.ativos_sem_custo) || 0,
        ativos_com_custo: Number(row.ativos_com_custo) || 0,
        inativos_com_custo: Number(row.inativos_com_custo) || 0,
        receita_ativos_sem_custo: Number(row.receita_ativos_sem_custo) || 0,
        receita_ativos_com_custo: Number(row.receita_ativos_com_custo) || 0,
        custo_ativos_com_custo: Number(row.custo_ativos_com_custo) || 0,
        receita_inativos_com_custo: Number(row.receita_inativos_com_custo) || 0,
        custo_inativos_com_custo: Number(row.custo_inativos_com_custo) || 0,
      }

      // Nível 1: Entidade (chave: mes|entidade)
      const keyEntidade = `${mes}|${entidade}`
      let dadosEntidade = cardsFilhosMap.get(keyEntidade)
      if (!dadosEntidade) {
        dadosEntidade = {
          mes,
          entidade,
          por_mes_reajuste: new Map(),
          ativos_sem_custo: 0,
          ativos_com_custo: 0,
          inativos_com_custo: 0,
          receita_ativos_sem_custo: 0,
          receita_ativos_com_custo: 0,
          custo_ativos_com_custo: 0,
          receita_inativos_com_custo: 0,
          custo_inativos_com_custo: 0,
        }
        cardsFilhosMap.set(keyEntidade, dadosEntidade)
      }

      // Nível 2: Mês de Reajuste (chave: mes|entidade|mes_reajuste)
      const keyMesReajuste = mesReajuste || 'null'
      let dadosMesReajuste = dadosEntidade.por_mes_reajuste.get(keyMesReajuste)
      if (!dadosMesReajuste) {
        dadosMesReajuste = {
          mes_reajuste: mesReajuste,
          por_plano: new Map(),
          ativos_sem_custo: 0,
          ativos_com_custo: 0,
          inativos_com_custo: 0,
          receita_ativos_sem_custo: 0,
          receita_ativos_com_custo: 0,
          custo_ativos_com_custo: 0,
          receita_inativos_com_custo: 0,
          custo_inativos_com_custo: 0,
        }
        dadosEntidade.por_mes_reajuste.set(keyMesReajuste, dadosMesReajuste)
      }

      // Nível 3: Plano (chave: mes|entidade|mes_reajuste|plano)
      const keyPlano = `${mes}|${entidade}|${keyMesReajuste}|${plano}`
      let dadosPlano = dadosMesReajuste.por_plano.get(plano)
      if (!dadosPlano) {
        dadosPlano = {
          plano,
          por_faixa_etaria: new Map(),
          ativos_sem_custo: 0,
          ativos_com_custo: 0,
          inativos_com_custo: 0,
          receita_ativos_sem_custo: 0,
          receita_ativos_com_custo: 0,
          custo_ativos_com_custo: 0,
          receita_inativos_com_custo: 0,
          custo_inativos_com_custo: 0,
        }
        dadosMesReajuste.por_plano.set(plano, dadosPlano)
      }

      // Nível 4: Faixa Etária (chave completa: mes|entidade|mes_reajuste|plano|faixa_etaria)
      let dadosFaixa = dadosPlano.por_faixa_etaria.get(faixaEtaria)
      if (!dadosFaixa) {
        dadosFaixa = {
          faixa_etaria: faixaEtaria,
          ativos_sem_custo: 0,
          ativos_com_custo: 0,
          inativos_com_custo: 0,
          receita_ativos_sem_custo: 0,
          receita_ativos_com_custo: 0,
          custo_ativos_com_custo: 0,
          receita_inativos_com_custo: 0,
          custo_inativos_com_custo: 0,
        }
        dadosPlano.por_faixa_etaria.set(faixaEtaria, dadosFaixa)
      }

      // Adicionar valores à faixa etária (SUM direto da query)
      dadosFaixa.ativos_sem_custo += valores.ativos_sem_custo
      dadosFaixa.ativos_com_custo += valores.ativos_com_custo
      dadosFaixa.inativos_com_custo += valores.inativos_com_custo
      dadosFaixa.receita_ativos_sem_custo += valores.receita_ativos_sem_custo
      dadosFaixa.receita_ativos_com_custo += valores.receita_ativos_com_custo
      dadosFaixa.custo_ativos_com_custo += valores.custo_ativos_com_custo
      dadosFaixa.receita_inativos_com_custo += valores.receita_inativos_com_custo
      dadosFaixa.custo_inativos_com_custo += valores.custo_inativos_com_custo

      // Acumular no plano (SUM direto da query)
      dadosPlano.ativos_sem_custo += valores.ativos_sem_custo
      dadosPlano.ativos_com_custo += valores.ativos_com_custo
      dadosPlano.inativos_com_custo += valores.inativos_com_custo
      dadosPlano.receita_ativos_sem_custo += valores.receita_ativos_sem_custo
      dadosPlano.receita_ativos_com_custo += valores.receita_ativos_com_custo
      dadosPlano.custo_ativos_com_custo += valores.custo_ativos_com_custo
      dadosPlano.receita_inativos_com_custo += valores.receita_inativos_com_custo
      dadosPlano.custo_inativos_com_custo += valores.custo_inativos_com_custo

      // Acumular no mês de reajuste (SUM direto da query)
      dadosMesReajuste.ativos_sem_custo += valores.ativos_sem_custo
      dadosMesReajuste.ativos_com_custo += valores.ativos_com_custo
      dadosMesReajuste.inativos_com_custo += valores.inativos_com_custo
      dadosMesReajuste.receita_ativos_sem_custo += valores.receita_ativos_sem_custo
      dadosMesReajuste.receita_ativos_com_custo += valores.receita_ativos_com_custo
      dadosMesReajuste.custo_ativos_com_custo += valores.custo_ativos_com_custo
      dadosMesReajuste.receita_inativos_com_custo += valores.receita_inativos_com_custo
      dadosMesReajuste.custo_inativos_com_custo += valores.custo_inativos_com_custo

      // Acumular na entidade (SUM direto da query)
      dadosEntidade.ativos_sem_custo += valores.ativos_sem_custo
      dadosEntidade.ativos_com_custo += valores.ativos_com_custo
      dadosEntidade.inativos_com_custo += valores.inativos_com_custo
      dadosEntidade.receita_ativos_sem_custo += valores.receita_ativos_sem_custo
      dadosEntidade.receita_ativos_com_custo += valores.receita_ativos_com_custo
      dadosEntidade.custo_ativos_com_custo += valores.custo_ativos_com_custo
      dadosEntidade.receita_inativos_com_custo += valores.receita_inativos_com_custo
      dadosEntidade.custo_inativos_com_custo += valores.custo_inativos_com_custo
    })

    // Função auxiliar para ordenar faixas etárias
    const getOrderFaixa = (faixa: string) => {
      if (faixa === '00 a 18') return 0
      if (faixa === '59+') return 10
      if (faixa === 'Não informado') return 11
      const match = faixa.match(/(\d+)\s+a\s+(\d+)/)
      return match ? parseInt(match[1]) : 99
    }

    // Função para validar totais usando regras conceituais
    const validarTotais = (nome: string, dados: any) => {
      const vidasAtivasCalculadas = dados.ativos_sem_custo + dados.ativos_com_custo
      const vidasTotaisCalculadas = dados.ativos_sem_custo + dados.ativos_com_custo + dados.inativos_com_custo
      const receitaAtivosCalculada = dados.receita_ativos_sem_custo + dados.receita_ativos_com_custo
      const receitaTotalCalculada = dados.receita_ativos_sem_custo + dados.receita_ativos_com_custo + dados.receita_inativos_com_custo

      const erros: string[] = []
      if (Math.abs(vidasAtivasCalculadas - (dados.ativos || vidasAtivasCalculadas)) > 0.01) {
        erros.push(`Vidas Ativas: ${vidasAtivasCalculadas} != ${dados.ativos || vidasAtivasCalculadas}`)
      }
      if (Math.abs(vidasTotaisCalculadas - (dados.total_vidas || vidasTotaisCalculadas)) > 0.01) {
        erros.push(`Vidas Totais: ${vidasTotaisCalculadas} != ${dados.total_vidas || vidasTotaisCalculadas}`)
      }
      if (Math.abs(receitaAtivosCalculada - (dados.receita_ativos || receitaAtivosCalculada)) > 0.01) {
        erros.push(`Receita Ativos: ${receitaAtivosCalculada} != ${dados.receita_ativos || receitaAtivosCalculada}`)
      }
      if (Math.abs(receitaTotalCalculada - (dados.receita_total || receitaTotalCalculada)) > 0.01) {
        erros.push(`Receita Total: ${receitaTotalCalculada} != ${dados.receita_total || receitaTotalCalculada}`)
      }

      if (erros.length > 0 && process.env.NODE_ENV === 'development') {
        console.warn(`⚠️ VALIDAÇÃO ${nome}:`, erros.join(', '))
      }
    }

    // Reorganizar dados por status (ativo/inativo) para compatibilidade com frontend
    // Usando a estrutura hierárquica correta com chaves completas
    const entidadesPorStatus: {
      ativo: Map<string, any>
      inativo: Map<string, any>
    } = {
      ativo: new Map(),
      inativo: new Map(),
    }

    // Processar estrutura hierárquica para criar arrays por status
    // ⚠️ IMPORTANTE: Agregar usando valores do escopo correto (mes_reajuste, não entidade inteira)
    cardsFilhosMap.forEach((dadosEntidade) => {
      const { mes, entidade } = dadosEntidade
      
      dadosEntidade.por_mes_reajuste.forEach((dadosMesReajuste) => {
        const { mes_reajuste } = dadosMesReajuste
        
        // Processar ativos - usar valores do MÊS DE REAJUSTE, não da entidade inteira
        const vidasAtivasMesReajuste = dadosMesReajuste.ativos_sem_custo + dadosMesReajuste.ativos_com_custo
        if (vidasAtivasMesReajuste > 0) {
          const keyAtivo = `${mes}|${entidade}|${mes_reajuste || 'null'}`
          let entidadeAtivo = entidadesPorStatus.ativo.get(keyAtivo)
          
          if (!entidadeAtivo) {
            entidadeAtivo = {
              mes,
              entidade,
              mes_reajuste: mes_reajuste,
              vidas: 0,
              valor_total: 0,
              valor_net_total: 0,
              por_plano: new Map(),
              por_faixa_etaria: new Map(),
              // Campos originais da query
              ativos_sem_custo: 0,
              ativos_com_custo: 0,
              receita_ativos_sem_custo: 0,
              receita_ativos_com_custo: 0,
              custo_ativos_com_custo: 0,
            }
            entidadesPorStatus.ativo.set(keyAtivo, entidadeAtivo)
          }

          // Agregar valores do MÊS DE REAJUSTE (escopo correto)
          entidadeAtivo.vidas += vidasAtivasMesReajuste
          entidadeAtivo.valor_total += dadosMesReajuste.custo_ativos_com_custo
          entidadeAtivo.valor_net_total += dadosMesReajuste.receita_ativos_sem_custo + dadosMesReajuste.receita_ativos_com_custo
          entidadeAtivo.ativos_sem_custo += dadosMesReajuste.ativos_sem_custo
          entidadeAtivo.ativos_com_custo += dadosMesReajuste.ativos_com_custo
          entidadeAtivo.receita_ativos_sem_custo += dadosMesReajuste.receita_ativos_sem_custo
          entidadeAtivo.receita_ativos_com_custo += dadosMesReajuste.receita_ativos_com_custo
          entidadeAtivo.custo_ativos_com_custo += dadosMesReajuste.custo_ativos_com_custo

          // Processar planos dentro deste mês de reajuste
          dadosMesReajuste.por_plano.forEach((dadosPlano) => {
            const planoVidasAtivas = dadosPlano.ativos_sem_custo + dadosPlano.ativos_com_custo
            if (planoVidasAtivas > 0) {
              let planoAtivo = entidadeAtivo.por_plano.get(dadosPlano.plano)
              if (!planoAtivo) {
                planoAtivo = {
                  plano: dadosPlano.plano,
                  vidas: 0,
                  valor: 0,
                  valor_net: 0,
                  por_faixa_etaria: [],
                  // Campos originais
                  ativos_sem_custo: 0,
                  ativos_com_custo: 0,
                  receita_ativos_sem_custo: 0,
                  receita_ativos_com_custo: 0,
                  custo_ativos_com_custo: 0,
                }
                entidadeAtivo.por_plano.set(dadosPlano.plano, planoAtivo)
              }

              planoAtivo.vidas += planoVidasAtivas
              planoAtivo.valor += dadosPlano.custo_ativos_com_custo
              planoAtivo.valor_net += dadosPlano.receita_ativos_sem_custo + dadosPlano.receita_ativos_com_custo
              planoAtivo.ativos_sem_custo += dadosPlano.ativos_sem_custo
              planoAtivo.ativos_com_custo += dadosPlano.ativos_com_custo
              planoAtivo.receita_ativos_sem_custo += dadosPlano.receita_ativos_sem_custo
              planoAtivo.receita_ativos_com_custo += dadosPlano.receita_ativos_com_custo
              planoAtivo.custo_ativos_com_custo += dadosPlano.custo_ativos_com_custo

              // Processar faixas etárias do plano
              dadosPlano.por_faixa_etaria.forEach((dadosFaixa) => {
                const faixaVidasAtivas = dadosFaixa.ativos_sem_custo + dadosFaixa.ativos_com_custo
                if (faixaVidasAtivas > 0) {
                  planoAtivo.por_faixa_etaria.push({
                    faixa_etaria: dadosFaixa.faixa_etaria,
                    vidas: faixaVidasAtivas,
                    valor: dadosFaixa.custo_ativos_com_custo,
                    valor_net: dadosFaixa.receita_ativos_sem_custo + dadosFaixa.receita_ativos_com_custo,
                  })
                }
              })
            }
          })
        }

        // Processar inativos - usar valores do MÊS DE REAJUSTE, não da entidade inteira
        if (dadosMesReajuste.inativos_com_custo > 0) {
          const keyInativo = `${mes}|${entidade}|${mes_reajuste || 'null'}`
          let entidadeInativo = entidadesPorStatus.inativo.get(keyInativo)
          
          if (!entidadeInativo) {
            entidadeInativo = {
              mes,
              entidade,
              mes_reajuste: mes_reajuste,
              vidas: 0,
              valor_total: 0,
              valor_net_total: 0,
              por_plano: new Map(),
              por_faixa_etaria: new Map(),
              // Campos originais
              inativos_com_custo: 0,
              receita_inativos_com_custo: 0,
              custo_inativos_com_custo: 0,
            }
            entidadesPorStatus.inativo.set(keyInativo, entidadeInativo)
          }

          // Agregar valores do MÊS DE REAJUSTE (escopo correto)
          entidadeInativo.vidas += dadosMesReajuste.inativos_com_custo
          entidadeInativo.valor_total += dadosMesReajuste.custo_inativos_com_custo
          entidadeInativo.valor_net_total += dadosMesReajuste.receita_inativos_com_custo
          entidadeInativo.inativos_com_custo += dadosMesReajuste.inativos_com_custo
          entidadeInativo.receita_inativos_com_custo += dadosMesReajuste.receita_inativos_com_custo
          entidadeInativo.custo_inativos_com_custo += dadosMesReajuste.custo_inativos_com_custo

          // Processar planos inativos
          dadosMesReajuste.por_plano.forEach((dadosPlano) => {
            if (dadosPlano.inativos_com_custo > 0) {
              let planoInativo = entidadeInativo.por_plano.get(dadosPlano.plano)
              if (!planoInativo) {
                planoInativo = {
                  plano: dadosPlano.plano,
                  vidas: 0,
                  valor: 0,
                  valor_net: 0,
                  por_faixa_etaria: [],
                  // Campos originais
                  inativos_com_custo: 0,
                  receita_inativos_com_custo: 0,
                  custo_inativos_com_custo: 0,
                }
                entidadeInativo.por_plano.set(dadosPlano.plano, planoInativo)
              }

              planoInativo.vidas += dadosPlano.inativos_com_custo
              planoInativo.valor += dadosPlano.custo_inativos_com_custo
              planoInativo.valor_net += dadosPlano.receita_inativos_com_custo
              planoInativo.inativos_com_custo += dadosPlano.inativos_com_custo
              planoInativo.receita_inativos_com_custo += dadosPlano.receita_inativos_com_custo
              planoInativo.custo_inativos_com_custo += dadosPlano.custo_inativos_com_custo

              // Processar faixas etárias inativas
              dadosPlano.por_faixa_etaria.forEach((dadosFaixa) => {
                if (dadosFaixa.inativos_com_custo > 0) {
                  planoInativo.por_faixa_etaria.push({
                    faixa_etaria: dadosFaixa.faixa_etaria,
                    vidas: dadosFaixa.inativos_com_custo,
                    valor: dadosFaixa.custo_inativos_com_custo,
                    valor_net: dadosFaixa.receita_inativos_com_custo,
                  })
                }
              })
            }
          })
        }
      })
    })

    // Converter Maps para arrays e calcular percentuais usando regras conceituais
    const processarEntidades = (entidadesMap: Map<string, any>, totalVidas: number, totalValor: number, tipo: 'ativo' | 'inativo') => {
      return Array.from(entidadesMap.values()).map((entidade: any) => {
        // Calcular totais usando regras conceituais
        let vidasExibidas: number
        let receitaExibida: number
        let custoExibido: number

        if (tipo === 'ativo') {
          // Regra: Vidas Ativas = ativos_sem_custo + ativos_com_custo
          vidasExibidas = entidade.ativos_sem_custo + entidade.ativos_com_custo
          // Regra: Receita Ativos = receita_ativos_sem_custo + receita_ativos_com_custo
          receitaExibida = entidade.receita_ativos_sem_custo + entidade.receita_ativos_com_custo
          custoExibido = entidade.custo_ativos_com_custo
        } else {
          // Regra: Vidas Inativas = inativos_com_custo
          vidasExibidas = entidade.inativos_com_custo
          // Regra: Receita Inativos = receita_inativos_com_custo
          receitaExibida = entidade.receita_inativos_com_custo
          custoExibido = entidade.custo_inativos_com_custo
        }

        // Validar totais
        validarTotais(`${tipo} - ${entidade.entidade}`, {
          ...entidade,
          vidas: vidasExibidas,
          receita_ativos: receitaExibida,
        })

        // Processar planos
        const planos = Array.from(entidade.por_plano.values()).map((plano: any) => {
          let planoVidasExibidas: number
          let planoReceitaExibida: number
          let planoCustoExibido: number

          if (tipo === 'ativo') {
            planoVidasExibidas = plano.ativos_sem_custo + plano.ativos_com_custo
            planoReceitaExibida = plano.receita_ativos_sem_custo + plano.receita_ativos_com_custo
            planoCustoExibido = plano.custo_ativos_com_custo
          } else {
            planoVidasExibidas = plano.inativos_com_custo
            planoReceitaExibida = plano.receita_inativos_com_custo
            planoCustoExibido = plano.custo_inativos_com_custo
          }

          // Ordenar faixas etárias
          const faixas = (plano.por_faixa_etaria || [])
            .sort((a: any, b: any) => getOrderFaixa(a.faixa_etaria) - getOrderFaixa(b.faixa_etaria))

          // Validar totais do plano
          const somaFaixasVidas = faixas.reduce((sum: number, f: any) => sum + f.vidas, 0)
          if (Math.abs(planoVidasExibidas - somaFaixasVidas) > 0.01 && process.env.NODE_ENV === 'development') {
            console.warn(`⚠️ VALIDAÇÃO Plano ${plano.plano}: Vidas (${planoVidasExibidas}) != Soma Faixas (${somaFaixasVidas})`)
          }

          return {
            plano: plano.plano,
            vidas: planoVidasExibidas,
            valor: planoCustoExibido,
            valor_net: planoReceitaExibida,
            por_faixa_etaria: faixas,
          }
        }).sort((a: any, b: any) => b.vidas - a.vidas)

        // Validar que soma dos planos = total da entidade
        const somaPlanosVidas = planos.reduce((sum: number, p: any) => sum + p.vidas, 0)
        if (Math.abs(vidasExibidas - somaPlanosVidas) > 0.01 && process.env.NODE_ENV === 'development') {
          console.warn(`⚠️ VALIDAÇÃO Entidade ${entidade.entidade}: Vidas (${vidasExibidas}) != Soma Planos (${somaPlanosVidas})`)
        }

        return {
          entidade: entidade.entidade,
          mes_reajuste: entidade.mes_reajuste,
          vidas: vidasExibidas,
          valor_total: custoExibido,
          valor_net_total: receitaExibida,
          pct_vidas: totalVidas > 0 ? vidasExibidas / totalVidas : 0,
          pct_valor: totalValor > 0 ? custoExibido / totalValor : 0,
          por_plano: planos,
          por_faixa_etaria: [], // Não usado no frontend atual
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

    // Calcular totais para percentuais usando regras conceituais
    // Regra: Vidas Ativas = ativos_sem_custo + ativos_com_custo
    const totalVidasAtivo = consolidado.ativos_sem_custo + consolidado.ativos_com_custo
    // Regra: Receita Ativos = receita_ativos_sem_custo + receita_ativos_com_custo
    const totalReceitaAtivo = consolidado.receita_ativos_sem_custo + consolidado.receita_ativos_com_custo
    const totalValorAtivo = consolidado.custo_ativos_com_custo
    
    // Regra: Vidas Inativas = inativos_com_custo
    const totalVidasInativo = consolidado.inativos_com_custo
    // Regra: Receita Inativos = receita_inativos_com_custo
    const totalReceitaInativo = consolidado.receita_inativos_com_custo
    const totalValorInativo = consolidado.custo_inativos_com_custo

    // Validar consolidado
    validarTotais('Consolidado', {
      ...consolidado,
      vidas: totalVidasAtivo,
      receita_ativos: totalReceitaAtivo,
    })

    const entidadesAtivo = processarEntidades(entidadesPorStatus.ativo, totalVidasAtivo, totalValorAtivo, 'ativo')
    const entidadesInativo = processarEntidades(entidadesPorStatus.inativo, totalVidasInativo, totalValorInativo, 'inativo')

    // Criar array total (soma de ativo + inativo) usando regras conceituais
    // Regra: Vidas Totais = ativos_sem_custo + ativos_com_custo + inativos_com_custo
    const totalVidasTotal = totalVidasAtivo + totalVidasInativo
    // Regra: Receita Total = receita_ativos_sem_custo + receita_ativos_com_custo + receita_inativos_com_custo
    const totalReceitaTotal = totalReceitaAtivo + totalReceitaInativo
    const totalValorTotal = totalValorAtivo + totalValorInativo

    const entidadesTotalMap = new Map<string, any>()
    ;[...entidadesAtivo, ...entidadesInativo].forEach(ent => {
      // Usar chave completa incluindo mes para evitar duplicação
      const key = `${ent.entidade}|${ent.mes_reajuste || 'null'}`
      const existente = entidadesTotalMap.get(key)
      if (existente) {
        // Regra: Vidas Totais = ativos + inativos
        existente.vidas += ent.vidas
        existente.valor_total += ent.valor_total
        existente.valor_net_total += ent.valor_net_total
        // Combinar planos (usar chave completa: plano)
        ent.por_plano.forEach((plano: any) => {
          const planoExistente = existente.por_plano.find((p: any) => p.plano === plano.plano)
          if (planoExistente) {
            planoExistente.vidas += plano.vidas
            planoExistente.valor += plano.valor
            planoExistente.valor_net += plano.valor_net
            // Combinar faixas etárias
            plano.por_faixa_etaria.forEach((faixa: any) => {
              const faixaExistente = planoExistente.por_faixa_etaria.find((f: any) => f.faixa_etaria === faixa.faixa_etaria)
              if (faixaExistente) {
                faixaExistente.vidas += faixa.vidas
                faixaExistente.valor += faixa.valor
                faixaExistente.valor_net += faixa.valor_net
              } else {
                planoExistente.por_faixa_etaria.push({ ...faixa })
              }
            })
          } else {
            existente.por_plano.push({ ...plano, por_faixa_etaria: [...plano.por_faixa_etaria] })
          }
        })
      } else {
        entidadesTotalMap.set(key, {
          ...ent,
          por_plano: ent.por_plano.map((p: any) => ({
            ...p,
            por_faixa_etaria: [...p.por_faixa_etaria],
          })),
        })
      }
    })
    const entidadesTotal = Array.from(entidadesTotalMap.values()).map(ent => ({
      ...ent,
      pct_vidas: totalVidasTotal > 0 ? ent.vidas / totalVidasTotal : 0,
      pct_valor: totalValorTotal > 0 ? ent.valor_total / totalValorTotal : 0,
    })).sort((a, b) => {
      if (a.entidade !== b.entidade) return a.entidade.localeCompare(b.entidade)
      if (a.mes_reajuste !== b.mes_reajuste) {
        if (!a.mes_reajuste) return 1
        if (!b.mes_reajuste) return -1
        return (a.mes_reajuste || '').localeCompare(b.mes_reajuste || '')
      }
      return b.valor_total - a.valor_total
    })

    // Validar que Cards Mãe = soma dos Cards Filhos usando regras conceituais
    const somaFilhosAtivo = entidadesAtivo.reduce((sum, e) => sum + e.vidas, 0)
    const somaFilhosInativo = entidadesInativo.reduce((sum, e) => sum + e.vidas, 0)
    const somaFilhosTotal = entidadesTotal.reduce((sum, e) => sum + e.vidas, 0)
    
    const diffAtivo = Math.abs(totalVidasAtivo - somaFilhosAtivo)
    const diffInativo = Math.abs(totalVidasInativo - somaFilhosInativo)
    const diffTotal = Math.abs(totalVidasTotal - somaFilhosTotal)

    if (diffAtivo > 0.01) {
      console.warn(`⚠️ VALIDAÇÃO FINAL: Card Mãe ativos (${totalVidasAtivo}) != Soma Filhos (${somaFilhosAtivo}). Diferença: ${diffAtivo}`)
    }
    if (diffInativo > 0.01) {
      console.warn(`⚠️ VALIDAÇÃO FINAL: Card Mãe inativos (${totalVidasInativo}) != Soma Filhos (${somaFilhosInativo}). Diferença: ${diffInativo}`)
    }
    if (diffTotal > 0.01) {
      console.warn(`⚠️ VALIDAÇÃO FINAL: Card Mãe total (${totalVidasTotal}) != Soma Filhos (${somaFilhosTotal}). Diferença: ${diffTotal}`)
    }

    if (diffAtivo <= 0.01 && diffInativo <= 0.01 && diffTotal <= 0.01) {
      console.log(`✅ VALIDAÇÃO FINAL: Todos os totais estão corretos!`)
    }

    console.log(`✅ Processamento concluído em ${Date.now() - startTime}ms`)

    // Ajustar estrutura de por_mes para compatibilidade com frontend usando regras conceituais
    const porMesFormatado = porMesGeral.map(mes => {
      // Regra: Vidas Ativas = ativos_sem_custo + ativos_com_custo
      const vidasAtivas = mes.ativos_sem_custo + mes.ativos_com_custo
      // Regra: Vidas Inativas = inativos_com_custo
      const vidasInativas = mes.inativos_com_custo
      // Regra: Vidas Totais = ativos_sem_custo + ativos_com_custo + inativos_com_custo
      const vidasTotais = vidasAtivas + vidasInativas
      
      // Regra: Receita Ativos = receita_ativos_sem_custo + receita_ativos_com_custo
      const receitaAtivos = mes.receita_ativos_sem_custo + mes.receita_ativos_com_custo
      // Regra: Receita Inativos = receita_inativos_com_custo
      const receitaInativos = mes.receita_inativos_com_custo
      // Regra: Receita Total = receita_ativos_sem_custo + receita_ativos_com_custo + receita_inativos_com_custo
      const receitaTotal = receitaAtivos + receitaInativos

      // Validar totais do mês
      validarTotais(`Mês ${mes.mes}`, {
        ...mes,
        vidas: vidasAtivas,
        receita_ativos: receitaAtivos,
        receita_total: receitaTotal,
      })

      return {
        mes: mes.mes,
        // Campos compatíveis com frontend (usando regras conceituais)
        ativo: vidasAtivas,
        inativo: vidasInativas,
        nao_localizado: 0, // Query não retorna não localizados
        total_vidas: vidasTotais,
        valor_ativo: mes.custo_ativos_com_custo,
        valor_inativo: mes.custo_inativos_com_custo,
        valor_nao_localizado: 0,
        valor_total_geral: mes.custo_ativos_com_custo + mes.custo_inativos_com_custo,
        valor_net_ativo: receitaAtivos,
        valor_net_inativo: receitaInativos,
        valor_net_nao_localizado: 0,
        valor_net_total_geral: receitaTotal,
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
      }
    })

    // Calcular consolidado usando regras conceituais
    const consolidadoFormatado = {
      ...consolidado,
      // Campos compatíveis com frontend (usando regras conceituais)
      ativo: totalVidasAtivo, // ativos_sem_custo + ativos_com_custo
      inativo: totalVidasInativo, // inativos_com_custo
      nao_localizado: 0, // Query não retorna não localizados
      total_vidas: totalVidasTotal, // ativos_sem_custo + ativos_com_custo + inativos_com_custo
      valor_ativo: totalValorAtivo, // custo_ativos_com_custo
      valor_inativo: totalValorInativo, // custo_inativos_com_custo
      valor_nao_localizado: 0,
      valor_total_geral: totalValorTotal, // custo_ativos_com_custo + custo_inativos_com_custo
      valor_net_ativo: totalReceitaAtivo, // receita_ativos_sem_custo + receita_ativos_com_custo
      valor_net_inativo: totalReceitaInativo, // receita_inativos_com_custo
      valor_net_nao_localizado: 0,
      valor_net_total_geral: totalReceitaTotal, // receita_ativos_sem_custo + receita_ativos_com_custo + receita_inativos_com_custo
    }

    return NextResponse.json({
      por_mes: porMesFormatado,
      consolidado: consolidadoFormatado,
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
