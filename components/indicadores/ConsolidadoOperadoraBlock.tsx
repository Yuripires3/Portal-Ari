"use client"

import { MESES_LABELS } from "@/lib/indicadores/constants"
import {
  LARGURA_COLUNA_MES,
  larguraColunaIndicadorPorAno,
  larguraTabelaConsolidado,
} from "@/lib/indicadores/consolidado-layout"
import { resolverDisplayOperadora } from "@/lib/indicadores/operadora-display"
import type { ConsolidadoOperadora, MesNumero } from "@/lib/indicadores/types"
import { formatIndicadorValor } from "@/utils/format"
import { cn } from "@/lib/utils"

const SUB_LINHAS_BASE_VIDAS = new Set(["base_dental", "base_saude"])

const LARGURA_PAINEL_LOGO = "w-full lg:w-[130px]"
const BORDA_SEPARADOR_RUBRICAS = "border-r border-[#c5d0de]"

interface ConsolidadoOperadoraBlockProps {
  operadora: ConsolidadoOperadora
  mesesVisiveis: MesNumero[]
  ano: number
}

function PainelLogoOperadora({
  operadora,
  isConsolidado,
  ano,
}: {
  operadora: string
  isConsolidado: boolean
  ano: number
}) {
  const display = resolverDisplayOperadora(operadora, ano)
  const logoPadrao = isConsolidado
    ? "max-h-28 max-w-[88px] lg:max-h-64 lg:max-w-[100px]"
    : "max-h-16 max-w-[88px] lg:max-h-48 lg:max-w-[100px]"

  return (
    <div
      className={cn(
        "bg-sidebar flex shrink-0 items-center justify-center border-b border-sidebar-border px-3 py-5",
        "lg:border-b-0 lg:border-r lg:border-[#c5d0de]",
        LARGURA_PAINEL_LOGO,
      )}
    >
      {display.logoSrc ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={display.logoSrc}
          alt={display.nomeExibicao}
          className={cn(
            "h-auto w-auto shrink-0 object-contain",
            display.logoClassName ?? logoPadrao,
          )}
          loading="lazy"
          decoding="async"
        />
      ) : (
        <div className="flex flex-col items-center gap-2">
          <div
            className="flex h-12 w-12 items-center justify-center rounded-full text-sm font-bold text-white shadow-sm"
            style={{ backgroundColor: display.corMarca }}
          >
            {display.iniciais}
          </div>
          <p
            className="max-w-[90px] text-center text-[11px] font-bold leading-tight"
            style={{ color: display.corMarca }}
          >
            {display.nomeExibicao}
          </p>
        </div>
      )}
    </div>
  )
}

export function ConsolidadoOperadoraBlock({
  operadora,
  mesesVisiveis,
  ano,
}: ConsolidadoOperadoraBlockProps) {
  const larguraIndicador = larguraColunaIndicadorPorAno(ano)
  const larguraTabela = larguraTabelaConsolidado(ano, mesesVisiveis.length)

  return (
    <section className="flex flex-col overflow-hidden rounded-lg border border-[#c5d0de] bg-white shadow-sm lg:flex-row">
      <PainelLogoOperadora
        operadora={operadora.operadora}
        isConsolidado={operadora.tipo === "consolidado"}
        ano={ano}
      />

      <div className="relative z-0 min-w-0 flex-1 overflow-x-auto">
        <table
          className="table-fixed border-collapse text-[13px]"
          style={{ width: larguraTabela, minWidth: larguraTabela }}
        >
          <colgroup>
            <col style={{ width: larguraIndicador }} />
            {mesesVisiveis.map((mes) => (
              <col key={mes} style={{ width: LARGURA_COLUNA_MES }} />
            ))}
          </colgroup>
          <thead>
            <tr className="bg-[#1a1a2e] text-white">
              <th
                className={cn(
                  "sticky left-0 z-[1] whitespace-nowrap bg-[#1a1a2e] px-3 py-2 text-left font-semibold",
                  BORDA_SEPARADOR_RUBRICAS,
                )}
              >
                Indicador
              </th>
              {mesesVisiveis.map((mes) => (
                <th key={mes} className="px-2 py-2 text-center font-semibold whitespace-nowrap">
                  {MESES_LABELS[mes]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {operadora.linhas.map((linha, idx) => (
              <tr
                key={linha.key}
                className={idx % 2 === 0 ? "bg-white" : "bg-[#f7f9fc]"}
              >
                <td
                  className={cn(
                    "sticky left-0 z-[1] whitespace-nowrap bg-inherit py-1.5 text-[#3d4f63]",
                    BORDA_SEPARADOR_RUBRICAS,
                    SUB_LINHAS_BASE_VIDAS.has(linha.key)
                      ? "pl-8 pr-3 font-normal"
                      : "px-3 font-medium",
                    linha.key === "base_vidas" && "font-semibold",
                  )}
                >
                  {linha.label}
                </td>
                {mesesVisiveis.map((mes) => {
                  const valor = linha.valores[mes]
                  const texto = formatIndicadorValor(valor, linha.formato, {
                    exibirVazioSeZero: linha.exibirVazioSeZero,
                  })
                  const destaque =
                    linha.key === "base_vidas" ||
                    linha.key === "faturamento_emitido" ||
                    linha.key === "pct_cancelamento"

                  return (
                    <td
                      key={mes}
                      className={`px-2 py-1.5 text-right tabular-nums whitespace-nowrap ${
                        destaque ? "font-semibold text-[#1e3a5f]" : "text-[#2d3748]"
                      }`}
                    >
                      {texto}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
