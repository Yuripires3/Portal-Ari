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
  mesesDisponiveis: MesNumero[]
}

export interface ConsolidadoFiltrosState {
  ano: number
  modoPersonalizado: boolean
  operadorasSelecionadas: string[]
  buscaOperadora: string
  mesAte: MesNumero
  exibirConsolidadoGeral: boolean
}

export interface ConsolidadoRawRow {
  operadora: string
  mes: MesNumero
  valores: Partial<Record<IndicadorKey, number | null>>
}
