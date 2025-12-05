"use client"

import { useState, useMemo } from "react"
import { cn } from "@/lib/utils"

interface Plano {
  plano: string
  vidas: number
  valor: number
  is?: number | null // Índice de sinistralidade (pode não estar disponível ainda)
}

interface PlanDistributionListProps {
  planos: Plano[]
  totalVidas: number
  maxVisible?: number // Número máximo de planos visíveis inicialmente (padrão: 10)
}

// Cores do menu lateral (conforme especificado)
const COR_AZUL_MENU = "#184286"
const COR_TEXTO_MENU = "#184286"

export function PlanDistributionList({ 
  planos, 
  totalVidas,
  maxVisible = 10 
}: PlanDistributionListProps) {
  const [showAll, setShowAll] = useState(false)

  // Ordenar planos por valor (do maior para o menor)
  const planosOrdenados = useMemo(() => {
    return [...planos].sort((a, b) => b.valor - a.valor)
  }, [planos])

  // Formatação de valores
  const formatCurrency = (valor: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(valor)
  }

  const formatNumber = (valor: number) => {
    return new Intl.NumberFormat("pt-BR").format(valor)
  }

  const formatPercent = (valor: number | null | undefined) => {
    if (valor === null || valor === undefined || isNaN(valor)) {
      return "-"
    }
    return `${valor.toFixed(2)}%`
  }

  // Calcular porcentagem de vidas para cada plano
  const getPctVidas = (vidasPlano: number) => {
    return totalVidas > 0 ? vidasPlano / totalVidas : 0
  }

  // Determinar quais planos mostrar
  const planosVisiveis = showAll 
    ? planosOrdenados 
    : planosOrdenados.slice(0, maxVisible)

  const temMaisPlanos = planosOrdenados.length > maxVisible

  if (planosOrdenados.length === 0) {
    return null
  }

  return (
    <div>
      {/* Container da tabela com scroll */}
      <div className="mt-2 max-h-80 overflow-y-auto rounded-xl bg-white">
        {/* Cabeçalho fixo */}
        <div className="sticky top-0 z-10 bg-slate-50 border-b border-slate-200">
          <div className="flex items-center py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
            <span className="w-[160px] pl-3 text-left border-r border-slate-200">Plano</span>
            <span className="w-[65px] text-center border-r border-slate-200">Vidas</span>
            <span className="w-[125px] text-center border-r border-slate-200">Valor</span>
            <span className="w-[60px] pr-3 text-center">IS</span>
          </div>
        </div>

        {/* Linhas com dividers */}
        <div className="divide-y divide-slate-100">
          {planosVisiveis.map((plano, index) => {
            const isFirstRow = index === 0

            return (
              <div
                key={plano.plano}
                className={cn(
                  "flex items-center py-2.5 text-xs hover:bg-slate-50/60 transition-colors cursor-default",
                  "h-[40px]"
                )}
              >
                {/* Plano */}
                <span 
                  className="w-[160px] pl-3 truncate text-left font-semibold text-[#184286] border-r border-slate-100"
                  title={plano.plano}
                >
                  {plano.plano}
                </span>

                {/* Vidas */}
                <span className="w-[65px] text-center font-semibold text-[#184286] border-r border-slate-100">
                  {formatNumber(plano.vidas)}
                </span>

                {/* Valor */}
                <span className="w-[125px] text-center text-[#184286] border-r border-slate-100">
                  {formatCurrency(plano.valor)}
                </span>

                {/* IS */}
                <span className={cn(
                  "w-[60px] pr-3 text-center",
                  plano.is != null ? "text-[#184286]" : "text-slate-300"
                )}>
                  {plano.is != null ? formatPercent(plano.is) : "-"}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Botão "Ver todos os planos" */}
      {temMaisPlanos && !showAll && (
        <button
          onClick={() => setShowAll(true)}
          className="mt-2 text-[11px] font-medium text-[#184286] hover:underline"
        >
          Ver todos os planos ({planosOrdenados.length})
        </button>
      )}

      {/* Botão "Ver menos" quando todos estão visíveis */}
      {temMaisPlanos && showAll && (
        <button
          onClick={() => setShowAll(false)}
          className="mt-2 text-[11px] font-medium text-[#184286] hover:underline"
        >
          Ver menos
        </button>
      )}
    </div>
  )
}

