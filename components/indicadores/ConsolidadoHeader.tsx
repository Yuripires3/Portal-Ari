interface ConsolidadoHeaderProps {
  ano: number
}

export function ConsolidadoHeader({ ano }: ConsolidadoHeaderProps) {
  return (
    <header className="rounded-t-lg overflow-hidden border border-b-0 border-[#2a2a3a] bg-[#1a1a2e] text-white">
      <div className="flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex items-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logos-operadoras/logo_qv.png"
            alt="QV benefícios"
            className="h-18 w-auto object-contain sm:h-20"
          />
        </div>
        <div className="sm:text-right">
          <h1 className="text-2xl font-light tracking-[0.15em] sm:text-3xl">INDICADORES</h1>
          <p className="mt-0.5 text-sm text-white/60">Consolidado {ano}</p>
        </div>
      </div>
    </header>
  )
}
