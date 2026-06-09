import { INDICADORES_CONSOLIDADO, MESES_NUMEROS } from "./constants"
import {
  aplicarCalculosIndicadores,
  calcularBaseVidas,
  criarMapaVazioMeses,
} from "./calculations"
import type { ConsolidadoLinha, ConsolidadoOperadora, IndicadorKey, MesNumero } from "./types"

/** Indicadores somáveis no bloco CONSOLIDADO QV (equivalente à última seção do Excel). */
const CHAVES_SOMA: IndicadorKey[] = [
  "meta_orcada",
  "base_dental",
  "base_saude",
  "vidas_canceladas",
  "migracao_assim_assim",
  "migracao_assim_outras",
  "migracao_caberj_assim",
  "migracao_caberj_outras",
  "total_migracao",
  "cancelamento_liquido",
  "retencao",
  "cancel_inadimplencia",
  "cancel_solicitacao_cliente",
  "cancel_solicitado_ops",
  "exclusao_dependente",
  "falecimento",
  "outros",
  "faturamento_orcado",
  "faturamento_emitido",
  "faturamento_recebido",
  "vendas",
  "comissao_concessionarias",
  "bonificacao_corretores_supervisores",
]

function somarValor(atual: number | null | undefined, novo: number | null): number | null {
  if (novo === null) return atual ?? null
  if (atual === null || atual === undefined) return novo
  return atual + novo
}

function montarLinhasAgregadas(
  porMes: Record<MesNumero, Partial<Record<IndicadorKey, number | null>>>
): ConsolidadoLinha[] {
  return INDICADORES_CONSOLIDADO.map((def) => {
    const valores = {} as Record<MesNumero, number | null>
    for (const mes of MESES_NUMEROS) {
      const brutos = porMes[mes]
      const baseVidasMesAnterior =
        mes === 1 ? null : calcularBaseVidas(porMes[(mes - 1) as MesNumero])
      const calculados = aplicarCalculosIndicadores(brutos, baseVidasMesAnterior)
      const valor = def.calculado
        ? (calculados[def.key] ?? null)
        : brutos[def.key] !== undefined && brutos[def.key] !== null
          ? brutos[def.key]!
          : (calculados[def.key] ?? null)
      valores[mes] = valor
    }
    return {
      key: def.key,
      label: def.label,
      formato: def.formato,
      exibirVazioSeZero: def.exibirVazioSeZero,
      valores,
    }
  })
}

/** Agrega todas as operadoras no bloco CONSOLIDADO (soma mensal + recálculo das fórmulas). */
export function gerarConsolidadoGeral(operadoras: ConsolidadoOperadora[]): ConsolidadoOperadora {
  const porMes = criarMapaVazioMeses()

  for (const op of operadoras) {
    for (const linha of op.linhas) {
      if (!CHAVES_SOMA.includes(linha.key)) continue
      for (const mes of MESES_NUMEROS) {
        const valor = linha.valores[mes]
        if (valor === null) continue
        const celula = porMes[mes]
        celula[linha.key] = somarValor(celula[linha.key], valor)
      }
    }
  }

  return {
    operadora: "CONSOLIDADO",
    tipo: "consolidado",
    linhas: montarLinhasAgregadas(porMes),
  }
}
