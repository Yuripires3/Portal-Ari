import type { IndicadorKey, MesNumero } from "./types"

/** Divisao segura, equivalente ao uso de SEERRO(...; 0) no Excel. */
export function dividirSeguro(numerador: number | null, denominador: number | null): number {
  if (numerador === null || denominador === null || denominador === 0) return 0
  if (Number.isNaN(numerador) || Number.isNaN(denominador)) return 0
  return numerador / denominador
}

function getValor(
  mapa: Partial<Record<IndicadorKey, number | null>>,
  key: IndicadorKey
): number | null {
  const valor = mapa[key]
  return valor === undefined ? null : valor
}

export function calcularBaseVidas(
  brutos: Partial<Record<IndicadorKey, number | null>>
): number | null {
  const baseVidas = getValor(brutos, "base_vidas")
  if (baseVidas !== null) return baseVidas

  const temBaseSaude = brutos.base_saude !== undefined && brutos.base_saude !== null
  const temBaseDental = brutos.base_dental !== undefined && brutos.base_dental !== null
  if (!temBaseSaude && !temBaseDental) return null

  return (getValor(brutos, "base_saude") ?? 0) + (getValor(brutos, "base_dental") ?? 0)
}

/**
 * Base Vidas = Base Saude + Base Dental
 * % cancelamento = Vidas canceladas / Base Vidas do mes anterior
 * Inadimplencia = 1 - Faturamento Recebido / Faturamento Emitido
 * Ticket medio = Faturamento Emitido / Base Vidas
 */
export function aplicarCalculosIndicadores(
  brutos: Partial<Record<IndicadorKey, number | null>>,
  baseVidasMesAnterior: number | null = null
): Partial<Record<IndicadorKey, number | null>> {
  const baseVidas = calcularBaseVidas(brutos)
  const vidasCanceladas = getValor(brutos, "vidas_canceladas")
  const fatEmitido = getValor(brutos, "faturamento_emitido")
  const fatRecebido = getValor(brutos, "faturamento_recebido")

  const pctCancelamento =
    baseVidasMesAnterior !== null &&
    baseVidasMesAnterior > 0 &&
    vidasCanceladas !== null
      ? dividirSeguro(vidasCanceladas, baseVidasMesAnterior) * 100
      : 0

  const inadimplencia =
    fatEmitido !== null && fatEmitido > 0 && fatRecebido !== null
      ? (1 - dividirSeguro(fatRecebido, fatEmitido)) * 100
      : 0

  const ticketMedio =
    baseVidas !== null && baseVidas > 0 && fatEmitido !== null
      ? dividirSeguro(fatEmitido, baseVidas)
      : baseVidas === 0
        ? 0
        : null

  return {
    ...brutos,
    base_vidas: baseVidas,
    pct_cancelamento: pctCancelamento,
    inadimplencia,
    ticket_medio: ticketMedio,
  }
}

export function criarMapaVazioMeses(): Record<
  MesNumero,
  Partial<Record<IndicadorKey, number | null>>
> {
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
