/**
 * Componente reutilizável para cards de resumo de sinistralidade
 * Exibe título, quantidade de vidas e valores com cores temáticas
 */

import { FaixaEtariaChart, FaixaEtariaItem } from "./FaixaEtariaChart"

interface SummaryCardProps {
  title: string
  livesLabel?: string
  livesValue: number
  amountLabel?: string
  amountValue: number
  accentColorClass: string
  faixaEtaria?: FaixaEtariaItem[]
  totalVidas?: number // Total geral de vidas para calcular porcentagem
}

export function SummaryCard({
  title,
  livesLabel = "Vidas",
  livesValue,
  amountLabel = "Valor Total de Procedimentos",
  amountValue,
  accentColorClass,
  faixaEtaria,
  totalVidas,
}: SummaryCardProps) {
  // Calcular porcentagem em relação ao total
  const porcentagem = totalVidas && totalVidas > 0
    ? (livesValue / totalVidas) * 100
    : 0

  return (
    <div
      className="p-6 bg-white dark:bg-slate-950 rounded-xl shadow-md border border-slate-200 dark:border-slate-800 flex flex-col h-full"
      role="group"
      aria-label={`Card de resumo: ${title}`}
    >
      {/* Título do card */}
      <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-4">
        {title}
      </h2>

      {/* Espaço */}
      <div className="flex-1" />

      {/* Bloco Vidas */}
      <div className="space-y-1">
        <p className="text-sm text-slate-500 dark:text-slate-400">{livesLabel}</p>
        <div className="flex items-baseline gap-2">
          <p className={`text-3xl font-bold ${accentColorClass}`}>
            {livesValue.toLocaleString("pt-BR")}
          </p>
          {totalVidas && totalVidas > 0 && title !== "Total Geral" && (
            <span className="text-sm font-medium text-muted-foreground">
              ({porcentagem.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%)
            </span>
          )}
        </div>
      </div>

      {/* Linha divisória discreta */}
      <div className="border-t border-slate-200 dark:border-slate-800 mt-4 pt-4" />

      {/* Bloco Valores */}
      <div className="space-y-1">
        <p className="text-sm text-slate-500 dark:text-slate-400">{amountLabel}</p>
        <p className={`text-xl font-semibold ${accentColorClass}`}>
          R$ {amountValue.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </p>
      </div>

      {/* Gráfico de Faixa Etária */}
      {faixaEtaria && faixaEtaria.length > 0 && (
        <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-800">
          <p className="text-sm text-muted-foreground mb-2">
            Distribuição por faixa etária
          </p>
          <FaixaEtariaChart data={faixaEtaria} totalVidas={livesValue} />
        </div>
      )}
    </div>
  )
}

