/** Formata valor monetário em R$ (pt-BR). Valores nulos retornam "-". */
export function formatMoeda(valor: number | null | undefined): string {
  if (valor === null || valor === undefined || Number.isNaN(valor)) return "-"
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(valor)
}

/** Formata percentual com 2 casas decimais. Valores nulos retornam "-". */
export function formatPercentual(valor: number | null | undefined): string {
  if (valor === null || valor === undefined || Number.isNaN(valor)) return "-"
  return `${valor.toFixed(2)}%`
}

/** Formata número inteiro/decimal com separador pt-BR. Valores nulos retornam "-". */
export function formatNumero(valor: number | null | undefined): string {
  if (valor === null || valor === undefined || Number.isNaN(valor)) return "-"
  return new Intl.NumberFormat("pt-BR", {
    maximumFractionDigits: 2,
  }).format(valor)
}

export function formatIndicadorValor(
  valor: number | null | undefined,
  formato: "moeda" | "percentual" | "numero"
): string {
  switch (formato) {
    case "moeda":
      return formatMoeda(valor)
    case "percentual":
      return formatPercentual(valor)
    default:
      return formatNumero(valor)
  }
}
