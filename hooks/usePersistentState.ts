"use client"

import { useEffect, useMemo, useRef, useState } from "react"

function resolveInitial<T>(value: T | (() => T)): T {
  return typeof value === "function" ? (value as () => T)() : value
}

export function usePersistentState<T>(key: string, initialValue: T | (() => T)) {
  const initialRef = useRef(initialValue)
  const defaultValue = useMemo(() => {
    try {
      return resolveInitial(initialRef.current)
    } catch (error) {
      console.error(`[usePersistentState] Failed to resolve initial value for key "${key}":`, error)
      return typeof initialValue === "function" ? (initialValue as () => T)() : initialValue
    }
  }, [])

  const [state, setState] = useState<T>(() => {
    if (typeof window === "undefined") {
      // No SSR, sempre retornar defaultValue
      // Mas vamos logar apenas uma vez para não poluir os logs
      if (!(globalThis as any).__usePersistentStateLogged) {
        console.log(`[usePersistentState] SSR: retornando defaultValue para "${key}"`, {
          defaultValue,
          isServer: true,
          note: "No SSR, sempre usa defaultValue. O valor correto será carregado no cliente."
        })
        ;(globalThis as any).__usePersistentStateLogged = true
      }
      return defaultValue
    }
    try {
      const stored = window.localStorage.getItem(key)
      if (stored !== null) {
        const parsed = JSON.parse(stored) as T
        // Garantir que o valor parseado seja válido
        const result = parsed !== null && parsed !== undefined ? parsed : defaultValue
        // Não mostrar warning se a diferença for apenas em valores de data/mês
        // (isso é esperado quando o usuário selecionou um mês diferente)
        const isDifferent = JSON.stringify(result) !== JSON.stringify(defaultValue)
        if (isDifferent) {
          // Verificar se é uma diferença "esperada" (como meses diferentes)
          // Para "admin-beneficiarios-filters", diferenças em mesesReferencia/mesReferencia são esperadas
          const isExpectedDifference = key === "admin-beneficiarios-filters" && 
            typeof result === "object" && result !== null &&
            typeof defaultValue === "object" && defaultValue !== null &&
            "mesesReferencia" in result && "mesesReferencia" in defaultValue
          
          if (!isExpectedDifference) {
            console.warn(`[usePersistentState] ⚠️ CLIENT: valor do localStorage DIFERENTE do defaultValue para "${key}"`, {
              stored,
              parsed,
              result,
              defaultValue,
              isServer: false,
              note: "Isso pode causar diferença entre SSR e cliente, causando re-renderizações"
            })
          }
        }
        return result
      }
    } catch (error) {
      console.error(`[usePersistentState] Failed to parse localStorage value for key "${key}":`, error)
      try {
        window.localStorage.removeItem(key)
      } catch {
        // ignore
      }
    }
    console.log(`[usePersistentState] CLIENT: nenhum valor no localStorage, usando defaultValue para "${key}"`, {
      defaultValue,
      isServer: false
    })
    return defaultValue
  })

  useEffect(() => {
    if (typeof window === "undefined") return
    try {
      window.localStorage.setItem(key, JSON.stringify(state))
    } catch (error) {
      console.error(`[usePersistentState] Failed to persist value for key "${key}":`, error)
    }
  }, [key, state])

  return [state, setState] as const
}

