"use client"

console.log("🚨 dashboard store loaded", performance.now())

import { useCallback, useEffect, useMemo, useRef } from "react"
import { usePersistentState } from "@/hooks/usePersistentState"

type BeneficiariosFiltersState = {
  mesReferencia: string // Formato: YYYY-MM (ex: "2025-01") - mantido para compatibilidade
  mesesReferencia: string[] // Formato: YYYY-MM (ex: ["2025-01", "2025-02"])
  operadoras: string[]
  entidades: string[]
  tipo: string // "Todos" ou valor específico
  cpf: string
}

const STORAGE_KEY = "admin-beneficiarios-filters"

function getMesReferenciaAtual(): string {
  const hoje = new Date()
  const year = hoje.getFullYear()
  const month = String(hoje.getMonth() + 1).padStart(2, "0")
  return `${year}-${month}`
}

const createDefaultFilters = (): BeneficiariosFiltersState => {
  const mesReferencia = getMesReferenciaAtual()
  return {
    mesReferencia,
    mesesReferencia: [mesReferencia],
    operadoras: [],
    entidades: [],
    tipo: "Todos",
    cpf: "",
  }
}

const normalizeToStringArray = (value: unknown, fallback: string[]): string[] => {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean)
  }
  if (typeof value === "string") {
    return value
      .split(",")
      .map((item: string) => item.trim())
      .filter(Boolean)
  }
  return fallback
}

const normalizeFilters = (
  input: Partial<BeneficiariosFiltersState>,
  fallback: BeneficiariosFiltersState
): BeneficiariosFiltersState => {
  const normalizeCpf = (value: unknown, fallbackValue: string) => {
    if (typeof value !== "string") {
      return fallbackValue
    }
    return value.replace(/\D/g, "").slice(0, 11)
  }

  const entidades = normalizeToStringArray(input.entidades, fallback.entidades)

  // Normalizar operadoras (suporta migração de string para array)
  const operadorasValue =
    input.operadoras !== undefined
      ? input.operadoras
      : (input as any).operadora !== undefined
      ? [(input as any).operadora].filter(Boolean)
      : undefined
  const operadoras = normalizeToStringArray(operadorasValue, fallback.operadoras)

  // Normalizar mesReferencia (suporta migração de dataInicio/dataFim)
  let mesReferencia = fallback.mesReferencia
  if (input.mesReferencia !== undefined) {
    mesReferencia = typeof input.mesReferencia === "string" && input.mesReferencia.trim() 
      ? input.mesReferencia 
      : fallback.mesReferencia
  } else if ((input as any).dataFim) {
    // Migração: usar dataFim como mês de referência
    try {
      const dataFim = (input as any).dataFim
      if (typeof dataFim === "string" && dataFim.trim()) {
        const date = new Date(dataFim)
        if (!Number.isNaN(date.getTime())) {
          const year = date.getFullYear()
          const month = String(date.getMonth() + 1).padStart(2, "0")
          mesReferencia = `${year}-${month}`
        }
      }
    } catch {
      // Ignorar erro de conversão
    }
  }

  // Normalizar mesesReferencia
  let mesesReferencia: string[] = []
  if (input.mesesReferencia !== undefined) {
    mesesReferencia = normalizeToStringArray(input.mesesReferencia, [])
  } else if (input.mesReferencia) {
    // Migração: converter mesReferencia único para array
    mesesReferencia = [input.mesReferencia]
  } else if (fallback.mesesReferencia && fallback.mesesReferencia.length > 0) {
    mesesReferencia = fallback.mesesReferencia
  } else if (mesReferencia) {
    mesesReferencia = [mesReferencia]
  } else {
    // Se não houver nenhum valor, usar o mês atual como padrão
    mesesReferencia = [getMesReferenciaAtual()]
  }

  return {
    mesReferencia, // Mantido para compatibilidade (usar o primeiro mês se houver)
    mesesReferencia,
    operadoras,
    entidades,
    tipo: typeof input.tipo === "string" && input.tipo !== "" ? input.tipo : fallback.tipo,
    cpf: normalizeCpf(input.cpf, fallback.cpf),
  }
}

export function useBeneficiariosFilters(initial?: Partial<BeneficiariosFiltersState>) {
  const initialKey = useMemo(() => JSON.stringify(initial ?? {}), [initial])

  const [filters, setFilters] = usePersistentState<BeneficiariosFiltersState>(
    STORAGE_KEY,
    createDefaultFilters
  )

  // Normalizar filtros uma vez após carregar do localStorage para garantir consistência
  // entre mesReferencia e mesesReferencia
  const normalizedOnceRef = useRef(false)
  useEffect(() => {
    if (normalizedOnceRef.current) return
    
    // Verificar se há inconsistência entre mesReferencia e mesesReferencia
    // Usar setFilters com função para acessar o estado atual sem depender de filters
    setFilters((prev) => {
      if (normalizedOnceRef.current) return prev
      normalizedOnceRef.current = true
      
      const mesRef = prev.mesReferencia
      const mesesRef = prev.mesesReferencia
      
      // Se mesReferencia existe mas não está em mesesReferencia, ou se estão diferentes
      const needsNormalization = 
        (mesRef && mesesRef.length > 0 && !mesesRef.includes(mesRef)) ||
        (mesesRef.length > 0 && mesRef !== mesesRef[0])
      
      if (needsNormalization) {
        // Normalizar: usar mesesReferencia como fonte da verdade
        const mesesNormalizados = mesesRef.length > 0 ? mesesRef : (mesRef ? [mesRef] : [getMesReferenciaAtual()])
        const mesNormalizado = mesesNormalizados[0] || getMesReferenciaAtual()
        
        // Só atualizar se realmente houver mudança
        if (mesNormalizado !== mesRef || JSON.stringify(mesesNormalizados) !== JSON.stringify(mesesRef)) {
          return {
            ...prev,
            mesReferencia: mesNormalizado,
            mesesReferencia: mesesNormalizados
          }
        }
      }
      
      return prev
    })
  }, [setFilters])

  useEffect(() => {
    if (!initial || Object.keys(initial).length === 0) return
    setFilters((prev) => normalizeFilters({ ...prev, ...initial }, prev))
  }, [initialKey, initial, setFilters])

  const updateFilters = useCallback(
    (partial: Partial<BeneficiariosFiltersState>) => {
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

