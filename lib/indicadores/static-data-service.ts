import indicadoresJson from "@/data/indicadores-consolidado.json"
import { definicoesParaBloco, MESES_NUMEROS } from "./constants"
import { aplicarCalculosIndicadores } from "./calculations"
import { gerarConsolidadoGeral } from "./consolidado-aggregate"
import { normalizarPercentualArmazenado } from "@/utils/format"
import type {
  ConsolidadoLinha,
  ConsolidadoOperadora,
  ConsolidadoResponse,
  IndicadorKey,
  MesNumero,
} from "./types"

export interface IndicadoresRawOperadora {
  operadora: string
  tipo?: "operadora" | "consolidado"
  indicadores: Record<string, Record<string, number | null>>
}

interface IndicadoresJsonAno {
  operadoras: IndicadoresRawOperadora[]
}

interface IndicadoresJsonRoot {
  fonte?: string
  anos: Record<string, IndicadoresJsonAno>
}

/** JSON importado em build-time — não depende de fs nem do cwd em produção. */
const data = indicadoresJson as IndicadoresJsonRoot

const CHAVES_PERCENTUAL_EXCEL: IndicadorKey[] = ["pct_cancelamento", "inadimplencia"]

/** Anos fixos do Excel (2021–2026). */
export const ANOS_INDICADORES_FIXOS = [2026, 2025, 2024, 2023, 2022, 2021] as const

function normalizarValorExcel(key: IndicadorKey, valor: number | null): number | null {
  if (valor === null) return null
  if (CHAVES_PERCENTUAL_EXCEL.includes(key)) {
    return normalizarPercentualArmazenado(valor)
  }
  return valor
}

function indicadoresParaPorMes(
  indicadores: Record<string, Record<string, number | null>>
): Record<MesNumero, Partial<Record<IndicadorKey, number | null>>> {
  const porMes = {} as Record<MesNumero, Partial<Record<IndicadorKey, number | null>>>

  for (const mes of MESES_NUMEROS) {
    porMes[mes] = {}
  }

  for (const [key, meses] of Object.entries(indicadores) as [IndicadorKey, Record<string, number | null>][]) {
    for (const [mesStr, valor] of Object.entries(meses)) {
      const mes = Number(mesStr) as MesNumero
      if (mes < 1 || mes > 12) continue
      porMes[mes][key] = normalizarValorExcel(key, valor)
    }
  }

  return porMes
}

function devePreferirCalculado(
  key: IndicadorKey,
  brutos: Partial<Record<IndicadorKey, number | null>>
): boolean {
  const baseVidas = (brutos.base_saude ?? 0) + (brutos.base_dental ?? 0)
  switch (key) {
    case "inadimplencia":
      return (brutos.faturamento_emitido ?? 0) > 0 && brutos.faturamento_recebido != null
    case "ticket_medio":
      return baseVidas > 0 && (brutos.faturamento_emitido ?? 0) > 0
    case "pct_cancelamento":
      return baseVidas > 0 && brutos.vidas_canceladas != null
    case "base_vidas":
      return brutos.base_saude !== undefined || brutos.base_dental !== undefined
    default:
      return false
  }
}

function resolverValorMes(
  brutos: Partial<Record<IndicadorKey, number | null>>,
  calculados: Partial<Record<IndicadorKey, number | null>>,
  key: IndicadorKey,
  indicadorCalculado?: boolean
): number | null {
  const bruto = brutos[key]
  const calculado = calculados[key]

  if (indicadorCalculado && calculado !== undefined && calculado !== null) {
    if (bruto === undefined || bruto === null) return calculado
    // Excel às vezes grava 0 em campos com fórmula (ex.: inadimplência Integral)
    if (bruto === 0 && devePreferirCalculado(key, brutos)) return calculado
  }

  if (bruto !== undefined && bruto !== null) return bruto
  return calculado === undefined ? null : calculado
}

function montarLinhas(
  porMes: Record<MesNumero, Partial<Record<IndicadorKey, number | null>>>,
  definicoes: ReturnType<typeof definicoesParaBloco>
): ConsolidadoLinha[] {
  return definicoes.map((def) => {
    const valores = {} as Record<MesNumero, number | null>

    for (const mes of MESES_NUMEROS) {
      const brutos = porMes[mes]
      const calculados = aplicarCalculosIndicadores(brutos)
      valores[mes] = resolverValorMes(brutos, calculados, def.key, def.calculado)
    }

    return {
      key: def.key,
      label: def.label,
      formato: def.formato,
      exibirVazioSeZero: def.exibirVazioSeZero,
      valores,
    }
  })
}

function converterOperadora(item: IndicadoresRawOperadora, ano: number): ConsolidadoOperadora {
  const tipo =
    item.tipo ?? (item.operadora.toUpperCase() === "CONSOLIDADO" ? "consolidado" : "operadora")
  const porMes = indicadoresParaPorMes(item.indicadores)
  const definicoes = definicoesParaBloco(item.operadora, tipo, ano)
  return {
    operadora: item.operadora,
    tipo,
    linhas: montarLinhas(porMes, definicoes),
  }
}

export function buscarAnosDisponiveisEstaticos(): number[] {
  const doArquivo = Object.keys(data.anos)
    .map(Number)
    .filter((a) => !Number.isNaN(a))
    .sort((a, b) => b - a)

  if (doArquivo.length > 0) return doArquivo
  return [...ANOS_INDICADORES_FIXOS]
}

export function buscarConsolidadoEstatico(ano: number): ConsolidadoResponse {
  const anoData = data.anos[String(ano)]

  if (!anoData) {
    return {
      ano,
      operadoras: [],
      consolidadoGeral: null,
      operadorasAposConsolidado: [],
      mesesDisponiveis: [],
    }
  }

  return montarConsolidadoDeOperadoras(ano, anoData.operadoras)
}

export function montarConsolidadoDeOperadoras(
  ano: number,
  operadorasRaw: IndicadoresRawOperadora[]
): ConsolidadoResponse {
  const todos = operadorasRaw.map((item) => converterOperadora(item, ano))

  const ordemNoArquivo = new Map(
    operadorasRaw.map((item, index) => [item.operadora, index])
  )
  const ordenarComoExcel = (a: ConsolidadoOperadora, b: ConsolidadoOperadora) =>
    (ordemNoArquivo.get(a.operadora) ?? 9999) - (ordemNoArquivo.get(b.operadora) ?? 9999)

  const isBlocoConsolidado = (op: ConsolidadoOperadora) =>
    op.tipo === "consolidado" ||
    ["CONSOLIDADO", "QV TOTAL"].includes(op.operadora.toUpperCase())

  const consolidadoDoArquivo = todos.find(isBlocoConsolidado)

  const consolidadoIdx = operadorasRaw.findIndex(
    (item) =>
      item.tipo === "consolidado" ||
      ["CONSOLIDADO", "QV TOTAL"].includes(item.operadora.toUpperCase())
  )

  const isAposConsolidado = (op: ConsolidadoOperadora) => {
    const idx = ordemNoArquivo.get(op.operadora)
    return consolidadoIdx >= 0 && idx !== undefined && idx > consolidadoIdx
  }

  const operadoras = todos
    .filter((op) => !isBlocoConsolidado(op) && !isAposConsolidado(op))
    .sort(ordenarComoExcel)

  const operadorasAposConsolidado = todos.filter((op) => isAposConsolidado(op)).sort(ordenarComoExcel)

  const consolidadoGeral =
    consolidadoDoArquivo ??
    (operadoras.length > 0 ? gerarConsolidadoGeral(operadoras) : null)

  const blocosVisiveis = [...operadoras, consolidadoGeral, ...operadorasAposConsolidado].filter(
    Boolean
  ) as ConsolidadoOperadora[]

  const mesesDisponiveis = MESES_NUMEROS.filter((mes) =>
    blocosVisiveis.some((op) => op.linhas.some((l) => l.valores[mes] !== null))
  )

  return { ano, operadoras, consolidadoGeral, operadorasAposConsolidado, mesesDisponiveis }
}
