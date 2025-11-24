"use client"

console.log("🚨 dashboard store loaded", performance.now())

import { useCallback, useEffect, useMemo } from "react"
import { formatDateISO } from "@/lib/date-utils"
import { usePersistentState } from "@/hooks/usePersistentState"

export type DashboardPapel = "geral" | "corretores" | "supervisores"

export type DashboardFiltersState = {
  dataInicio: string
  dataFim: string
  operadora: string
  entidades: string[]
  papel: DashboardPapel
}

const STORAGE_KEY = "admin-dashboard-filters"

function getPrimeiroDiaMesAtualISO(): string {
  const hoje = new Date()
  const primeiroDiaMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1)
  return formatDateISO(primeiroDiaMes)
}

function getHojeISO(): string {
  return formatDateISO(new Date())
}

const createDefaultFilters = (): DashboardFiltersState => ({
  dataInicio: getPrimeiroDiaMesAtualISO(),
  dataFim: getHojeISO(),
  operadora: "",
  entidades: [],
  papel: "geral",
})

const normalizeFilters = (
  input: Partial<DashboardFiltersState>,
  fallback: DashboardFiltersState
): DashboardFiltersState => {
  const entidadesValue = input.entidades
  const entidades = Array.isArray(entidadesValue)
    ? entidadesValue.map((ent: unknown) => String(ent).trim()).filter(Boolean)
    : typeof entidadesValue === "string"
    ? (entidadesValue as string).split(",").map((ent: string) => ent.trim()).filter(Boolean)
    : fallback.entidades

  const papelValue = input.papel
  const papel: DashboardPapel =
    papelValue === "corretores" || papelValue === "supervisores" ? papelValue : fallback.papel

  return {
    dataInicio:
      typeof input.dataInicio === "string" && input.dataInicio.trim()
        ? input.dataInicio
        : fallback.dataInicio,
    dataFim:
      typeof input.dataFim === "string" && input.dataFim.trim()
        ? input.dataFim
        : fallback.dataFim,
    operadora: typeof input.operadora === "string" ? input.operadora : fallback.operadora,
    entidades,
    papel,
  }
}

export function useDashboardFilters(initial?: Partial<DashboardFiltersState>) {
  const initialKey = useMemo(() => JSON.stringify(initial ?? {}), [initial])

  const [filters, setFilters] = usePersistentState<DashboardFiltersState>(
    STORAGE_KEY,
    createDefaultFilters
  )

  useEffect(() => {
    if (!initial || Object.keys(initial).length === 0) return
    setFilters((prev) => normalizeFilters({ ...prev, ...initial }, prev))
  }, [initialKey, initial, setFilters])

  const updateFilters = useCallback(
    (partial: Partial<DashboardFiltersState>) => {
      setFilters((prev) => normalizeFilters({ ...prev, ...partial }, prev))
    },
    [setFilters]
  )

  const resetFilters = useCallback(() => {
    setFilters(createDefaultFilters())
  }, [setFilters])

  return {
    filters,
    updateFilters,
    resetFilters,
  }
}

