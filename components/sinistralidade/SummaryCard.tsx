/**
 * Componente reutilizável para cards de resumo de sinistralidade
 * Exibe título, quantidade de vidas e valores com cores temáticas
 */

interface SummaryCardProps {
  title: string
  livesLabel?: string
  livesValue: number
  amountLabel?: string
  amountValue: number
  accentColorClass: string
}

export function SummaryCard({
  title,
  livesLabel = "Vidas",
  livesValue,
  amountLabel = "Valor Total de Procedimentos",
  amountValue,
  accentColorClass,
}: SummaryCardProps) {
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
        <p className={`text-3xl font-bold ${accentColorClass}`}>
          {livesValue.toLocaleString("pt-BR")}
        </p>
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
    </div>
  )
}

