interface ConsolidadoHeaderProps {
  ano: number
}

export function ConsolidadoHeader({ ano }: ConsolidadoHeaderProps) {
  return (
    <div className="rounded-lg overflow-hidden border border-[#2a2a3a] bg-[#1e1e2e] text-white shadow-md">
      <div className="flex items-center justify-between px-6 py-5">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-white/10 text-sm font-bold tracking-tight">
            QV
          </div>
          <div>
            <p className="text-xs uppercase tracking-widest text-white/60">benefícios</p>
            <p className="text-[10px] text-white/40">a Quatro</p>
          </div>
        </div>
        <div className="text-right">
          <h2 className="text-3xl font-light tracking-wide">INDICADORES</h2>
          <p className="text-sm text-white/70 mt-0.5">Consolidado {ano}</p>
        </div>
      </div>
    </div>
  )
}
