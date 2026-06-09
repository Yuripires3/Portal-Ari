"use client"

import { MESES_LABELS } from "@/lib/indicadores/constants"
import { resolverDisplayOperadora } from "@/lib/indicadores/operadora-display"
import type { ConsolidadoOperadora, MesNumero } from "@/lib/indicadores/types"
import { formatIndicadorValor } from "@/utils/format"
import { cn } from "@/lib/utils"

const SUB_LINHAS_BASE_VIDAS = new Set(["base_dental", "base_saude"])

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
    <div className="bg-sidebar flex shrink-0 items-center justify-center border-b border-sidebar-border px-3 py-5 lg:w-[110px] lg:border-b-0 lg:border-r xl:w-[130px]">
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
  return (
    <section className="flex flex-col overflow-hidden rounded-lg border border-[#c5d0de] bg-white shadow-sm lg:flex-row">
      <PainelLogoOperadora
        operadora={operadora.operadora}
        isConsolidado={operadora.tipo === "consolidado"}
        ano={ano}
      />

      <div className="min-w-0 flex-1 overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-[13px]">
          <thead>
            <tr className="bg-[#1a1a2e] text-white">
              <th className="sticky left-0 z-10 min-w-[200px] bg-[#1a1a2e] px-3 py-2 text-left font-semibold">
                Indicador
              </th>
              {mesesVisiveis.map((mes) => (
                <th key={mes} className="min-w-[72px] px-2 py-2 text-center font-semibold whitespace-nowrap">
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
                    "sticky left-0 z-10 border-r border-[#e8edf3] bg-inherit py-1.5 text-[#3d4f63]",
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
                      className={`border-r border-[#eef2f6] px-2 py-1.5 text-right tabular-nums whitespace-nowrap last:border-r-0 ${
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
