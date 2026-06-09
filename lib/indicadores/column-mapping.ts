import type { IndicadorKey } from "./types"

/** Normaliza nome de coluna do banco para comparação com aliases. */
export function normalizarNomeColuna(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
}

/**
 * Mapeamento flexível coluna → indicador.
 * Evita ranges fixos do VBA: descobre colunas dinamicamente pelo nome.
 */
export const ALIASES_POR_INDICADOR: Record<IndicadorKey, string[]> = {
  meta_orcada: ["meta_orcada", "meta"],
  base_vidas: ["base_vidas", "basevidas"],
  base_dental: ["base_dental", "basedental"],
  base_saude: ["base_saude", "basesaude"],
  vidas_canceladas: ["vidas_canceladas", "vidascanceladas", "canceladas"],
  retencao: ["retencao"],
  pct_cancelamento: ["pct_cancelamento", "percentual_cancelamento", "perc_cancelamento"],
  cancel_inadimplencia: ["cancel_inadimplencia", "cancelamento_inadimplencia", "cancel_por_inadimplencia"],
  cancel_solicitacao_cliente: ["cancel_solicitacao_cliente", "cancelamento_solicitacao_cliente"],
  cancel_solicitado_ops: ["cancel_solicitado_ops", "cancelamento_solicitado_ops"],
  obito: ["obito"],
  outros: ["outros"],
  faturamento_emitido: ["faturamento_emitido", "fat_emitido", "valor_faturamento_emitido"],
  faturamento_recebido: ["faturamento_recebido", "fat_recebido", "valor_faturamento_recebido"],
  inadimplencia: ["inadimplencia", "inadimplencia_fechamento"],
  vendas: ["vendas"],
  ticket_medio: ["ticket_medio", "ticketmedio"],
  comissao_concessionarias: ["comissao_concessionarias", "comissao_concessionaria"],
  bonificacao_corretores_supervisores: [
    "bonificacao_corretores_supervisores",
    "bonificacao_corretores",
    "bonificacao",
  ],
}

const ALIASES_OPERADORA = ["operadora", "nome_operadora", "oper"]
const ALIASES_MES = ["mes", "mes_referencia", "mes_ref", "nr_mes", "numero_mes"]
const ALIASES_ANO = ["ano", "ano_referencia", "ano_ref", "nr_ano"]
const ALIASES_DATA_REF = ["data_referencia", "dt_referencia", "referencia", "competencia", "mes_ano"]

export interface ColunasMapeadas {
  operadora: string | null
  mes: string | null
  ano: string | null
  dataReferencia: string | null
  indicadores: Partial<Record<IndicadorKey, string>>
}

function encontrarColuna(colunas: string[], aliases: string[]): string | null {
  const normalizadas = colunas.map((c) => ({ original: c, norm: normalizarNomeColuna(c) }))
  for (const alias of aliases) {
    const found = normalizadas.find((c) => c.norm === alias)
    if (found) return found.original
  }
  return null
}

export function mapearColunasTabela(colunas: string[]): ColunasMapeadas {
  const indicadores: Partial<Record<IndicadorKey, string>> = {}

  for (const [key, aliases] of Object.entries(ALIASES_POR_INDICADOR) as [IndicadorKey, string[]][]) {
    const col = encontrarColuna(colunas, aliases)
    if (col) indicadores[key] = col
  }

  return {
    operadora: encontrarColuna(colunas, ALIASES_OPERADORA),
    mes: encontrarColuna(colunas, ALIASES_MES),
    ano: encontrarColuna(colunas, ALIASES_ANO),
    dataReferencia: encontrarColuna(colunas, ALIASES_DATA_REF),
    indicadores,
  }
}

export function extrairMesAno(
  row: Record<string, unknown>,
  mapa: ColunasMapeadas,
  anoFiltro: number
): { mes: number; ano: number } | null {
  if (mapa.mes) {
    const mesRaw = row[mapa.mes]
    const anoRaw = mapa.ano ? row[mapa.ano] : anoFiltro
    const mes = Number(mesRaw)
    const ano = Number(anoRaw ?? anoFiltro)
    if (mes >= 1 && mes <= 12) return { mes, ano }
  }

  if (mapa.dataReferencia) {
    const raw = row[mapa.dataReferencia]
    if (raw instanceof Date) {
      return { mes: raw.getMonth() + 1, ano: raw.getFullYear() }
    }
    if (typeof raw === "string" || typeof raw === "number") {
      const str = String(raw)
      const iso = str.match(/^(\d{4})-(\d{2})/)
      if (iso) return { mes: Number(iso[2]), ano: Number(iso[1]) }
      const br = str.match(/^(\d{2})\/(\d{4})/)
      if (br) return { mes: Number(br[1]), ano: Number(br[2]) }
    }
  }

  if (mapa.ano) {
    const ano = Number(row[mapa.ano])
    if (ano === anoFiltro) return { mes: 1, ano }
  }

  return null
}

export function parseNumero(valor: unknown): number | null {
  if (valor === null || valor === undefined || valor === "") return null
  if (typeof valor === "number") return Number.isNaN(valor) ? null : valor
  const str = String(valor).replace(/[R$\s%]/g, "").trim()
  if (!str) return null
  const normalizado = str.includes(",") ? str.replace(/\./g, "").replace(",", ".") : str
  const n = Number(normalizado)
  return Number.isNaN(n) ? null : n
}
