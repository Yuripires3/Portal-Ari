"use client"

import { useCallback, useEffect, useMemo, useRef } from "react"
import { usePersistentState } from "@/hooks/usePersistentState"
import {
  type BeneficiariosFiltersState,
  STORAGE_KEY,
  createDefaultFilters,
  normalizeFilters,
} from "./beneficiarios-filters-utils"

/**
 * Hook para gerenciar filtros de beneficiários com persistência no localStorage
 * 
 * Otimizações implementadas:
 * - Normalização única na inicialização (evita re-normalizações desnecessárias)
 * - Memoização de callbacks para evitar re-renders
 * - Validação consistente entre mesReferencia e mesesReferencia
 */
export function useBeneficiariosFilters(initial?: Partial<BeneficiariosFiltersState>) {
  // Memoizar a chave do initial para evitar re-aplicação desnecessária
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
    
    setFilters((prev) => {
      if (normalizedOnceRef.current) return prev
      normalizedOnceRef.current = true
      
      const mesRef = prev.mesReferencia
      const mesesRef = prev.mesesReferencia
      
      // Verificar se há inconsistência entre mesReferencia e mesesReferencia
      const needsNormalization = 
        (mesRef && mesesRef.length > 0 && !mesesRef.includes(mesRef)) ||
        (mesesRef.length > 0 && mesRef !== mesesRef[0]) ||
        mesesRef.length === 0
      
      if (needsNormalization) {
        // Normalizar: usar mesesReferencia como fonte da verdade
        const mesesNormalizados = mesesRef.length > 0 
          ? [...mesesRef].sort() // Ordenar meses
          : (mesRef ? [mesRef] : [createDefaultFilters().mesReferencia])
        const mesNormalizado = mesesNormalizados[0]
        
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

  // Aplicar valores iniciais (ex: vindos de URL ou props)
  useEffect(() => {
    if (!initial || Object.keys(initial).length === 0) return
    setFilters((prev) => normalizeFilters({ ...prev, ...initial }, prev))
  }, [initialKey, initial, setFilters])

  // Callback memoizado para atualizar filtros
  const updateFilters = useCallback(
    (partial: Partial<BeneficiariosFiltersState>) => {
      setFilters((prev) => {
        const updated = normalizeFilters({ ...prev, ...partial }, prev)
        // Garantir que sempre haja pelo menos 1 mês selecionado
        if (updated.mesesReferencia.length === 0) {
          updated.mesesReferencia = [createDefaultFilters().mesReferencia]
          updated.mesReferencia = updated.mesesReferencia[0]
        }
        return updated
      })
    },
    [setFilters]
  )

  // Callback memoizado para resetar filtros
  const resetFilters = useCallback(() => {
    setFilters(createDefaultFilters())
  }, [setFilters])

  return {
    filters,
    updateFilters,
    resetFilters,
  }
}

