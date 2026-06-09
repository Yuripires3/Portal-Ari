import type { IndicadorDefinicao, MesNumero } from "./types"

/** Ordem e rótulos espelhando as linhas do Excel "Relatório Indicadores". */
export const INDICADORES_DEFINICOES: IndicadorDefinicao[] = [
  { key: "meta_orcada", label: "Meta orçada", formato: "moeda", exibirVazioSeZero: true },
  { key: "base_vidas", label: "Base Vidas", formato: "numero", calculado: true },
  { key: "base_dental", label: "Base Dental", formato: "numero" },
  { key: "base_saude", label: "Base Saúde", formato: "numero" },
  { key: "vidas_canceladas", label: "Vidas canceladas", formato: "numero" },
  { key: "retencao", label: "Retenção", formato: "numero" },
  { key: "pct_cancelamento", label: "% cancelamento", formato: "percentual", calculado: true },
  { key: "cancel_inadimplencia", label: "Cancel. por Inadimplência", formato: "numero" },
  { key: "cancel_solicitacao_cliente", label: "Cancel. solicitação cliente", formato: "numero" },
  { key: "cancel_solicitado_ops", label: "Cancel. Solicitado OPS", formato: "numero" },
  { key: "obito", label: "Óbito", formato: "numero" },
  { key: "outros", label: "Outros", formato: "numero" },
  { key: "faturamento_emitido", label: "Faturamento Emitido", formato: "moeda" },
  { key: "faturamento_recebido", label: "Faturamento Recebido", formato: "moeda" },
  { key: "inadimplencia", label: "Inadimplência do fechamento do mês", formato: "percentual", calculado: true },
  { key: "vendas", label: "Vendas", formato: "numero" },
  { key: "ticket_medio", label: "Ticket médio", formato: "moeda", calculado: true },
  { key: "comissao_concessionarias", label: "Comissão Concessionárias", formato: "moeda" },
  { key: "bonificacao_corretores_supervisores", label: "Bonificação Corretores/supervisores", formato: "moeda" },
]

export const MESES_LABELS: Record<MesNumero, string> = {
  1: "Jan",
  2: "Fev",
  3: "Mar",
  4: "Abr",
  5: "Mai",
  6: "Jun",
  7: "Jul",
  8: "Ago",
  9: "Set",
  10: "Out",
  11: "Nov",
  12: "Dez",
}

export const MESES_NUMEROS: MesNumero[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]

export const TABELAS_INDICADORES = {
  ativos: "registro_indicadores_df_ativos",
  inativos: "registro_indicadores_df_inativos",
  atendimentos: "registro_indicadores_df_atendimentos",
} as const
