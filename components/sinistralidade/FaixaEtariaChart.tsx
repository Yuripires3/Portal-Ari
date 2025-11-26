"use client"

import { useState } from "react"

export type FaixaEtariaItem = {
  faixa: string // '00 a 18', '19 a 23', ...
  vidas: number
  valorGasto?: number // Valor gasto total da faixa etária
}

interface FaixaEtariaChartProps {
  data: FaixaEtariaItem[]
  totalVidas: number // Total de vidas do card para calcular porcentagem
}

/**
 * Componente de funil de faixa etária
 * Exibe barras horizontais empilhadas verticalmente, sem eixos ou grid
 * Formato: rótulo à esquerda, barra com largura proporcional, número dentro da barra
 * Tooltip ao passar o mouse mostra valor gasto e porcentagem
 */
export function FaixaEtariaChart({ data, totalVidas }: FaixaEtariaChartProps) {
  if (!data || data.length === 0) return null

  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)

  // Calcular o máximo para usar como referência de largura
  const maxVidas = Math.max(...data.map((d) => d.vidas || 0)) || 1

  return (
    <div className="w-full space-y-2">
      {data.map((item, index) => {
        const widthPercent = (item.vidas / maxVidas) * 100
        const porcentagem = totalVidas > 0 ? (item.vidas / totalVidas) * 100 : 0
        const valorGasto = item.valorGasto || 0
        const isHovered = hoveredIndex === index

        return (
          <div
            key={item.faixa}
            className="flex items-center gap-2 relative"
            onMouseEnter={() => setHoveredIndex(index)}
            onMouseLeave={() => setHoveredIndex(null)}
          >
            {/* Rótulo à esquerda */}
            <span className="w-14 text-xs text-muted-foreground text-right">
              {item.faixa}
            </span>

            {/* Barra */}
            <div className="flex-1 relative">
              {/* Fundo da barra (muted) */}
              <div className="h-8 bg-muted rounded-sm">
                {/* Barra preenchida (slate-900) */}
                <div
                  className="h-8 bg-slate-900 rounded-sm flex items-center justify-center transition-all"
                  style={{ width: `${widthPercent}%` }}
                >
                  {/* Número de vidas centralizado dentro da barra */}
                  {item.vidas > 0 && (
                    <span className="text-xs font-medium text-white px-3 whitespace-nowrap">
                      {item.vidas.toLocaleString("pt-BR")}
                    </span>
                  )}
                </div>
              </div>

              {/* Tooltip */}
              {isHovered && (
                <div className="absolute z-50 bottom-full left-0 mb-2 bg-white dark:bg-zinc-900 p-3 border rounded-lg shadow-lg min-w-[220px]">
                  <p className="font-semibold mb-2 text-sm">{item.faixa}</p>
                  <div className="space-y-1.5 text-xs">
                    <p>
                      <span className="font-semibold">Vidas:</span>{" "}
                      {item.vidas.toLocaleString("pt-BR")}
                    </p>
                    <p>
                      <span className="font-semibold">Valor Gasto:</span>{" "}
                      R$ {valorGasto.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                    <p>
                      <span className="font-semibold">Porcentagem:</span>{" "}
                      {porcentagem.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

