"use client"

import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { MESES_LABELS, MESES_NUMEROS } from "@/lib/indicadores/constants"
import { permiteFiltroMesAte, rotuloAbaAno } from "@/lib/indicadores/consolidado-filtros-utils"
import type { ConsolidadoFiltrosState, MesNumero } from "@/lib/indicadores/types"

interface ConsolidadoFiltrosProps {
  filtros: ConsolidadoFiltrosState
  anosDisponiveis: number[]
  mesesDisponiveis: MesNumero[]
  onChange: (filtros: ConsolidadoFiltrosState) => void
}

export function ConsolidadoFiltros({
  filtros,
  anosDisponiveis,
  mesesDisponiveis,
  onChange,
}: ConsolidadoFiltrosProps) {
  const set = <K extends keyof ConsolidadoFiltrosState>(key: K, value: ConsolidadoFiltrosState[K]) => {
    onChange({ ...filtros, [key]: value })
  }

  const exibirFiltroMes = permiteFiltroMesAte(filtros.ano)

  return (
    <div className="flex flex-wrap items-end justify-between gap-3 border-t border-[#d4dde8] bg-[#f4f7fb] px-2 pb-0 pt-2">
      <div className="flex flex-wrap gap-0 overflow-x-auto">
        {anosDisponiveis.map((a) => {
          const ativo = filtros.ano === a
          return (
            <button
              key={a}
              type="button"
              onClick={() => set("ano", a)}
              className={`shrink-0 rounded-t-md border border-b-0 px-3 py-2 text-xs font-medium transition-colors sm:px-4 sm:text-sm ${
                ativo
                  ? "border-[#c5d0de] bg-white text-[#184286] shadow-sm"
                  : "border-transparent bg-transparent text-[#5a6b7d] hover:bg-white/60 hover:text-[#184286]"
              }`}
            >
              {rotuloAbaAno(a)}
            </button>
          )
        })}
      </div>

      {exibirFiltroMes && (
        <div className="flex shrink-0 items-center gap-2 pb-2 pr-1">
          <Label htmlFor="mes-ate" className="text-xs font-medium text-[#5a6b7d] whitespace-nowrap">
            Exibir até
          </Label>
          <Select
            value={String(filtros.mesAte)}
            onValueChange={(v) => set("mesAte", Number(v) as MesNumero)}
          >
            <SelectTrigger id="mes-ate" className="h-8 w-[110px] bg-white text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MESES_NUMEROS.filter((mes) => mesesDisponiveis.includes(mes)).map((m) => (
                <SelectItem key={m} value={String(m)}>
                  {MESES_LABELS[m]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  )
}
