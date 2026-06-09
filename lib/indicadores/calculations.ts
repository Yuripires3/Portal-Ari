import type { IndicadorKey, MesNumero } from "./types"

/** Divisão segura: retorna 0 quando denominador é 0 ou inválido (regra do Excel convertida). */
export function dividirSeguro(numerador: number | null, denominador: number | null): number {
  if (numerador === null || denominador === null || denominador === 0) return 0
  if (Number.isNaN(numerador) || Number.isNaN(denominador)) return 0
  return numerador / denominador
}

function getValor(mapa: Partial<Record<IndicadorKey, number | null>>, key: IndicadorKey): number | null {
  const v = mapa[key]
  return v === undefined ? null : v
}

/**
 * Aplica fórmulas do Excel sobre os indicadores brutos do mês.
 * Base Vidas = Base Saúde + Base Dental
 * % cancelamento = Vidas canceladas / Base Vidas
 * Inadimplência = 1 - Faturamento Recebido / Faturamento Emitido
 * Ticket médio = Faturamento Emitido / Base Vidas
 */
export function aplicarCalculosIndicadores(
  brutos: Partial<Record<IndicadorKey, number | null>>
): Partial<Record<IndicadorKey, number | null>> {
  const baseSaude = getValor(brutos, "base_saude") ?? 0
  const baseDental = getValor(brutos, "base_dental") ?? 0
  const baseVidas = baseSaude + baseDental

  const vidasCanceladas = getValor(brutos, "vidas_canceladas")
  const fatEmitido = getValor(brutos, "faturamento_emitido")
  const fatRecebido = getValor(brutos, "faturamento_recebido")

  const pctCancelamento =
    baseVidas > 0 && vidasCanceladas !== null
      ? dividirSeguro(vidasCanceladas, baseVidas) * 100
      : baseVidas === 0
        ? 0
        : null

  const inadimplencia =
    fatEmitido !== null && fatEmitido > 0 && fatRecebido !== null
      ? (1 - dividirSeguro(fatRecebido, fatEmitido)) * 100
      : fatEmitido === 0
        ? 0
        : null

  const ticketMedio =
    baseVidas > 0 && fatEmitido !== null
      ? dividirSeguro(fatEmitido, baseVidas)
      : baseVidas === 0
        ? 0
        : null

  return {
    ...brutos,
    base_vidas: baseVidas > 0 || brutos.base_saude !== undefined || brutos.base_dental !== undefined ? baseVidas : null,
    pct_cancelamento: pctCancelamento,
    inadimplencia,
    ticket_medio: ticketMedio,
  }
}

export function criarMapaVazioMeses(): Record<MesNumero, Partial<Record<IndicadorKey, number | null>>> {
  return {
    1: {},
    2: {},
    3: {},
    4: {},
    5: {},
    6: {},
    7: {},
    8: {},
    9: {},
    10: {},
    11: {},
    12: {},
  }
}
