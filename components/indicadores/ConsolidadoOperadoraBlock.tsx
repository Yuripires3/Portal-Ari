"use client"

import { MESES_LABELS } from "@/lib/indicadores/constants"
import { resolverDisplayOperadora } from "@/lib/indicadores/operadora-display"
import type { ConsolidadoOperadora, MesNumero } from "@/lib/indicadores/types"
import { formatIndicadorValor } from "@/utils/format"

interface ConsolidadoOperadoraBlockProps {
  operadora: ConsolidadoOperadora
  mesesVisiveis: MesNumero[]
}

export function ConsolidadoOperadoraBlock({ operadora, mesesVisiveis }: ConsolidadoOperadoraBlockProps) {
  const isConsolidado = operadora.tipo === "consolidado"
  const display = resolverDisplayOperadora(operadora.operadora)

  return (
    <section className="flex flex-col overflow-hidden rounded-lg border border-[#c5d0de] bg-white shadow-sm lg:flex-row">
      {/* Painel lateral — logos verticais do Excel */}
      <div
        className={`flex shrink-0 flex-col items-center justify-center border-b border-[#d4dde8] px-4 py-6 lg:w-[100px] lg:border-b-0 lg:border-r xl:w-[120px] ${
          isConsolidado ? "bg-[#e8edf5]" : ""
        }`}
        style={!isConsolidado ? { backgroundColor: display.corFundo } : undefined}
      >
        {isConsolidado ? (
          <>
            <div className="mb-2 flex h-10 w-10 items-center justify-center rounded bg-[#184286] text-[10px] font-black text-white">
              QV
            </div>
            <p
              className="text-center text-sm font-bold uppercase tracking-widest text-[#184286] lg:[writing-mode:vertical-rl] lg:rotate-180"
              style={{ letterSpacing: "0.12em" }}
            >
              CONSOLIDADO
            </p>
          </>
        ) : (
          <>
            <div
              className="mb-3 flex h-12 w-12 items-center justify-center rounded-full text-sm font-bold text-white shadow-sm"
              style={{ backgroundColor: display.corMarca }}
            >
              {display.iniciais}
            </div>
            <p
              className="max-w-[90px] text-center text-[11px] font-bold leading-tight lg:max-w-none lg:[writing-mode:vertical-rl] lg:rotate-180"
              style={{ color: display.corMarca }}
            >
              {display.nomeExibicao}
            </p>
          </>
        )}
      </div>

      <div className="min-w-0 flex-1 overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-[13px]">
          <thead>
            <tr className="bg-[#4a7f96] text-white">
              <th className="sticky left-0 z-10 min-w-[200px] bg-[#4a7f96] px-3 py-2 text-left font-semibold">
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
                <td className="sticky left-0 z-10 border-r border-[#e8edf3] bg-inherit px-3 py-1.5 font-medium text-[#3d4f63]">
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
