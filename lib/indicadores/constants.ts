import type { IndicadorDefinicao, MesNumero } from "./types"

/** Ordem padrão das operadoras (prints Excel 2021+). */
export const INDICADORES_OPERADORA: IndicadorDefinicao[] = [
  { key: "base_vidas", label: "Base Vidas", formato: "numero", calculado: true },
  { key: "base_dental", label: "Base Dental", formato: "numero" },
  { key: "base_saude", label: "Base Saúde", formato: "numero" },
  { key: "vidas_canceladas", label: "Vidas canceladas", formato: "numero" },
  { key: "retencao", label: "Retenção", formato: "numero" },
  { key: "pct_cancelamento", label: "% cancelamento", formato: "percentual", calculado: true },
  { key: "cancel_inadimplencia", label: "Cancel. por Inadimplência", formato: "numero" },
  { key: "cancel_solicitacao_cliente", label: "Cancel. solicitação cliente", formato: "numero" },
  { key: "cancel_solicitado_ops", label: "Cancel. Solicitado OPS", formato: "numero" },
  {
    key: "exclusao_dependente",
    label: "Exclusão de dependente (A partir de Maio)",
    formato: "numero",
  },
  { key: "falecimento", label: "Falecimento (A partir de Maio)", formato: "numero" },
  { key: "outros", label: "Outros (A partir de Maio)", formato: "numero" },
  { key: "faturamento_emitido", label: "Faturamento Emitido", formato: "moeda" },
  { key: "faturamento_recebido", label: "Faturamento Recebido", formato: "moeda" },
  { key: "inadimplencia", label: "Inadimplência", formato: "percentual", calculado: true },
  { key: "vendas", label: "Vendas", formato: "numero" },
  { key: "ticket_medio", label: "Ticket médio", formato: "moeda", calculado: true },
  { key: "comissao_concessionarias", label: "Comissão Concessionárias", formato: "moeda" },
  {
    key: "bonificacao_corretores_supervisores",
    label: "Bonificação Corretores/supervisores",
    formato: "moeda",
  },
]

/**
 * Operadoras 2022 com sub-tabela no Excel (HealthMed, NotreDame, Amil, Infinity):
 * sem exclusão de dependente; Falecimento/Outros com rótulo simples.
 */
export const INDICADORES_OPERADORA_2022_COMPACTO: IndicadorDefinicao[] = [
  { key: "base_vidas", label: "Base Vidas", formato: "numero", calculado: true },
  { key: "base_dental", label: "Base Dental", formato: "numero" },
  { key: "base_saude", label: "Base Saúde", formato: "numero" },
  { key: "vidas_canceladas", label: "Vidas canceladas", formato: "numero" },
  { key: "retencao", label: "Retenção", formato: "numero" },
  { key: "pct_cancelamento", label: "% cancelamento", formato: "percentual", calculado: true },
  { key: "cancel_inadimplencia", label: "Cancel. por Inadimplência", formato: "numero" },
  { key: "cancel_solicitacao_cliente", label: "Cancel. solicitação cliente", formato: "numero" },
  { key: "cancel_solicitado_ops", label: "Cancel. Solicitado OPS", formato: "numero" },
  { key: "falecimento", label: "Falecimento", formato: "numero" },
  { key: "outros", label: "Outros", formato: "numero" },
  { key: "faturamento_emitido", label: "Faturamento Emitido", formato: "moeda" },
  { key: "faturamento_recebido", label: "Faturamento Recebido", formato: "moeda" },
  { key: "inadimplencia", label: "Inadimplência", formato: "percentual", calculado: true },
  { key: "vendas", label: "Vendas", formato: "numero" },
  { key: "ticket_medio", label: "Ticket médio", formato: "moeda", calculado: true },
  { key: "comissao_concessionarias", label: "Comissão Concessionárias", formato: "moeda" },
  {
    key: "bonificacao_corretores_supervisores",
    label: "Bonificação Corretores/supervisores",
    formato: "moeda",
  },
]

/** NotreDame / Hapvida em 2021 — sem Base Dental/Saúde; primeira linha é "Base". */
export const INDICADORES_NOTREDAME: IndicadorDefinicao[] = [
  { key: "base_vidas", label: "Base", formato: "numero" },
  { key: "vidas_canceladas", label: "Vidas canceladas", formato: "numero" },
  { key: "pct_cancelamento", label: "% cancelamento", formato: "percentual", calculado: true },
  { key: "cancel_inadimplencia", label: "Cancel. por Inadimplência", formato: "numero" },
  { key: "cancel_solicitacao_cliente", label: "Cancel. solicitação cliente", formato: "numero" },
  { key: "cancel_solicitado_ops", label: "Cancel. Solicitado OPS", formato: "numero" },
  {
    key: "exclusao_dependente",
    label: "Exclusão de dependente (A partir de Maio)",
    formato: "numero",
  },
  { key: "falecimento", label: "Falecimento (A partir de Maio)", formato: "numero" },
  { key: "outros", label: "Outros (A partir de Maio)", formato: "numero" },
  { key: "faturamento_emitido", label: "Faturamento Emitido", formato: "moeda" },
  { key: "faturamento_recebido", label: "Faturamento Recebido", formato: "moeda" },
  { key: "inadimplencia", label: "Inadimplência", formato: "percentual", calculado: true },
  { key: "vendas", label: "Vendas", formato: "numero" },
  { key: "ticket_medio", label: "Ticket médio", formato: "moeda", calculado: true },
  { key: "comissao_concessionarias", label: "Comissão Concessionárias", formato: "moeda" },
  {
    key: "bonificacao_corretores_supervisores",
    label: "Bonificação Corretores/supervisores",
    formato: "moeda",
  },
]

/** Bloco CONSOLIDADO QV — ordem do Excel. */
export const INDICADORES_CONSOLIDADO: IndicadorDefinicao[] = [
  { key: "meta_orcada", label: "Meta orçada", formato: "moeda", exibirVazioSeZero: true },
  { key: "base_vidas", label: "Base Vidas", formato: "numero", calculado: true },
  { key: "base_dental", label: "Base Dental", formato: "numero" },
  { key: "base_saude", label: "Base Saúde", formato: "numero" },
  { key: "vidas_canceladas", label: "Vidas canceladas", formato: "numero" },
  {
    key: "migracao_assim_assim",
    label: "Migração ASSIM > ASSIM (A partir de Agosto)",
    formato: "numero",
  },
  {
    key: "migracao_assim_outras",
    label: "Migração ASSIM > OUTRAS OPERADORAS (A partir de Agosto)",
    formato: "numero",
  },
  {
    key: "migracao_caberj_assim",
    label: "Migração CABERJ > ASSIM (A partir de Agosto)",
    formato: "numero",
  },
  {
    key: "migracao_caberj_outras",
    label: "Migração CABERJ > OUTRAS OPERADORAS (A partir de Agosto)",
    formato: "numero",
  },
  { key: "total_migracao", label: "Total Migração", formato: "numero" },
  { key: "cancelamento_liquido", label: "Cancelamento Líquido", formato: "numero" },
  { key: "retencao", label: "Retenção", formato: "numero" },
  { key: "pct_cancelamento", label: "% cancelamento", formato: "percentual", calculado: true },
  { key: "cancel_inadimplencia", label: "Cancel. por inadimplência", formato: "numero" },
  { key: "cancel_solicitacao_cliente", label: "Cancel. solicitação cliente", formato: "numero" },
  { key: "cancel_solicitado_ops", label: "Cancel. Solicitado OPS", formato: "numero" },
  {
    key: "exclusao_dependente",
    label: "Exclusão de dependente (A partir de Maio)",
    formato: "numero",
  },
  { key: "falecimento", label: "Falecimento (A partir de Maio)", formato: "numero" },
  { key: "outros", label: "Outros (A partir de Maio)", formato: "numero" },
  { key: "faturamento_orcado", label: "Faturamento Orçado", formato: "moeda" },
  { key: "faturamento_emitido", label: "Faturamento Emitido", formato: "moeda" },
  { key: "faturamento_recebido", label: "Faturamento Recebido", formato: "moeda" },
  { key: "inadimplencia", label: "Inadimplência", formato: "percentual", calculado: true },
  { key: "vendas", label: "Vendas", formato: "numero" },
  { key: "ticket_medio", label: "Ticket médio", formato: "moeda", calculado: true },
  { key: "comissao_concessionarias", label: "Comissão Concessionárias", formato: "moeda" },
  {
    key: "bonificacao_corretores_supervisores",
    label: "Bonificação Corretores/supervisores",
    formato: "moeda",
  },
]

/** Layout padrão 2023 — Meta orçada + Óbito + Inadimplência do fechamento. */
export const INDICADORES_OPERADORA_2023_COM_META: IndicadorDefinicao[] = [
  { key: "meta_orcada", label: "Meta orçada", formato: "numero", exibirVazioSeZero: true },
  { key: "base_vidas", label: "Base Vidas", formato: "numero", calculado: true },
  { key: "base_dental", label: "Base Dental", formato: "numero" },
  { key: "base_saude", label: "Base Saúde", formato: "numero" },
  { key: "vidas_canceladas", label: "Vidas canceladas", formato: "numero" },
  { key: "retencao", label: "Retenção", formato: "numero" },
  { key: "pct_cancelamento", label: "% cancelamento", formato: "percentual", calculado: true },
  { key: "cancel_inadimplencia", label: "Cancel. por Inadimplência", formato: "numero" },
  { key: "cancel_solicitacao_cliente", label: "Cancel. solicitação cliente", formato: "numero" },
  { key: "cancel_solicitado_ops", label: "Cancel. Solicitado OPS", formato: "numero" },
  { key: "falecimento", label: "Óbito", formato: "numero" },
  { key: "outros", label: "Outros", formato: "numero" },
  { key: "faturamento_emitido", label: "Faturamento Emitido", formato: "moeda" },
  { key: "faturamento_recebido", label: "Faturamento Recebido", formato: "moeda" },
  {
    key: "inadimplencia",
    label: "Inadimplência do fechamento do mês",
    formato: "percentual",
    calculado: true,
  },
  { key: "vendas", label: "Vendas", formato: "numero" },
  { key: "ticket_medio", label: "Ticket médio", formato: "moeda", calculado: true },
  { key: "comissao_concessionarias", label: "Comissão Concessionárias", formato: "moeda" },
  {
    key: "bonificacao_corretores_supervisores",
    label: "Bonificação Corretores/supervisores",
    formato: "moeda",
  },
]

/** Integral 2023 — sem linha Meta orçada. */
export const INDICADORES_OPERADORA_2023_INTEGRAL: IndicadorDefinicao[] =
  INDICADORES_OPERADORA_2023_COM_META.filter((d) => d.key !== "meta_orcada")

/** CONSOLIDADO QV em 2022 — sem migrações nem exclusão de dependente. */
export const INDICADORES_CONSOLIDADO_2022: IndicadorDefinicao[] = [
  { key: "meta_orcada", label: "Meta orçada", formato: "moeda", exibirVazioSeZero: true },
  { key: "base_vidas", label: "Base Vidas", formato: "numero", calculado: true },
  { key: "base_dental", label: "Base Dental", formato: "numero" },
  { key: "base_saude", label: "Base Saúde", formato: "numero" },
  { key: "vidas_canceladas", label: "Vidas canceladas", formato: "numero" },
  { key: "retencao", label: "Retenção", formato: "numero" },
  { key: "pct_cancelamento", label: "% cancelamento", formato: "percentual", calculado: true },
  { key: "cancel_inadimplencia", label: "Cancel. por inadimplência", formato: "numero" },
  { key: "cancel_solicitacao_cliente", label: "Cancel. solicitação cliente", formato: "numero" },
  { key: "cancel_solicitado_ops", label: "Cancel. Solicitado OPS", formato: "numero" },
  { key: "falecimento", label: "Falecimento", formato: "numero" },
  { key: "outros", label: "Outros", formato: "numero" },
  { key: "faturamento_orcado", label: "Faturamento Orçado", formato: "moeda" },
  { key: "faturamento_emitido", label: "Faturamento Emitido", formato: "moeda" },
  { key: "faturamento_recebido", label: "Faturamento Recebido", formato: "moeda" },
  { key: "inadimplencia", label: "Inadimplência", formato: "percentual", calculado: true },
  { key: "vendas", label: "Vendas", formato: "numero" },
  { key: "ticket_medio", label: "Ticket médio", formato: "moeda", calculado: true },
  { key: "comissao_concessionarias", label: "Comissão Concessionárias", formato: "moeda" },
  {
    key: "bonificacao_corretores_supervisores",
    label: "Bonificação Corretores/supervisores",
    formato: "moeda",
  },
]

/** CONSOLIDADO QV em 2023 — mesmo layout das operadoras (sem migrações). */
export const INDICADORES_CONSOLIDADO_2023: IndicadorDefinicao[] =
  INDICADORES_OPERADORA_2023_COM_META

const OPERADORAS_2022_COMPACTO = /healthmed|hapvida|notredame|amil|infinity/i

/** @deprecated Use definicoesParaBloco — mantido para agregação legada. */
export const INDICADORES_DEFINICOES = INDICADORES_OPERADORA

export function definicoesParaBloco(
  operadora: string,
  tipo?: "operadora" | "consolidado",
  ano?: number
): IndicadorDefinicao[] {
  if (tipo === "consolidado") {
    if (ano === 2022) return INDICADORES_CONSOLIDADO_2022
    if (ano === 2023 || ano === 2024 || ano === 2025 || ano === 2026)
      return INDICADORES_CONSOLIDADO_2023
    return INDICADORES_CONSOLIDADO
  }
  if (ano === 2023 || ano === 2024 || ano === 2025 || ano === 2026) {
    if (/integral/i.test(operadora)) return INDICADORES_OPERADORA_2023_INTEGRAL
    return INDICADORES_OPERADORA_2023_COM_META
  }
  if (ano === 2022 && OPERADORAS_2022_COMPACTO.test(operadora)) {
    return INDICADORES_OPERADORA_2022_COMPACTO
  }
  if (/hapvida|notredame/i.test(operadora) && ano === 2021) return INDICADORES_NOTREDAME
  return INDICADORES_OPERADORA
}

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
