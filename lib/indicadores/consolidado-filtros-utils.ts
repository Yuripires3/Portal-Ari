import { MESES_LABELS, MESES_NUMEROS } from "./constants"
import { resolverDisplayOperadora } from "./operadora-display"
import type { ConsolidadoFiltrosState, ConsolidadoOperadora, ConsolidadoResponse, MesNumero } from "./types"

export const STORAGE_KEY_FILTROS = "indicadores-consolidado-filtros"

export function criarFiltrosPadrao(ano?: number): ConsolidadoFiltrosState {
  const mesAtual = new Date().getMonth() + 1
  return {
    ano: ano ?? new Date().getFullYear(),
    modoPersonalizado: false,
    operadorasSelecionadas: [],
    buscaOperadora: "",
    mesAte: mesAtual as MesNumero,
    exibirConsolidadoGeral: true,
  }
}

export function rotuloAbaAno(ano: number): string {
  const sufixo = String(ano).slice(-2)
  return `Relatório Indicadores ${sufixo}`
}

export function filtrarOperadoras(
  dados: ConsolidadoResponse,
  filtros: ConsolidadoFiltrosState
): ConsolidadoOperadora[] {
  const busca = filtros.buscaOperadora.trim().toLowerCase()
  let lista = dados.operadoras

  if (filtros.modoPersonalizado) {
    const set = new Set(filtros.operadorasSelecionadas)
    lista = lista.filter((op) => set.has(op.operadora))
  }

  if (busca) {
    lista = lista.filter((op) => {
      const display = resolverDisplayOperadora(op.operadora)
      return (
        op.operadora.toLowerCase().includes(busca) ||
        display.nomeExibicao.toLowerCase().includes(busca)
      )
    })
  }

  return lista
}

export function mesesVisiveisPorFiltro(mesAte: MesNumero): MesNumero[] {
  return MESES_NUMEROS.filter((m) => m <= mesAte)
}

export function listarNomesOperadoras(dados: ConsolidadoResponse): string[] {
  return dados.operadoras.map((op) => op.operadora)
}

export function resumoFiltros(
  total: number,
  exibindo: number,
  mesAte: MesNumero
): string {
  const mesLabel = MESES_LABELS[mesAte]
  if (exibindo === total) {
    return `Exibindo ${total} operadora${total !== 1 ? "s" : ""} · Jan a ${mesLabel}`
  }
  return `Exibindo ${exibindo} de ${total} operadoras · Jan a ${mesLabel}`
}
