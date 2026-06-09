import { MESES_NUMEROS } from "./constants"
import type { ConsolidadoFiltrosState, MesNumero } from "./types"

export const STORAGE_KEY_FILTROS = "indicadores-consolidado-filtros"

export function criarFiltrosPadrao(ano?: number): ConsolidadoFiltrosState {
  const mesAtual = new Date().getMonth() + 1
  return {
    ano: ano ?? new Date().getFullYear(),
    mesAte: mesAtual as MesNumero,
  }
}

export function rotuloAbaAno(ano: number): string {
  const sufixo = String(ano).slice(-2)
  return `Relatório Indicadores ${sufixo}`
}

export function getAnoAtual(): number {
  return new Date().getFullYear()
}

/** Anos anteriores ao corrente são considerados fechados (sempre 12 meses). */
export function isAnoFechado(ano: number): boolean {
  return ano < getAnoAtual()
}

export function permiteFiltroMesAte(ano: number): boolean {
  return ano === getAnoAtual()
}

export function mesesVisiveisPorFiltro(ano: number, mesAte: MesNumero): MesNumero[] {
  if (isAnoFechado(ano)) return [...MESES_NUMEROS]
  return MESES_NUMEROS.filter((m) => m <= mesAte)
}
