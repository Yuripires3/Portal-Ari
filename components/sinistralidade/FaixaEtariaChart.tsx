"use client"

import { useState, useMemo, memo } from "react"

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
 * OTIMIZADO: Memoizado para evitar re-renderizações
 */
function FaixaEtariaChartComponent({ data, totalVidas }: FaixaEtariaChartProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)

  // Memoizar cálculos para evitar recálculos desnecessários
  const maxVidas = useMemo(() => {
    if (!data || data.length === 0) return 1
    return Math.max(...data.map((d) => d.vidas || 0)) || 1
  }, [data])

  if (!data || data.length === 0) return null

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
                {/* Barra preenchida (azul #333b5f - mesma cor do gráfico de Bonificações) */}
                <div
                  className="h-8 rounded-sm flex items-center justify-center transition-all"
                  style={{ 
                    width: `${widthPercent}%`,
                    backgroundColor: "#333b5f"
                  }}
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
                  <div className="space-y-1.5 text-xs">
                    <p>
                      <span className="font-semibold">Valor Gasto:</span>{" "}
                      R$ {valorGasto.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                    <p>
                      <span className="font-semibold">% do Total de Vidas:</span>{" "}
                      {porcentagem.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%
                    </p>
                  </div>vsc
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// Memoizar componente para evitar re-renderizações desnecessárias
export const FaixaEtariaChart = memo(FaixaEtariaChartComponent, (prevProps, nextProps) => {
  if (prevProps.totalVidas !== nextProps.totalVidas) return false
  if (prevProps.data?.length !== nextProps.data?.length) return false
  if (!prevProps.data || !nextProps.data) return prevProps.data === nextProps.data
  
  // Comparação profunda dos arrays
  for (let i = 0; i < prevProps.data.length; i++) {
    if (
      prevProps.data[i].faixa !== nextProps.data[i].faixa ||
      prevProps.data[i].vidas !== nextProps.data[i].vidas ||
      prevProps.data[i].valorGasto !== nextProps.data[i].valorGasto
    ) {
      return false
    }
  }
  return true
})

