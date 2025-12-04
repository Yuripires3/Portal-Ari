"use client"

import { useState, useEffect, useCallback, useRef, useMemo } from "react"

type TiposPorMesCache = {
  meses: string[] // Chave: meses ordenados e serializados
  tipos: string[]
  timestamp: number
}

const CACHE_DURATION_MS = 5 * 60 * 1000 // 5 minutos

/**
 * Hook otimizado para carregar tipos de beneficiários por mês com cache
 * 
 * Otimizações:
 * - Cache em memória para evitar chamadas duplicadas
 * - Comparação inteligente de meses (ordena antes de comparar)
 * - Estados de loading/erro controlados
 * - Evita requisições desnecessárias quando os meses não mudaram
 */
export function useTiposPorMes(
  mesesReferencia: string[],
  operadorasDisponiveis: string[]
) {
  const [tiposDisponiveis, setTiposDisponiveis] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  // Cache em memória (por componente)
  const cacheRef = useRef<Map<string, TiposPorMesCache>>(new Map())
  
  // Última requisição em andamento (para evitar race conditions)
  const lastRequestRef = useRef<string | null>(null)
  
  // Contador para forçar refresh (incrementa para disparar useEffect)
  const [refreshTrigger, setRefreshTrigger] = useState(0)

  // Gerar chave de cache baseada nos meses ordenados
  const cacheKey = useMemo(() => {
    if (!mesesReferencia || mesesReferencia.length === 0) return ""
    return [...mesesReferencia].sort().join(",")
  }, [mesesReferencia])
  
  // Função para forçar refresh (limpar cache e recarregar)
  const refresh = useCallback(() => {
    if (cacheKey) {
      // Limpar cache para esta chave
      cacheRef.current.delete(cacheKey)
      // Limpar última requisição para permitir nova requisição
      lastRequestRef.current = null
      // Incrementar trigger para forçar re-execução do useEffect
      setRefreshTrigger(prev => prev + 1)
    }
  }, [cacheKey])

  // Função para buscar tipos da API
  const fetchTipos = useCallback(async (meses: string[]): Promise<string[]> => {
    if (!meses || meses.length === 0) {
      return []
    }

    const mesesOrdenados = [...meses].sort()
    const primeiroMes = mesesOrdenados[0]
    const ultimoMes = mesesOrdenados[mesesOrdenados.length - 1]

    const [anoInicioSel, mesInicioSel] = primeiroMes.split("-")
    const dataInicio = `${anoInicioSel}-${mesInicioSel}-01`

    const [anoFimSel, mesFimSel] = ultimoMes.split("-")
    const anoFimNum = parseInt(anoFimSel)
    const mesFimNum = parseInt(mesFimSel)
    const ultimoDiaDate = new Date(anoFimNum, mesFimNum, 0)
    const dataFim = ultimoDiaDate.toISOString().split("T")[0]

    const params = new URLSearchParams({
      data_inicio: dataInicio,
      data_fim: dataFim,
      operadora: "ASSIM SAÚDE",
    })

    const res = await fetch(`/api/beneficiarios/tipos-por-mes?${params}`, {
      cache: "no-store"
    })

    if (!res.ok) {
      throw new Error("Erro ao carregar tipos por mês")
    }

    const data = await res.json()
    const tipos = (data.tipos || []).filter((tipo: string) => Boolean(tipo))

    return tipos
  }, [])

  // Carregar tipos com cache
  useEffect(() => {
    if (!cacheKey) {
      setTiposDisponiveis([])
      setLoading(false)
      setError(null)
      return
    }

    // Verificar cache
    const cached = cacheRef.current.get(cacheKey)
    const now = Date.now()
    
    // Se há cache válido e não estamos forçando refresh, usar cache
    if (cached && (now - cached.timestamp) < CACHE_DURATION_MS && lastRequestRef.current !== null && refreshTrigger === 0) {
      // Usar cache válido
      setTiposDisponiveis(cached.tipos)
      setLoading(false)
      setError(null)
      return
    }

    // Evitar requisições duplicadas (exceto quando refresh foi chamado)
    if (lastRequestRef.current === cacheKey && refreshTrigger === 0) {
      return
    }

    // Buscar da API
    lastRequestRef.current = cacheKey
    setLoading(true)
    setError(null)

    fetchTipos(mesesReferencia)
      .then((result) => {
        // Verificar se ainda é a requisição mais recente
        if (lastRequestRef.current === cacheKey) {
          // Atualizar cache
          cacheRef.current.set(cacheKey, {
            meses: mesesReferencia,
            tipos: result,
            timestamp: Date.now(),
          })

          setTiposDisponiveis(result)
          setLoading(false)
          lastRequestRef.current = null
        }
      })
      .catch((err) => {
        // Só atualizar erro se ainda for a requisição mais recente
        if (lastRequestRef.current === cacheKey) {
          setError(err instanceof Error ? err : new Error(String(err)))
          setLoading(false)
          lastRequestRef.current = null
        }
      })
  }, [cacheKey, mesesReferencia, fetchTipos, refreshTrigger])

  return {
    tiposDisponiveis,
    loading,
    error,
    refresh,
  }
}

