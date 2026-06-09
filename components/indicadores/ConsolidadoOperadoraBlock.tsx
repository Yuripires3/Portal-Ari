"use client"

import { useState } from "react"
import { MESES_LABELS } from "@/lib/indicadores/constants"
import {
  LARGURA_COLUNA_MES,
  larguraColunaIndicadorPorAno,
  larguraTabelaConsolidado,
} from "@/lib/indicadores/consolidado-layout"
import { resolverDisplayOperadora } from "@/lib/indicadores/operadora-display"
import type {
  ConsolidadoOperadora,
  IndicadorKey,
  MesNumero,
} from "@/lib/indicadores/types"
import { formatIndicadorValor } from "@/utils/format"
import { cn } from "@/lib/utils"

const SUB_LINHAS_BASE_VIDAS = new Set(["base_dental", "base_saude"])
const CHAVES_CALCULADAS = new Set<IndicadorKey>([
  "base_vidas",
  "pct_cancelamento",
  "inadimplencia",
  "ticket_medio",
])

const LARGURA_PAINEL_LOGO = "w-full lg:w-[130px]"
const BORDA_SEPARADOR_RUBRICAS = "border-r border-[#c5d0de]"

interface ConsolidadoOperadoraBlockProps {
  operadora: ConsolidadoOperadora
  mesesVisiveis: MesNumero[]
  mesesEditaveis?: MesNumero[]
  ano: number
  onSalvarValor?: (
    operadora: string,
    indicadorKey: IndicadorKey,
    mes: MesNumero,
    valor: number
  ) => Promise<void>
}

interface CelulaEmEdicao {
  indicadorKey: IndicadorKey
  mes: MesNumero
  valor: string
}

function parseValorEditado(valor: string): number | null {
  const limpo = valor.replace(/[R$\s%]/g, "")
  const normalizado =
    limpo.includes(",") && limpo.includes(".")
      ? limpo.replace(/\./g, "").replace(",", ".")
      : limpo.replace(",", ".")
  const numero = Number(normalizado)
  return Number.isFinite(numero) ? numero : null
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
  mesesEditaveis = [],
  ano,
  onSalvarValor,
}: ConsolidadoOperadoraBlockProps) {
  const [edicao, setEdicao] = useState<CelulaEmEdicao | null>(null)
  const [salvando, setSalvando] = useState(false)
  const larguraIndicador = larguraColunaIndicadorPorAno(ano)
  const larguraTabela = larguraTabelaConsolidado(ano, mesesVisiveis.length)
  const larguraMes = `calc((100% - ${larguraIndicador}px) / ${Math.max(mesesVisiveis.length, 1)})`

  const concluirEdicao = async () => {
    if (!edicao || !onSalvarValor || salvando) return
    const valor = parseValorEditado(edicao.valor)
    if (valor === null) return

    setSalvando(true)
    try {
      await onSalvarValor(operadora.operadora, edicao.indicadorKey, edicao.mes, valor)
      setEdicao(null)
    } catch {
      // A pagina exibe a mensagem retornada pela API e mantem o valor para correcao.
    } finally {
      setSalvando(false)
    }
  }

  return (
    <section className="flex flex-col overflow-hidden rounded-lg border border-[#c5d0de] bg-white shadow-sm lg:flex-row">
      <PainelLogoOperadora
        operadora={operadora.operadora}
        isConsolidado={operadora.tipo === "consolidado"}
        ano={ano}
      />

      <div className="relative z-0 min-w-0 flex-1 overflow-x-auto">
        <table
          className="w-full table-fixed border-collapse text-[13px]"
          style={{ minWidth: larguraTabela }}
        >
          <colgroup>
            <col style={{ width: larguraIndicador }} />
            {mesesVisiveis.map((mes) => (
              <col key={mes} style={{ width: larguraMes, minWidth: LARGURA_COLUNA_MES }} />
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
                  const editavel =
                    operadora.tipo !== "consolidado" &&
                    mesesEditaveis.includes(mes) &&
                    !CHAVES_CALCULADAS.has(linha.key) &&
                    Boolean(onSalvarValor)
                  const editando =
                    edicao?.indicadorKey === linha.key && edicao.mes === mes

                  return (
                    <td
                      key={mes}
                      className={`px-2 py-1.5 text-right tabular-nums whitespace-nowrap ${
                        destaque ? "font-semibold text-[#1e3a5f]" : "text-[#2d3748]"
                      }`}
                    >
                      {editando ? (
                        <input
                          autoFocus
                          disabled={salvando}
                          value={edicao.valor}
                          onChange={(event) =>
                            setEdicao({ ...edicao, valor: event.target.value })
                          }
                          onBlur={() => void concluirEdicao()}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") event.currentTarget.blur()
                            if (event.key === "Escape") setEdicao(null)
                          }}
                          className="h-6 w-full rounded border border-[#184286] bg-white px-1 text-right text-[13px] outline-none"
                        />
                      ) : editavel ? (
                        <button
                          type="button"
                          title="Clique para editar"
                          className="w-full rounded px-1 text-right hover:bg-[#e8eef7] hover:ring-1 hover:ring-[#9eb3ce]"
                          onClick={() =>
                            setEdicao({
                              indicadorKey: linha.key,
                              mes,
                              valor: String(valor ?? 0),
                            })
                          }
                        >
                          {texto}
                        </button>
                      ) : (
                        texto
                      )}
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
