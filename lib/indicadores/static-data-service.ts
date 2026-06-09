import { readFileSync } from "fs"
import { join } from "path"
import { INDICADORES_DEFINICOES, MESES_NUMEROS } from "./constants"
import { aplicarCalculosIndicadores } from "./calculations"
import { gerarConsolidadoGeral } from "./consolidado-aggregate"
import { prioridadeOperadora } from "./operadora-display"
import { normalizarPercentualArmazenado } from "@/utils/format"
import type {
  ConsolidadoLinha,
  ConsolidadoOperadora,
  ConsolidadoResponse,
  IndicadorKey,
  MesNumero,
} from "./types"

interface IndicadoresJsonOperadora {
  operadora: string
  tipo?: "operadora" | "consolidado"
  indicadores: Record<string, Record<string, number | null>>
}

interface IndicadoresJsonAno {
  operadoras: IndicadoresJsonOperadora[]
}

interface IndicadoresJsonRoot {
  fonte?: string
  anos: Record<string, IndicadoresJsonAno>
}

let cache: IndicadoresJsonRoot | null = null

const CHAVES_PERCENTUAL_EXCEL: IndicadorKey[] = ["pct_cancelamento", "inadimplencia"]

function carregarJson(): IndicadoresJsonRoot {
  if (cache) return cache
  const path = join(process.cwd(), "data", "indicadores-consolidado.json")
  const raw = readFileSync(path, "utf-8")
  cache = JSON.parse(raw) as IndicadoresJsonRoot
  return cache
}

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

function montarLinhas(
  porMes: Record<MesNumero, Partial<Record<IndicadorKey, number | null>>>
): ConsolidadoLinha[] {
  return INDICADORES_DEFINICOES.map((def) => {
    const valores = {} as Record<MesNumero, number | null>

    for (const mes of MESES_NUMEROS) {
      const calculados = aplicarCalculosIndicadores(porMes[mes])
      const valor = calculados[def.key]
      valores[mes] = valor === undefined ? null : valor
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

function converterOperadora(item: IndicadoresJsonOperadora): ConsolidadoOperadora {
  const porMes = indicadoresParaPorMes(item.indicadores)
  return {
    operadora: item.operadora,
    tipo: item.tipo ?? (item.operadora.toUpperCase() === "CONSOLIDADO" ? "consolidado" : "operadora"),
    linhas: montarLinhas(porMes),
  }
}

export function buscarAnosDisponiveisEstaticos(): number[] {
  const data = carregarJson()
  return Object.keys(data.anos)
    .map(Number)
    .filter((a) => !Number.isNaN(a))
    .sort((a, b) => b - a)
}

export function buscarConsolidadoEstatico(ano: number): ConsolidadoResponse {
  const data = carregarJson()
  const anoData = data.anos[String(ano)]

  if (!anoData) {
    return { ano, operadoras: [], consolidadoGeral: null, mesesDisponiveis: [] }
  }

  const todos = anoData.operadoras.map(converterOperadora)

  const isBlocoConsolidado = (op: ConsolidadoOperadora) =>
    op.tipo === "consolidado" ||
    ["CONSOLIDADO", "QV TOTAL"].includes(op.operadora.toUpperCase())

  const consolidadoDoArquivo = todos.find(isBlocoConsolidado)

  const operadoras = todos.filter((op) => !isBlocoConsolidado(op))
    .sort((a, b) => {
      const prioA = prioridadeOperadora(a.operadora)
      const prioB = prioridadeOperadora(b.operadora)
      if (prioA !== prioB) return prioA - prioB
      return a.operadora.localeCompare(b.operadora, "pt-BR")
    })

  const consolidadoGeral =
    consolidadoDoArquivo ??
    (operadoras.length > 0 ? gerarConsolidadoGeral(operadoras) : null)

  const mesesDisponiveis = MESES_NUMEROS.filter((mes) =>
    [...operadoras, consolidadoGeral].filter(Boolean).some((op) =>
      op!.linhas.some((l) => l.valores[mes] !== null)
    )
  )

  return { ano, operadoras, consolidadoGeral, mesesDisponiveis }
}
