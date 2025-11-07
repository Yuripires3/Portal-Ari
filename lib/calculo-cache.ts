/**
 * Cache em memória para armazenar resultados de cálculos de bonificação
 * Os dados são armazenados por exec_id e expiram após 30 minutos
 */

interface CalculoResult {
  exec_id: string
  timestamp: number
  data: {
    logs: string
    preview_df5: any[]
    indicadores: {
      vlr_bruto_total: string
      vlr_bruto_cor: string
      vlr_bruto_sup: string
      desc_total: string
      desc_cor: string
      desc_sup: string
      vlr_liquido_total: string
      vlr_liquido_cor: string
      vlr_liquido_sup: string
      prop_inicial: number
      ticket_medio: string
      vidas_pagas: number
    }
    filtros: Record<string, any[]>
    sem_registro: Record<string, any[]>
    merges: Record<string, string>
    calc_pag: any[]
    df4_sem_pix: any[]
    df4_com_pix: any[]
    df5: any[]
    desc: any[]
    unif_bonif: any[]
    unif_com: any[]
  }
}

// Garantir cache compartilhado entre rotas/processos no mesmo boot (dev/hot-reload)
const g = globalThis as any
if (!g.__CALCULO_CACHE_MAP) {
  g.__CALCULO_CACHE_MAP = new Map<string, CalculoResult>()
}
const cache: Map<string, CalculoResult> = g.__CALCULO_CACHE_MAP
const TTL = 30 * 60 * 1000 // 30 minutos em milissegundos

// Limpeza periódica de entradas expiradas
if (!g.__CALCULO_CACHE_SWEEPER) {
  g.__CALCULO_CACHE_SWEEPER = setInterval(() => {
  const now = Date.now()
  for (const [exec_id, result] of cache.entries()) {
    if (now - result.timestamp > TTL) {
      cache.delete(exec_id)
    }
  }
  }, 5 * 60 * 1000) // Verifica a cada 5 minutos
}

export function storeCalculoResult(exec_id: string, data: CalculoResult['data']): void {
  cache.set(exec_id, {
    exec_id,
    timestamp: Date.now(),
    data
  })
}

export function getCalculoResult(exec_id: string): CalculoResult['data'] | null {
  const result = cache.get(exec_id)
  if (!result) {
    return null
  }
  
  // Verificar se expirou
  if (Date.now() - result.timestamp > TTL) {
    cache.delete(exec_id)
    return null
  }
  
  return result.data
}

export function deleteCalculoResult(exec_id: string): void {
  cache.delete(exec_id)
}

export function generateExecId(): string {
  return `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

