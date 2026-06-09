"use client"

import { RefreshCw, Search, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { MESES_LABELS, MESES_NUMEROS } from "@/lib/indicadores/constants"
import { rotuloAbaAno, resumoFiltros } from "@/lib/indicadores/consolidado-filtros-utils"
import { resolverDisplayOperadora } from "@/lib/indicadores/operadora-display"
import type { ConsolidadoFiltrosState, MesNumero } from "@/lib/indicadores/types"

interface ConsolidadoFiltrosProps {
  filtros: ConsolidadoFiltrosState
  anosDisponiveis: number[]
  nomesOperadoras: string[]
  totalOperadoras: number
  exibindoOperadoras: number
  loading?: boolean
  onChange: (filtros: ConsolidadoFiltrosState) => void
  onAtualizar: () => void
}

export function ConsolidadoFiltros({
  filtros,
  anosDisponiveis,
  nomesOperadoras,
  totalOperadoras,
  exibindoOperadoras,
  loading,
  onChange,
  onAtualizar,
}: ConsolidadoFiltrosProps) {
  const set = <K extends keyof ConsolidadoFiltrosState>(key: K, value: ConsolidadoFiltrosState[K]) => {
    onChange({ ...filtros, [key]: value })
  }

  const toggleOperadora = (nome: string, checked: boolean) => {
    const atual = new Set(filtros.operadorasSelecionadas)
    if (checked) atual.add(nome)
    else atual.delete(nome)
    set("operadorasSelecionadas", Array.from(atual))
  }

  const selecionarTodas = () =>
    onChange({ ...filtros, modoPersonalizado: false, operadorasSelecionadas: [] })

  const ativarPersonalizado = () =>
    onChange({ ...filtros, modoPersonalizado: true, operadorasSelecionadas: [...nomesOperadoras] })

  const operadorasFiltradasBusca = nomesOperadoras.filter((nome) => {
    if (!filtros.buscaOperadora.trim()) return true
    const busca = filtros.buscaOperadora.toLowerCase()
    const display = resolverDisplayOperadora(nome)
    return nome.toLowerCase().includes(busca) || display.nomeExibicao.toLowerCase().includes(busca)
  })

  const todasSelecionadas = !filtros.modoPersonalizado

  return (
    <div className="rounded-b-lg border border-[#d4dde8] bg-white shadow-sm">
      {/* Abas de ano — equivalente às abas do Excel */}
      <div className="flex flex-wrap gap-0 border-b border-[#d4dde8] bg-[#f4f7fb] px-2 pt-2">
        {anosDisponiveis.map((a) => {
          const ativo = filtros.ano === a
          return (
            <button
              key={a}
              type="button"
              onClick={() => set("ano", a)}
              className={`rounded-t-md border border-b-0 px-4 py-2 text-xs font-medium transition-colors sm:text-sm ${
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

      <div className="space-y-4 p-4">
        <div className="grid gap-4 lg:grid-cols-[1fr_auto_auto] lg:items-end">
          {/* Busca de operadora */}
          <div className="space-y-1.5">
            <Label htmlFor="busca-operadora" className="text-xs font-medium text-[#5a6b7d]">
              Operadora
            </Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="busca-operadora"
                placeholder="Buscar operadora..."
                value={filtros.buscaOperadora}
                onChange={(e) => set("buscaOperadora", e.target.value)}
                className="pl-9"
              />
              {filtros.buscaOperadora && (
                <button
                  type="button"
                  onClick={() => set("buscaOperadora", "")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>

          {/* Até o mês */}
          <div className="space-y-1.5">
            <Label htmlFor="mes-ate" className="text-xs font-medium text-[#5a6b7d]">
              Exibir até
            </Label>
            <Select
              value={String(filtros.mesAte)}
              onValueChange={(v) => set("mesAte", Number(v) as MesNumero)}
            >
              <SelectTrigger id="mes-ate" className="w-full min-w-[130px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MESES_NUMEROS.map((m) => (
                  <SelectItem key={m} value={String(m)}>
                    {MESES_LABELS[m]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button onClick={onAtualizar} disabled={loading} className="lg:self-end">
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
        </div>

        {/* Chips de operadoras */}
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant={todasSelecionadas ? "default" : "outline"}
              size="sm"
              className="h-8"
              onClick={selecionarTodas}
            >
              Todas
            </Button>
            <Button type="button" variant="outline" size="sm" className="h-8" onClick={ativarPersonalizado}>
              Personalizar
            </Button>
            <label className="ml-auto flex cursor-pointer items-center gap-2 text-sm text-[#3d4f63]">
              <Checkbox
                checked={filtros.exibirConsolidadoGeral}
                onCheckedChange={(v) => set("exibirConsolidadoGeral", v === true)}
              />
              Consolidado QV
            </label>
          </div>

          {filtros.modoPersonalizado && (
            <div className="flex max-h-32 flex-wrap gap-2 overflow-y-auto rounded-md border border-[#e8edf3] bg-[#f9fafb] p-2">
              {operadorasFiltradasBusca.map((nome) => {
                const display = resolverDisplayOperadora(nome)
                const marcada = filtros.operadorasSelecionadas.includes(nome)
                return (
                  <label
                    key={nome}
                    className={`flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors ${
                      marcada
                        ? "border-[#5a8fa8] bg-[#eef5f8] text-[#184286]"
                        : "border-[#dde3ea] bg-white text-[#5a6b7d]"
                    }`}
                  >
                    <Checkbox
                      checked={marcada}
                      onCheckedChange={(v) => toggleOperadora(nome, v === true)}
                      className="h-3.5 w-3.5"
                    />
                    {display.nomeExibicao}
                  </label>
                )
              })}
            </div>
          )}
        </div>

        <p className="text-xs text-[#5a6b7d]">
          {resumoFiltros(totalOperadoras, exibindoOperadoras, filtros.mesAte)}
        </p>
      </div>
    </div>
  )
}
