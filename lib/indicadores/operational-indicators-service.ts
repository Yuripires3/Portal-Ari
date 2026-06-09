import type { Connection } from "mysql2/promise"
import { getDBConnection } from "../db.ts"
import type { IndicadorKey } from "./types"

type StatusCompetencia = "aberto" | "projecao" | "fechado"

interface CompetenciaAtualizacao {
  ano: number
  mes: number
  status: StatusCompetencia
}

interface LinhaAgregada {
  operadora: string
  [key: string]: string | number | null
}

type ValoresOperadora = Partial<Record<IndicadorKey, number>>

const ATUALIZACAO_MINIMA_MS = 5 * 60 * 1000
const g = globalThis as typeof globalThis & {
  __INDICADORES_SYNC_PROMISE?: Promise<void>
  __INDICADORES_SYNC_AT?: number
}

const MESES_SNAPSHOT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const

const ORDEM_PADRAO = [
  "Unimed Rio",
  "ASSIM SAUDE",
  "SEGUROS Unimed",
  "Leve Saude",
  "NOVA SAUDE",
  "blue.",
  "Hapvida NotreDame",
  "Oplan",
  "HealthMed",
  "SAUDE ONIX",
  "MedSenior",
  "CONSOLIDADO",
  "Amil",
  "Integral Saude",
  "AESP Odonto",
]

const CHAVES_OPERACIONAIS: IndicadorKey[] = [
  "base_vidas",
  "base_saude",
  "base_dental",
  "vidas_canceladas",
  "retencao",
  "cancel_inadimplencia",
  "cancel_solicitacao_cliente",
  "cancel_solicitado_ops",
  "falecimento",
  "outros",
  "vendas",
  "faturamento_emitido",
  "faturamento_recebido",
]

function normalizarTexto(valor: string): string {
  return valor
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim()
}

function normalizarOperadora(valor: string | null | undefined): string | null {
  if (!valor) return null
  const nome = normalizarTexto(valor)

  if (nome.includes("UNIMED FERJ") || nome.includes("UNIMED RIO")) return "Unimed Rio"
  if (nome.startsWith("ASSIM")) return "ASSIM SAUDE"
  if (nome.includes("SEGUROS UNIMED")) return "SEGUROS Unimed"
  if (nome.includes("HAPVIDA") || nome.includes("NOTREDAME") || nome === "GNDI")
    return "Hapvida NotreDame"
  if (nome.includes("INTEGRAL")) return "Integral Saude"
  if (nome.includes("HEALTH")) return "HealthMed"
  if (nome.includes("AESP")) return "AESP Odonto"
  if (nome.includes("MEDSENIOR") || nome.includes("MED SENIOR")) return "MedSenior"
  if (nome.includes("NOVA SAUDE")) return "NOVA SAUDE"
  if (nome.includes("LEVE")) return "Leve Saude"
  if (nome.includes("OPLAN")) return "Oplan"
  if (nome.includes("ONIX")) return "SAUDE ONIX"
  if (nome.includes("BLUE")) return "blue."
  if (nome.includes("AMIL")) return "Amil"
  if (nome.includes("KLINI")) return "Klini Saude"
  return valor.trim()
}

function somarValor(
  mapa: Map<string, ValoresOperadora>,
  operadoraRaw: string,
  key: IndicadorKey,
  valor: unknown
) {
  const operadora = normalizarOperadora(operadoraRaw)
  const numero = Number(valor ?? 0)
  if (!operadora || !Number.isFinite(numero)) return

  const atual = mapa.get(operadora) ?? {}
  atual[key] = (atual[key] ?? 0) + numero
  mapa.set(operadora, atual)
}

function dataEmSaoPaulo(): Date {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date())
  const get = (type: string) => Number(partes.find((p) => p.type === type)?.value)
  return new Date(Date.UTC(get("year"), get("month") - 1, get("day"), 12))
}

function adicionarMes(ano: number, mes: number, delta: number) {
  const data = new Date(Date.UTC(ano, mes - 1 + delta, 1, 12))
  return { ano: data.getUTCFullYear(), mes: data.getUTCMonth() + 1 }
}

function segundoDiaUtil(ano: number, mes: number): number {
  let encontrados = 0
  for (let dia = 1; dia <= 7; dia++) {
    const semana = new Date(Date.UTC(ano, mes - 1, dia, 12)).getUTCDay()
    if (semana === 0 || semana === 6) continue
    encontrados++
    if (encontrados === 2) return dia
  }
  return 2
}

function competenciasParaAtualizar(hoje: Date): CompetenciaAtualizacao[] {
  const ano = hoje.getUTCFullYear()
  const mes = hoje.getUTCMonth() + 1
  const dia = hoje.getUTCDate()
  const segundoUtil = segundoDiaUtil(ano, mes)
  const anterior = adicionarMes(ano, mes, -1)
  const atual: CompetenciaAtualizacao = { ano, mes, status: "aberto" }

  if (dia <= segundoUtil) {
    return [
      {
        ...anterior,
        status: dia === segundoUtil ? "fechado" : "aberto",
      },
      atual,
    ]
  }

  if (dia >= 15) {
    return [atual, { ...adicionarMes(ano, mes, 1), status: "projecao" }]
  }

  return [atual]
}

async function incluirFechamentoPendente(
  connection: Connection,
  competencias: CompetenciaAtualizacao[],
  hoje: Date
) {
  const ano = hoje.getUTCFullYear()
  const mes = hoje.getUTCMonth() + 1
  const dia = hoje.getUTCDate()
  if (dia <= segundoDiaUtil(ano, mes)) return competencias

  const anterior = adicionarMes(ano, mes, -1)
  const [rows] = await connection.execute(
    `SELECT status
     FROM indicadores_competencias
     WHERE ano = ? AND mes = ?`,
    [anterior.ano, anterior.mes]
  )
  const status = (rows as Array<{ status: StatusCompetencia }>)[0]?.status
  if (status === "fechado") return competencias
  return [{ ...anterior, status: "fechado" as const }, ...competencias]
}

async function agregarCompetencia(
  connection: Connection,
  ano: number,
  mes: number
): Promise<Map<string, ValoresOperadora>> {
  const valores = new Map<string, ValoresOperadora>()
  const snapshot = `${MESES_SNAPSHOT[mes - 1]}/${String(ano).slice(-2)}`
  const inicio = `${ano}-${String(mes).padStart(2, "0")}-01`
  const proxima = adicionarMes(ano, mes, 1)
  const fim = `${proxima.ano}-${String(proxima.mes).padStart(2, "0")}-01`

  const [ativos] = await connection.execute(
    `SELECT operadora,
            COUNT(*) AS base_vidas,
            SUM(tipo_de_plano = 'Saúde') AS base_saude,
            SUM(tipo_de_plano = 'Dental') AS base_dental,
            SUM(classificacao_da_venda = 'Venda nova') AS vendas
     FROM registro_indicadores_df_ativos
     WHERE acumulado_mes = ?
     GROUP BY operadora`,
    [snapshot]
  )
  for (const row of ativos as LinhaAgregada[]) {
    for (const key of ["base_vidas", "base_saude", "base_dental", "vendas"] as IndicadorKey[]) {
      somarValor(valores, row.operadora, key, row[key])
    }
  }

  const [inativos] = await connection.execute(
    `SELECT operadora,
            COUNT(*) AS vidas_canceladas,
            SUM(motivo_canc_agrupado = 'Inad') AS cancel_inadimplencia,
            SUM(motivo_canc_agrupado = 'Solic. Cliente') AS cancel_solicitacao_cliente,
            SUM(motivo_canc_agrupado = 'Solic. OPS') AS cancel_solicitado_ops,
            SUM(motivo_canc_agrupado = 'Óbito') AS falecimento,
            SUM(motivo_canc_agrupado = 'Outros') AS outros
     FROM registro_indicadores_df_inativos
     WHERE data_exclusao >= ? AND data_exclusao < ?
       AND status_beneficiario <> 'Inutilizado'
     GROUP BY operadora`,
    [inicio, fim]
  )
  for (const row of inativos as LinhaAgregada[]) {
    for (const key of [
      "vidas_canceladas",
      "cancel_inadimplencia",
      "cancel_solicitacao_cliente",
      "cancel_solicitado_ops",
      "falecimento",
      "outros",
    ] as IndicadorKey[]) {
      somarValor(valores, row.operadora, key, row[key])
    }
  }

  const [atendimentos] = await connection.execute(
    `SELECT operadora, SUM(qntd_total_vidas) AS retencao
     FROM registro_indicadores_df_atendimentos
     WHERE data_inclusao_atendimento >= ? AND data_inclusao_atendimento < ?
       AND rubrica_registro = 'Desconto'
     GROUP BY operadora`,
    [inicio, fim]
  )
  for (const row of atendimentos as LinhaAgregada[]) {
    somarValor(valores, row.operadora, "retencao", row.retencao)
  }

  const [faturamento] = await connection.execute(
    `SELECT operadora,
            SUM(valor_cobranca) AS faturamento_emitido,
            SUM(CASE WHEN status_fatura = 'Paga' THEN valor_cobranca ELSE 0 END)
              AS faturamento_recebido
     FROM consulta_faturamento
     WHERE ano_competencia = ? AND mes_competencia = ?
     GROUP BY operadora`,
    [String(ano), String(mes)]
  )
  for (const row of faturamento as LinhaAgregada[]) {
    somarValor(valores, row.operadora, "faturamento_emitido", row.faturamento_emitido)
    somarValor(valores, row.operadora, "faturamento_recebido", row.faturamento_recebido)
  }

  for (const indicadores of valores.values()) {
    for (const key of CHAVES_OPERACIONAIS) {
      indicadores[key] ??= 0
    }
  }

  return valores
}

function montarConsolidado(valores: Map<string, ValoresOperadora>): ValoresOperadora {
  const consolidado: ValoresOperadora = {}
  for (const [operadora, indicadores] of valores) {
    if (operadora === "AESP Odonto" || operadora === "CONSOLIDADO") continue
    for (const [key, valor] of Object.entries(indicadores) as [IndicadorKey, number][]) {
      consolidado[key] = (consolidado[key] ?? 0) + valor
    }
  }
  return consolidado
}

async function persistirCompetencia(
  connection: Connection,
  competencia: CompetenciaAtualizacao,
  valores: Map<string, ValoresOperadora>
) {
  valores.set("CONSOLIDADO", montarConsolidado(valores))

  const operadoras = [...valores.keys()]
  const placeholdersOperadoras = operadoras.map(() => "?").join(", ")
  const [ordensRows] = await connection.execute(
    `SELECT operadora, MIN(ordem_operadora) AS ordem_operadora
     FROM indicadores_consolidado_valores
     WHERE ano = ? AND operadora IN (${placeholdersOperadoras})
     GROUP BY operadora`,
    [competencia.ano, ...operadoras]
  )
  const ordens = new Map(
    (ordensRows as Array<{ operadora: string; ordem_operadora: number }>).map((row) => [
      row.operadora,
      Number(row.ordem_operadora),
    ])
  )
  const registros: Array<string | number> = []
  const placeholders: string[] = []

  for (const [operadora, indicadores] of valores) {
    const indicePadrao = ORDEM_PADRAO.indexOf(operadora)
    const ordem =
      ordens.get(operadora) ??
      (indicePadrao >= 0 ? indicePadrao : ORDEM_PADRAO.length + 100)
    const tipo = operadora === "CONSOLIDADO" ? "consolidado" : "operadora"

    for (const [key, valor] of Object.entries(indicadores) as [IndicadorKey, number][]) {
      placeholders.push("(?, ?, ?, ?, ?, ?, ?, 'banco_operacional')")
      registros.push(
        competencia.ano,
        operadora,
        tipo,
        ordem,
        key,
        competencia.mes,
        valor
      )
    }
  }

  if (placeholders.length > 0) {
    await connection.query(
      `INSERT INTO indicadores_consolidado_valores
        (ano, operadora, tipo, ordem_operadora, indicador_key, mes, valor, fonte)
       VALUES ${placeholders.join(", ")}
       ON DUPLICATE KEY UPDATE
         tipo = VALUES(tipo),
         ordem_operadora = VALUES(ordem_operadora),
         valor = VALUES(valor),
         fonte = VALUES(fonte),
         updated_at = CURRENT_TIMESTAMP`,
      registros
    )
  }

  await connection.execute(
    `INSERT INTO indicadores_competencias (ano, mes, status, fechado_em)
     VALUES (?, ?, ?, CASE WHEN ? = 'fechado' THEN NOW() ELSE NULL END)
     ON DUPLICATE KEY UPDATE
       status = VALUES(status),
       fechado_em = CASE
         WHEN VALUES(status) = 'fechado' THEN COALESCE(fechado_em, NOW())
         ELSE NULL
       END,
       atualizado_em = CURRENT_TIMESTAMP`,
    [competencia.ano, competencia.mes, competencia.status, competencia.status]
  )
}

async function sincronizarAgora() {
  let connection: Awaited<ReturnType<typeof getDBConnection>> | null = null
  try {
    connection = await getDBConnection()
    const hoje = dataEmSaoPaulo()
    let competencias = competenciasParaAtualizar(hoje)
    competencias = await incluirFechamentoPendente(connection, competencias, hoje)

    for (const competencia of competencias) {
      const [statusRows] = await connection.execute(
        `SELECT status
         FROM indicadores_competencias
         WHERE ano = ? AND mes = ?`,
        [competencia.ano, competencia.mes]
      )
      const statusAtual = (statusRows as Array<{ status: StatusCompetencia }>)[0]?.status
      if (statusAtual === "fechado" && competencia.status !== "fechado") continue

      const valores = await agregarCompetencia(connection, competencia.ano, competencia.mes)
      if (valores.size === 0) continue

      await connection.beginTransaction()
      try {
        await persistirCompetencia(connection, competencia, valores)
        await connection.commit()
      } catch (error) {
        await connection.rollback()
        throw error
      }
    }
  } finally {
    await connection?.end()
  }
}

export async function sincronizarIndicadoresOperacionais() {
  const agora = Date.now()
  if (g.__INDICADORES_SYNC_AT && agora - g.__INDICADORES_SYNC_AT < ATUALIZACAO_MINIMA_MS) {
    return
  }
  if (g.__INDICADORES_SYNC_PROMISE) return g.__INDICADORES_SYNC_PROMISE

  g.__INDICADORES_SYNC_PROMISE = sincronizarAgora()
    .then(() => {
      g.__INDICADORES_SYNC_AT = Date.now()
    })
    .finally(() => {
      g.__INDICADORES_SYNC_PROMISE = undefined
    })

  return g.__INDICADORES_SYNC_PROMISE
}
