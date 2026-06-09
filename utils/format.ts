import type { IndicadorFormato } from "@/lib/indicadores/types"

/** Formata valor monetário em R$ sem centavos (como no Excel de indicadores). */
export function formatMoeda(valor: number | null | undefined): string {
  if (valor === null || valor === undefined || Number.isNaN(valor)) return "-"
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(valor)
}

/** Formata percentual com 2 casas decimais (ex.: 5,87%). */
export function formatPercentual(valor: number | null | undefined): string {
  if (valor === null || valor === undefined || Number.isNaN(valor)) return "-"
  return `${valor.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}%`
}

/** Formata contagem inteira (vidas, cancelamentos, vendas). */
export function formatNumero(valor: number | null | undefined): string {
  if (valor === null || valor === undefined || Number.isNaN(valor)) return "-"
  return new Intl.NumberFormat("pt-BR", {
    maximumFractionDigits: 0,
  }).format(Math.round(valor))
}

export function formatIndicadorValor(
  valor: number | null | undefined,
  formato: IndicadorFormato,
  opts?: { exibirVazioSeZero?: boolean }
): string {
  if (valor === null || valor === undefined || Number.isNaN(valor)) return "-"
  if (opts?.exibirVazioSeZero && valor === 0) return "-"

  switch (formato) {
    case "moeda":
      return formatMoeda(valor)
    case "percentual":
      return formatPercentual(valor)
    default:
      return formatNumero(valor)
  }
}

/**
 * Normaliza percentuais vindos do banco/Excel.
 * O Excel armazena fração (0,0586 = 5,86%); o portal exibe em pontos percentuais.
 */
export function normalizarPercentualArmazenado(valor: number | null): number | null {
  if (valor === null || Number.isNaN(valor)) return null
  if (Math.abs(valor) <= 1) return valor * 100
  return valor
}
