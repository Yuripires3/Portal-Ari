"use client"

import { MESES_LABELS, MESES_NUMEROS } from "@/lib/indicadores/constants"
import { resolverDisplayOperadora } from "@/lib/indicadores/operadora-display"
import type { ConsolidadoOperadora, MesNumero } from "@/lib/indicadores/types"
import { formatIndicadorValor } from "@/utils/format"

interface ConsolidadoOperadoraBlockProps {
  operadora: ConsolidadoOperadora
  mesesVisiveis?: MesNumero[]
}

export function ConsolidadoOperadoraBlock({
  operadora,
  mesesVisiveis = MESES_NUMEROS,
}: ConsolidadoOperadoraBlockProps) {
  const display = resolverDisplayOperadora(operadora.operadora)

  return (
    <section className="flex flex-col gap-0 overflow-hidden rounded-lg border border-[#d4dde8] bg-white shadow-sm lg:flex-row">
      {/* Painel da operadora — equivalente à coluna de logos do Excel */}
      <div
        className="flex min-h-[120px] min-w-[180px] flex-col items-center justify-center border-b border-[#d4dde8] px-6 py-8 lg:border-b-0 lg:border-r"
        style={{ backgroundColor: display.corFundo }}
      >
        <div
          className="mb-3 flex h-14 w-14 items-center justify-center rounded-full text-lg font-bold text-white shadow-sm"
          style={{ backgroundColor: display.corMarca }}
        >
          {display.iniciais}
        </div>
        <p
          className="text-center text-sm font-semibold leading-tight"
          style={{ color: display.corMarca }}
        >
          {display.nomeExibicao}
        </p>
      </div>

      {/* Tabela de indicadores — estrutura Jan-Dez do Excel */}
      <div className="min-w-0 flex-1 overflow-x-auto">
        <table className="w-full min-w-[780px] border-collapse text-[13px]">
          <thead>
            <tr className="bg-[#5a8fa8] text-white">
              <th className="sticky left-0 z-10 min-w-[210px] bg-[#5a8fa8] px-3 py-2.5 text-left font-semibold">
                Indicador
              </th>
              {mesesVisiveis.map((mes) => (
                <th key={mes} className="px-2 py-2.5 text-center font-semibold whitespace-nowrap">
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
                <td className="sticky left-0 z-10 bg-inherit px-3 py-1.5 font-medium text-[#3d4f63] border-r border-[#e8edf3]">
                  {linha.label}
                </td>
                {mesesVisiveis.map((mes) => {
                  const valor = linha.valores[mes]
                  const texto = formatIndicadorValor(valor, linha.formato, {
                    exibirVazioSeZero: linha.exibirVazioSeZero,
                  })
                  const isDestaque =
                    linha.key === "base_vidas" ||
                    linha.key === "faturamento_emitido" ||
                    linha.key === "pct_cancelamento"

                  return (
                    <td
                      key={mes}
                      className={`px-2 py-1.5 text-right tabular-nums whitespace-nowrap border-r border-[#eef2f6] last:border-r-0 ${
                        isDestaque ? "font-semibold text-[#1e3a5f]" : "text-[#2d3748]"
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
