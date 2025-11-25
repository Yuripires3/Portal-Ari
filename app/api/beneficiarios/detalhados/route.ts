export const dynamic = "force-dynamic"
export const revalidate = 0
export const fetchCache = "force-no-store"

import { NextRequest, NextResponse } from "next/server"
import { getDBConnection } from "@/lib/db"

/**
 * GET /api/beneficiarios/detalhados
 * Retorna lista detalhada de beneficiários com procedimentos
 * 
 * Filtros aplicados:
 * - Exclui planos odontológicos (contendo 'DENT' ou 'AESP')
 * - Retorna apenas linhas que possuem procedimentos (evento não nulo)
 * 
 * Parâmetros:
 * - data_inicio: YYYY-MM-DD (primeiro dia do mês de referência inicial)
 * - data_fim: YYYY-MM-DD (último dia do mês de referência final)
 * - operadoras: string separada por vírgula (opcional)
 * - entidades: string separada por vírgula (opcional)
 * - tipo: string (opcional, "Todos" ignora o filtro)
 * - pagina: número (opcional, padrão 1)
 * - limite: número (opcional, padrão 20)
 */
export async function GET(request: NextRequest) {
  let connection: any = null

  try {
    connection = await getDBConnection()
    
    const searchParams = request.nextUrl.searchParams
    const dataInicio = searchParams.get("data_inicio")
    const dataFim = searchParams.get("data_fim")
    const operadorasParam = searchParams.get("operadoras") || searchParams.get("operadora")
    const entidadesParam = searchParams.get("entidades")
    const tipo = searchParams.get("tipo")
    const mesesReferenciaParam = searchParams.get("meses_referencia")
    const cpfParam = searchParams.get("cpf")
    const pagina = parseInt(searchParams.get("pagina") || "1")
    const limite = parseInt(searchParams.get("limite") || "20")
    const offset = (pagina - 1) * limite

    if (!dataInicio || !dataFim) {
      return NextResponse.json(
        { error: "data_inicio e data_fim são obrigatórios" },
        { status: 400 }
      )
    }

    // Normalizar data_fim para último dia do mês
    // Se dataFim já está no formato YYYY-MM-DD, extrair ano e mês e calcular último dia
    const parseDateToLastOfMonth = (dateStr: string): string => {
      // Se já está no formato YYYY-MM-DD, extrair diretamente
      const parts = dateStr.split("-")
      if (parts.length >= 2) {
        const year = parseInt(parts[0])
        const month = parseInt(parts[1]) // mês em formato 1-12
        // Validar mês
        if (month < 1 || month > 12) {
          throw new Error(`Mês inválido: ${month}`)
        }
        // Calcular último dia do mês: new Date(year, month, 0) retorna último dia do mês anterior
        // Então new Date(year, month, 0) onde month está em formato 1-12 retorna último dia do mês (month-1)
        // Para pegar último dia do mês atual, usamos new Date(year, month, 0)
        const lastDay = new Date(year, month, 0).getDate()
        return `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`
      }
      // Fallback: usar Date
      const date = new Date(dateStr)
      if (isNaN(date.getTime())) {
        throw new Error(`Data inválida: ${dateStr}`)
      }
      const year = date.getFullYear()
      const month = date.getMonth() + 1
      const lastDay = new Date(year, month, 0).getDate()
      return `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`
    }

    let dataFimNormalizada: string
    try {
      dataFimNormalizada = parseDateToLastOfMonth(dataFim)
    } catch (error: any) {
      console.error("Erro ao normalizar data_fim:", error, "dataFim recebida:", dataFim)
      return NextResponse.json(
        { error: `Data fim inválida: ${dataFim}. ${error.message}` },
        { status: 400 }
      )
    }

    const sanitizeCpf = (value?: string | null) => {
      if (!value) return ""
      return value.replace(/\D/g, "").slice(0, 11)
    }
    const cpf = sanitizeCpf(cpfParam)

    // Construir filtros WHERE para beneficiários
    const beneficiarioConditions: string[] = []
    const beneficiarioValues: any[] = []

    // Condições obrigatórias: beneficiário deve ter iniciado antes do fim do período
    beneficiarioConditions.push("b.data_inicio_vigencia_beneficiario <= ?")
    beneficiarioValues.push(dataFimNormalizada)
    
    // Incluir beneficiários que têm procedimentos no período, independente do status
    // Apenas excluir se a data_exclusao for anterior ao início do período (já estava excluído antes)
    beneficiarioConditions.push(`(
      b.data_exclusao IS NULL 
      OR b.data_exclusao >= ?
    )`)
    beneficiarioValues.push(dataInicio)

    // Filtro fixo: apenas operadora ASSIM SAÚDE
    beneficiarioConditions.push("UPPER(b.operadora) = 'ASSIM SAÚDE'")

    // Filtros opcionais
    if (operadorasParam) {
      const operadoras = operadorasParam.split(",").map(op => op.trim()).filter(Boolean)
      if (operadoras.length > 0) {
        beneficiarioConditions.push(`b.operadora IN (${operadoras.map(() => "?").join(",")})`)
        beneficiarioValues.push(...operadoras)
      }
    }

    if (entidadesParam) {
      const entidades = entidadesParam.split(",").map(e => e.trim()).filter(Boolean)
      if (entidades.length > 0) {
        beneficiarioConditions.push(`b.entidade IN (${entidades.map(() => "?").join(",")})`)
        beneficiarioValues.push(...entidades)
      }
    }

    if (tipo && tipo !== "Todos") {
      beneficiarioConditions.push("b.tipo = ?")
      beneficiarioValues.push(tipo)
    }

    if (cpf) {
      beneficiarioConditions.push("b.cpf = ?")
      beneficiarioValues.push(cpf)
    }

    // Excluir planos odontológicos
    beneficiarioConditions.push(`(
      UPPER(b.plano) NOT LIKE '%DENT%' 
      AND UPPER(b.plano) NOT LIKE '%AESP%' 
    )`)

    const mesesReferencia = mesesReferenciaParam
      ? mesesReferenciaParam.split(",").map(m => m.trim()).filter(Boolean)
      : []
    const mesesCompetenciaDatas = mesesReferencia.map(mes => `${mes}-01`)

    const procedimentosConditions: string[] = ["p.evento IS NOT NULL"]
    const procedimentosValues: any[] = []

    if (mesesCompetenciaDatas.length > 0) {
      procedimentosConditions.push(`DATE(p.data_competencia) IN (${mesesCompetenciaDatas.map(() => "?").join(",")})`)
      procedimentosValues.push(...mesesCompetenciaDatas)
    }

    if (cpf) {
      procedimentosConditions.push("p.cpf = ?")
      procedimentosValues.push(cpf)
    }

    const procedimentosWhereOnlyClause = procedimentosConditions.length > 0
      ? procedimentosConditions.join(" AND ")
      : ""

    const allConditions = [...beneficiarioConditions, ...procedimentosConditions]
    const whereClause = allConditions.length > 0
      ? `WHERE ${allConditions.join(" AND ")}`
      : ""

    const baseFromClause = `
      FROM reg_beneficiarios b
      INNER JOIN reg_procedimentos p ON b.cpf = p.cpf 
        AND p.data_competencia >= ? 
        AND p.data_competencia <= ?
      ${whereClause}
    `

    const baseParams = [
      dataInicio,
      dataFimNormalizada,
      ...beneficiarioValues,
      ...procedimentosValues,
    ]

    // Query dedicada aos cards de sinistralidade usando CTEs
    const procedimentosPeriodoFilters: string[] = []
    const procedimentosPeriodoValues: any[] = []

    if (mesesCompetenciaDatas.length > 0) {
      procedimentosPeriodoFilters.push(
        `DATE(p.data_competencia) IN (${mesesCompetenciaDatas.map(() => "?").join(",")})`
      )
      procedimentosPeriodoValues.push(...mesesCompetenciaDatas)
    } else {
      procedimentosPeriodoFilters.push("p.data_competencia >= ?")
      procedimentosPeriodoFilters.push("p.data_competencia <= ?")
      procedimentosPeriodoValues.push(dataInicio, dataFimNormalizada)
    }

    procedimentosPeriodoFilters.push("p.evento IS NOT NULL")

    if (cpf) {
      procedimentosPeriodoFilters.push("p.cpf = ?")
      procedimentosPeriodoValues.push(cpf)
    }

    const procedimentosCardsWhereClause = procedimentosPeriodoFilters.length > 0
      ? procedimentosPeriodoFilters.join(" AND ")
      : "1=1"

    const sinistralidadeCardsQuery = `
      WITH beneficiarios_filtrados AS (
        SELECT cpf, status_beneficiario
        FROM (
          SELECT 
            b.cpf,
            b.status_beneficiario,
            ROW_NUMBER() OVER (
              PARTITION BY b.cpf 
              ORDER BY b.data_inicio_vigencia_beneficiario DESC
            ) AS rn
          FROM reg_beneficiarios b
          WHERE ${beneficiarioConditions.join(" AND ")}
        ) recentes
        WHERE rn = 1
      ),
      procedimentos_filtrados AS (
        SELECT
          DATE_FORMAT(p.data_competencia, '%Y-%m') AS mes_label,
          p.cpf,
          p.valor_procedimento
        FROM reg_procedimentos p
        WHERE ${procedimentosCardsWhereClause}
      ),
      procedimentos_classificados AS (
        SELECT
          pf.mes_label,
          pf.cpf,
          pf.valor_procedimento,
          CASE
            WHEN bf.cpf IS NULL THEN 'vazio'
            WHEN LOWER(bf.status_beneficiario) = 'ativo' THEN 'ativo'
            ELSE 'inativo'
          END AS categoria_status
        FROM procedimentos_filtrados pf
        LEFT JOIN beneficiarios_filtrados bf ON bf.cpf = pf.cpf
      ),
      status_por_cpf_mes AS (
        SELECT
          mes_label,
          cpf,
          CASE
            WHEN SUM(CASE WHEN categoria_status = 'ativo' THEN 1 ELSE 0 END) > 0 THEN 'ativo'
            WHEN SUM(CASE WHEN categoria_status = 'inativo' THEN 1 ELSE 0 END) > 0 THEN 'inativo'
            ELSE 'vazio'
          END AS status_final,
          SUM(valor_procedimento) AS total_valor
        FROM procedimentos_classificados
        GROUP BY mes_label, cpf
      )
      SELECT
        status_final,
        COUNT(*) AS beneficiarios_qtd,
        COALESCE(SUM(total_valor), 0) AS total_valor
      FROM status_por_cpf_mes
      GROUP BY status_final
    `

    const sinistralidadeCardsParams = [
      ...beneficiarioValues,
      ...procedimentosPeriodoValues,
    ]

    const [sinistralidadeCardsRows]: any = await connection.execute(
      sinistralidadeCardsQuery,
      sinistralidadeCardsParams
    )

    const categoriaMap = new Map<string, { quantidade: number; valor: number }>()
    ;(sinistralidadeCardsRows || []).forEach((row: any) => {
      const key = row.status_final || row.categoria_status
      categoriaMap.set(key, {
        quantidade: Number(row.beneficiarios_qtd) || 0,
        valor: Number(row.total_valor) || 0,
      })
    })

    const ativosCategoria = categoriaMap.get("ativo") || { quantidade: 0, valor: 0 }
    const inativosCategoria = categoriaMap.get("inativo") || { quantidade: 0, valor: 0 }
    const naoLocalizadosCategoria = categoriaMap.get("vazio") || categoriaMap.get("nao_localizado") || { quantidade: 0, valor: 0 }

    const resumo = {
      ativos: {
        quantidade: ativosCategoria.quantidade,
        valor: ativosCategoria.valor,
      },
      inativos: {
        quantidade: inativosCategoria.quantidade,
        valor: inativosCategoria.valor,
      },
      zero: {
        quantidade: naoLocalizadosCategoria.quantidade,
        valor: naoLocalizadosCategoria.valor,
      },
      cancelados: {
        quantidade: inativosCategoria.quantidade,
        valor: inativosCategoria.valor,
      },
    }

    const naoIdentificados = {
      quantidade: naoLocalizadosCategoria.quantidade,
      valor: naoLocalizadosCategoria.valor,
    }

    // Buscar dados detalhados dos procedimentos não identificados
    // Apenas CPFs que NÃO existem em reg_beneficiarios (ASSIM SAÚDE) - beneficiários realmente não identificados
    // Se há mês de referência, usar apenas DATE(p.data_competencia) IN (...), senão usar range de datas
    const naoIdentificadosDetalhesQuery = mesesCompetenciaDatas.length > 0
      ? `
        SELECT DISTINCT
          p.cpf AS CPF,
          NULL AS NOME,
          NULL AS OPERADORA,
          NULL AS PLANO,
          NULL AS ENTIDADE,
          NULL AS STATUS,
          NULL AS IDADE,
          p.evento AS EVENTO,
          p.descricao AS DESCRICAO,
          p.especialidade AS ESPECIALIDADE,
          p.valor_procedimento AS VALOR,
          p.data_competencia AS DATA_COMPETENCIA,
          p.data_atendimento AS DATA_ATENDIMENTO,
          0 AS GASTO_ANUAL
        FROM reg_procedimentos p
        WHERE ${procedimentosWhereOnlyClause ? procedimentosWhereOnlyClause : "p.evento IS NOT NULL"}
          AND NOT EXISTS (
            SELECT 1
            FROM reg_beneficiarios b_nao
            WHERE b_nao.cpf = p.cpf
              AND UPPER(b_nao.operadora) = 'ASSIM SAÚDE'
          )
        ORDER BY p.valor_procedimento DESC, p.data_competencia DESC
      `
      : `
        SELECT DISTINCT
          p.cpf AS CPF,
          NULL AS NOME,
          NULL AS OPERADORA,
          NULL AS PLANO,
          NULL AS ENTIDADE,
          NULL AS STATUS,
          NULL AS IDADE,
          p.evento AS EVENTO,
          p.descricao AS DESCRICAO,
          p.especialidade AS ESPECIALIDADE,
          p.valor_procedimento AS VALOR,
          p.data_competencia AS DATA_COMPETENCIA,
          p.data_atendimento AS DATA_ATENDIMENTO,
          0 AS GASTO_ANUAL
        FROM reg_procedimentos p
        WHERE p.data_competencia >= ?
          AND p.data_competencia <= ?
          AND p.evento IS NOT NULL
          AND NOT EXISTS (
            SELECT 1
            FROM reg_beneficiarios b_nao
            WHERE b_nao.cpf = p.cpf
              AND UPPER(b_nao.operadora) = 'ASSIM SAÚDE'
          )
        ORDER BY p.valor_procedimento DESC, p.data_competencia DESC
      `

    const naoIdentificadosDetalhesParams = mesesCompetenciaDatas.length > 0
      ? [...procedimentosValues]
      : [dataInicio, dataFimNormalizada]

    const [naoIdentificadosDetalhesRows]: any = await connection.execute(
      naoIdentificadosDetalhesQuery,
      naoIdentificadosDetalhesParams
    )

    // Buscar CPFs distintos que têm procedimentos no período (respeitando filtros de procedimentos)
    // Depois verificar se passam pelos filtros de beneficiários, mas incluir mesmo que não passe
    // (garantindo que CPFs com procedimentos sempre apareçam)
    // Se há mês de referência, usar apenas DATE(p.data_competencia) IN (...), senão usar range de datas
    const cpfsComProcedimentosQuery = mesesCompetenciaDatas.length > 0
      ? `
        SELECT DISTINCT p.cpf
        FROM reg_procedimentos p
        WHERE ${procedimentosWhereOnlyClause ? procedimentosWhereOnlyClause : "p.evento IS NOT NULL"}
      `
      : `
        SELECT DISTINCT p.cpf
        FROM reg_procedimentos p
        WHERE p.data_competencia >= ?
          AND p.data_competencia <= ?
          AND p.evento IS NOT NULL
      `

    const cpfsComProcedimentosParams = mesesCompetenciaDatas.length > 0
      ? [...procedimentosValues]
      : [dataInicio, dataFimNormalizada]

    const [cpfsComProcedimentosRows]: any = await connection.execute(
      cpfsComProcedimentosQuery,
      cpfsComProcedimentosParams
    )

    const cpfsComProcedimentos = (cpfsComProcedimentosRows || []).map((row: any) => row.cpf).filter(Boolean)

    if (cpfsComProcedimentos.length === 0) {
      return NextResponse.json({
        dados: [],
        total: 0,
        pagina,
        limite,
        totalPaginas: 0,
        resumo,
        naoIdentificados,
        naoIdentificadosDetalhes: [],
      })
    }

    // Agora buscar dados dos beneficiários para esses CPFs e calcular gasto anual
    const cpfsPlaceholders = cpfsComProcedimentos.map(() => "?").join(",")
    
    // Criar versão do procedimentosWhereOnlyClause sem prefixo p. para usar na subquery
    const procedimentosWhereOnlyClauseSubquery = procedimentosWhereOnlyClause
      ? procedimentosWhereOnlyClause.replace(/p\./g, '')
      : ""
    
    const cpfsQuery = `
      SELECT 
        COALESCE(b.cpf, p.cpf) AS cpf,
        COALESCE(gastos.gasto_anual, 0) AS gasto_anual
      FROM (
        SELECT DISTINCT cpf
        FROM reg_procedimentos
        WHERE cpf IN (${cpfsPlaceholders})
          ${mesesCompetenciaDatas.length > 0 
            ? (procedimentosWhereOnlyClauseSubquery ? `AND ${procedimentosWhereOnlyClauseSubquery}` : "AND evento IS NOT NULL")
            : `AND data_competencia >= ? AND data_competencia <= ? AND evento IS NOT NULL`
          }
      ) p
      LEFT JOIN reg_beneficiarios b ON b.cpf = p.cpf
        AND UPPER(b.operadora) = 'ASSIM SAÚDE'
      LEFT JOIN (
        SELECT 
          p2.cpf,
          SUM(p2.valor_procedimento) AS gasto_anual
        FROM reg_procedimentos p2
        INNER JOIN (
          SELECT cpf, MAX(data_competencia) AS data_recente
          FROM reg_procedimentos
          WHERE cpf IN (${cpfsPlaceholders})
          GROUP BY cpf
        ) ult ON ult.cpf = p2.cpf
        WHERE p2.data_competencia BETWEEN DATE_SUB(ult.data_recente, INTERVAL 11 MONTH) AND ult.data_recente
        GROUP BY p2.cpf
      ) gastos ON gastos.cpf = p.cpf
      ORDER BY gasto_anual DESC, p.cpf
      LIMIT ${limite} OFFSET ${offset}
    `

    // Parâmetros: cpfsComProcedimentos, depois dataInicio/dataFimNormalizada (se não há mês de referência), 
    // depois procedimentosValues (se há mês de referência), depois cpfsComProcedimentos novamente
    const cpfsQueryParams = mesesCompetenciaDatas.length > 0
      ? [
          ...cpfsComProcedimentos,
          ...procedimentosValues,
          ...cpfsComProcedimentos,
        ]
      : [
          ...cpfsComProcedimentos,
          dataInicio,
          dataFimNormalizada,
          ...cpfsComProcedimentos,
        ]

    const [cpfRows]: any = await connection.execute(cpfsQuery, cpfsQueryParams)

    const gastosAnuaisMap = new Map<string, number>()
    const cpfsSelecionados = (cpfRows || [])
      .map((row: any) => {
        if (!row?.cpf) return null
        gastosAnuaisMap.set(row.cpf, Number(row.gasto_anual) || 0)
        return row.cpf
      })
      .filter(Boolean)

    if (cpfsSelecionados.length === 0) {
      return NextResponse.json({
        dados: [],
        total: 0,
        pagina,
        limite,
        totalPaginas: 0,
        resumo,
      })
    }

    const cpfPlaceholders = cpfsSelecionados.map(() => "?").join(",")
    
    // Query de dados: usar LEFT JOIN para incluir CPFs com procedimentos mesmo que não passem por todos os filtros
    // Se há mês de referência, usar apenas DATE(p.data_competencia) IN (...), senão usar range de datas
    const dadosFromClause = mesesCompetenciaDatas.length > 0
      ? `
        FROM reg_procedimentos p
        LEFT JOIN reg_beneficiarios b ON b.cpf = p.cpf
          AND UPPER(b.operadora) = 'ASSIM SAÚDE'
        WHERE p.cpf IN (${cpfPlaceholders})
          ${procedimentosWhereOnlyClause ? `AND ${procedimentosWhereOnlyClause}` : "AND p.evento IS NOT NULL"}
      `
      : `
        FROM reg_procedimentos p
        LEFT JOIN reg_beneficiarios b ON b.cpf = p.cpf
          AND UPPER(b.operadora) = 'ASSIM SAÚDE'
        WHERE p.cpf IN (${cpfPlaceholders})
          AND p.data_competencia >= ? 
          AND p.data_competencia <= ?
          AND p.evento IS NOT NULL
      `

    const query = `
      SELECT DISTINCT
        COALESCE(b.operadora, NULL) as OPERADORA,
        COALESCE(b.plano, NULL) as PLANO,
        p.cpf as CPF,
        COALESCE(b.nome, NULL) as NOME,
        COALESCE(b.entidade, NULL) as ENTIDADE,
        COALESCE(b.status_beneficiario, NULL) as STATUS,
        COALESCE(b.idade, NULL) as IDADE,
        p.evento as EVENTO,
        p.descricao as DESCRICAO,
        p.especialidade as ESPECIALIDADE,
        p.valor_procedimento as VALOR,
        p.data_competencia as DATA_COMPETENCIA,
        p.data_atendimento as DATA_ATENDIMENTO,
        COALESCE(b.nome, p.cpf) as ORDENACAO_NOME
      ${dadosFromClause}
      ORDER BY ORDENACAO_NOME, p.data_competencia DESC
    `

    // Parâmetros: cpfsSelecionados, depois dataInicio/dataFimNormalizada (se não há mês de referência), depois procedimentosValues
    const dadosParams = mesesCompetenciaDatas.length > 0
      ? [
          ...cpfsSelecionados,
          ...procedimentosValues,
        ]
      : [
          ...cpfsSelecionados,
          dataInicio,
          dataFimNormalizada,
        ]

    const [rows]: any = await connection.execute(query, dadosParams)

    const dadosComGastoAnual = (rows || [])
      .map((row: any) => ({
        ...row,
        GASTO_ANUAL: gastosAnuaisMap.get(row.CPF) || 0,
      }))
      .sort((a: any, b: any) => {
        const diff = (b.GASTO_ANUAL || 0) - (a.GASTO_ANUAL || 0)
        if (diff !== 0) return diff
        return String(a.CPF).localeCompare(String(b.CPF))
      })

    // Count: contar CPFs que têm procedimentos no período (mesma lógica da query de CPFs)
    // Se há mês de referência, usar apenas DATE(p.data_competencia) IN (...), senão usar range de datas
    const countQuery = mesesCompetenciaDatas.length > 0
      ? `
        SELECT COUNT(DISTINCT p.cpf) as total
        FROM reg_procedimentos p
        WHERE ${procedimentosWhereOnlyClause ? procedimentosWhereOnlyClause : "p.evento IS NOT NULL"}
      `
      : `
        SELECT COUNT(DISTINCT p.cpf) as total
        FROM reg_procedimentos p
        WHERE p.data_competencia >= ?
          AND p.data_competencia <= ?
          AND p.evento IS NOT NULL
      `

    const countParams = mesesCompetenciaDatas.length > 0
      ? [...procedimentosValues]
      : [dataInicio, dataFimNormalizada]

    const [countRows]: any = await connection.execute(countQuery, countParams)

    const total = countRows[0]?.total || 0

    return NextResponse.json({
      dados: dadosComGastoAnual,
      total,
      pagina,
      limite,
      totalPaginas: Math.ceil(total / limite),
      resumo,
      naoIdentificados,
      naoIdentificadosDetalhes: naoIdentificadosDetalhesRows || [],
    })
  } catch (error: any) {
    console.error("Erro ao buscar beneficiários detalhados:", error)
    return NextResponse.json(
      { error: error.message || "Erro ao buscar dados detalhados" },
      { status: 500 }
    )
  } finally {
    if (connection) {
      await connection.end()
    }
  }
}

