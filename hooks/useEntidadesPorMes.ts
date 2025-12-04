"use client"

import { useState, useEffect, useCallback, useRef, useMemo } from "react"

type EntidadesPorMesCache = {
  meses: string[] // Chave: meses ordenados e serializados
  entidades: string[]
  entidadesPorOperadora: Record<string, string[]>
  timestamp: number
}

const CACHE_DURATION_MS = 5 * 60 * 1000 // 5 minutos
const CACHE_KEY_PREFIX = "entidades-por-mes-cache-"

/**
 * Hook otimizado para carregar entidades por mês com cache
 * 
 * Otimizações:
 * - Cache em memória para evitar chamadas duplicadas
 * - Comparação inteligente de meses (ordena antes de comparar)
 * - Estados de loading/erro controlados
 * - Evita requisições desnecessárias quando os meses não mudaram
 */
export function useEntidadesPorMes(
  mesesReferencia: string[],
  operadorasDisponiveis: string[]
) {
  const [entidadesDisponiveis, setEntidadesDisponiveis] = useState<string[]>([])
  const [entidadesPorOperadora, setEntidadesPorOperadora] = useState<Record<string, string[]>>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  // Cache em memória (por componente)
  const cacheRef = useRef<Map<string, EntidadesPorMesCache>>(new Map())
  
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

  // Função para buscar entidades da API
  const fetchEntidades = useCallback(async (meses: string[]): Promise<{
    entidades: string[]
    entidadesPorOperadora: Record<string, string[]>
  }> => {
    if (!meses || meses.length === 0) {
      return { entidades: [], entidadesPorOperadora: {} }
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

    const res = await fetch(`/api/beneficiarios/entidades-por-mes?${params}`, {
      cache: "no-store"
    })

    if (!res.ok) {
      throw new Error("Erro ao carregar entidades por mês")
    }

    const data = await res.json()
    const entidadesComDados = data.entidades || []
    const entidadesAssimSaude = entidadesComDados.filter((ent: string) => Boolean(ent))

    // Construir mapeamento entidades por operadora
    const entidadesPorOperadoraFiltrado: Record<string, string[]> = {}
    const operadoraKey = operadorasDisponiveis.find(
      (op: string) => op.toUpperCase() === "ASSIM SAÚDE" || op.toUpperCase() === "ASSIM SAUDE"
    )
    if (operadoraKey) {
      entidadesPorOperadoraFiltrado[operadoraKey] = entidadesAssimSaude
    }

    return {
      entidades: entidadesAssimSaude,
      entidadesPorOperadora: entidadesPorOperadoraFiltrado,
    }
  }, [operadorasDisponiveis])

  // Carregar entidades com cache
  useEffect(() => {
    if (!cacheKey) {
      setEntidadesDisponiveis([])
      setEntidadesPorOperadora({})
      setLoading(false)
      setError(null)
      return
    }

    // Verificar cache
    const cached = cacheRef.current.get(cacheKey)
    const now = Date.now()
    
    // Se há cache válido e não estamos forçando refresh, usar cache
    if (cached && (now - cached.timestamp) < CACHE_DURATION_MS && lastRequestRef.current !== null) {
      // Usar cache válido
      setEntidadesDisponiveis(cached.entidades)
      setEntidadesPorOperadora(cached.entidadesPorOperadora)
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

    fetchEntidades(mesesReferencia)
      .then((result) => {
        // Verificar se ainda é a requisição mais recente
        if (lastRequestRef.current === cacheKey) {
          // Atualizar cache
          cacheRef.current.set(cacheKey, {
            meses: mesesReferencia,
            entidades: result.entidades,
            entidadesPorOperadora: result.entidadesPorOperadora,
            timestamp: Date.now(),
          })

          setEntidadesDisponiveis(result.entidades)
          setEntidadesPorOperadora(result.entidadesPorOperadora)
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
  }, [cacheKey, mesesReferencia, fetchEntidades, refreshTrigger])

  return {
    entidadesDisponiveis,
    entidadesPorOperadora,
    loading,
    error,
    refresh,
  }
}

