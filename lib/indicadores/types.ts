export type MesNumero = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12

export type IndicadorFormato = "moeda" | "percentual" | "numero"

export type IndicadorKey =
  | "meta_orcada"
  | "base_vidas"
  | "base_dental"
  | "base_saude"
  | "vidas_canceladas"
  | "migracao_assim_assim"
  | "migracao_assim_outras"
  | "migracao_caberj_assim"
  | "migracao_caberj_outras"
  | "total_migracao"
  | "cancelamento_liquido"
  | "retencao"
  | "pct_cancelamento"
  | "cancel_inadimplencia"
  | "cancel_solicitacao_cliente"
  | "cancel_solicitado_ops"
  | "exclusao_dependente"
  | "falecimento"
  | "outros"
  | "faturamento_orcado"
  | "faturamento_emitido"
  | "faturamento_recebido"
  | "inadimplencia"
  | "vendas"
  | "ticket_medio"
  | "comissao_concessionarias"
  | "bonificacao_corretores_supervisores"

export interface IndicadorDefinicao {
  key: IndicadorKey
  label: string
  formato: IndicadorFormato
  /** Indicador derivado por regra de negócio (equivalente às fórmulas do Excel). */
  calculado?: boolean
  /** Excel exibe "-" quando o valor é zero (ex.: Meta orçada). */
  exibirVazioSeZero?: boolean
}

export interface ConsolidadoLinha {
  key: IndicadorKey
  label: string
  formato: IndicadorFormato
  exibirVazioSeZero?: boolean
  valores: Record<MesNumero, number | null>
}

export interface ConsolidadoOperadora {
  operadora: string
  linhas: ConsolidadoLinha[]
  /** Bloco agregado QV (última seção do Excel). */
  tipo?: "operadora" | "consolidado"
}

export interface ConsolidadoResponse {
  ano: number
  operadoras: ConsolidadoOperadora[]
  consolidadoGeral: ConsolidadoOperadora | null
  /** Ex.: Infinity em 2023 — exibida após o bloco CONSOLIDADO. */
  operadorasAposConsolidado?: ConsolidadoOperadora[]
  mesesDisponiveis: MesNumero[]
}

export interface ConsolidadoFiltrosState {
  ano: number
  mesAte: MesNumero
}

export interface ConsolidadoRawRow {
  operadora: string
  mes: MesNumero
  valores: Partial<Record<IndicadorKey, number | null>>
}
