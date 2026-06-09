import { definicoesParaBloco } from "./constants"

/** Amostras que cobrem os layouts distintos de cada ano no Excel. */
const AMOSTRAS_LAYOUT_ANO: Record<
  number,
  Array<{ operadora: string; tipo?: "operadora" | "consolidado" }>
> = {
  2021: [
    { operadora: "Unimed Rio" },
    { operadora: "Hapvida NotreDame" },
    { operadora: "Integral Saude" },
    { operadora: "CONSOLIDADO", tipo: "consolidado" },
  ],
  2022: [
    { operadora: "Unimed Rio" },
    { operadora: "HealthMed" },
    { operadora: "Amil" },
    { operadora: "CONSOLIDADO", tipo: "consolidado" },
  ],
  2023: [
    { operadora: "Unimed Rio" },
    { operadora: "Integral Saude" },
    { operadora: "CONSOLIDADO", tipo: "consolidado" },
  ],
  2024: [
    { operadora: "Unimed Rio" },
    { operadora: "Integral Saude" },
    { operadora: "CONSOLIDADO", tipo: "consolidado" },
  ],
  2025: [
    { operadora: "Unimed Rio" },
    { operadora: "Integral Saude" },
    { operadora: "CONSOLIDADO", tipo: "consolidado" },
  ],
  2026: [
    { operadora: "Unimed Rio" },
    { operadora: "Integral Saude" },
    { operadora: "CONSOLIDADO", tipo: "consolidado" },
  ],
}

/**
 * Largura da coluna Indicador (rubrica) — ajuste aqui se ainda quebrar linha.
 * A função `larguraColunaIndicadorPorAno` usa o maior rótulo de cada aba (ano).
 */
const PX_POR_CARACTERE = 7.1
const PADDING_COLUNA_INDICADOR = 36

function maiorRotuloAno(ano: number): string {
  const amostras = AMOSTRAS_LAYOUT_ANO[ano] ?? AMOSTRAS_LAYOUT_ANO[2026]
  let maior = "Indicador"

  for (const { operadora, tipo } of amostras) {
    for (const def of definicoesParaBloco(operadora, tipo ?? "operadora", ano)) {
      if (def.label.length > maior.length) maior = def.label
    }
  }

  return maior
}

/** Largura da coluna Indicador alinhada ao maior rótulo do layout da aba (ano). */
export function larguraColunaIndicadorPorAno(ano: number): number {
  const rotulo = maiorRotuloAno(ano)
  return Math.ceil(rotulo.length * PX_POR_CARACTERE) + PADDING_COLUNA_INDICADOR
}

export const LARGURA_COLUNA_MES = 150

export function larguraTabelaConsolidado(ano: number, qtdMeses: number): number {
  return larguraColunaIndicadorPorAno(ano) + qtdMeses * LARGURA_COLUNA_MES
}
