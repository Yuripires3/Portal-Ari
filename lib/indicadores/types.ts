export type MesNumero = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12

export type IndicadorFormato = "moeda" | "percentual" | "numero"

export type IndicadorKey =
  | "meta_orcada"
  | "base_vidas"
  | "base_dental"
  | "base_saude"
  | "vidas_canceladas"
  | "retencao"
  | "pct_cancelamento"
  | "cancel_inadimplencia"
  | "cancel_solicitacao_cliente"
  | "cancel_solicitado_ops"
  | "obito"
  | "outros"
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
}

export interface ConsolidadoLinha {
  key: IndicadorKey
  label: string
  formato: IndicadorFormato
  valores: Record<MesNumero, number | null>
}

export interface ConsolidadoOperadora {
  operadora: string
  linhas: ConsolidadoLinha[]
}

export interface ConsolidadoResponse {
  ano: number
  operadoras: ConsolidadoOperadora[]
  mesesDisponiveis: MesNumero[]
}

export interface ConsolidadoRawRow {
  operadora: string
  mes: MesNumero
  valores: Partial<Record<IndicadorKey, number | null>>
}
