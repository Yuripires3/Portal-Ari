/**
 * Utilitários centralizados para validação e normalização de filtros de beneficiários
 */

export type BeneficiariosFiltersState = {
  mesReferencia: string // Formato: YYYY-MM (ex: "2025-01") - mantido para compatibilidade
  mesesReferencia: string[] // Formato: YYYY-MM (ex: ["2025-01", "2025-02"])
  operadoras: string[]
  entidades: string[]
  tipo: string // "Todos" ou valor específico
  cpf: string
}

const STORAGE_KEY = "admin-beneficiarios-filters"

/**
 * Obtém o mês de referência atual no formato YYYY-MM
 */
export function getMesReferenciaAtual(): string {
  const hoje = new Date()
  const year = hoje.getFullYear()
  const month = String(hoje.getMonth() + 1).padStart(2, "0")
  return `${year}-${month}`
}

/**
 * Cria o estado padrão dos filtros
 */
export function createDefaultFilters(): BeneficiariosFiltersState {
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

/**
 * Normaliza um valor para array de strings
 */
function normalizeToStringArray(value: unknown, fallback: string[]): string[] {
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

/**
 * Normaliza CPF: remove caracteres não numéricos e limita a 11 dígitos
 */
export function normalizeCpf(value: unknown, fallbackValue: string = ""): string {
  if (typeof value !== "string") {
    return fallbackValue
  }
  return value.replace(/\D/g, "").slice(0, 11)
}

/**
 * Valida e normaliza os meses de referência
 * Garante que sempre haja pelo menos 1 mês selecionado
 */
export function normalizeMesesReferencia(
  input: Partial<BeneficiariosFiltersState>,
  fallback: BeneficiariosFiltersState
): string[] {
  let mesesReferencia: string[] = []
  
  if (input.mesesReferencia !== undefined) {
    mesesReferencia = normalizeToStringArray(input.mesesReferencia, [])
  } else if (input.mesReferencia) {
    // Migração: converter mesReferencia único para array
    mesesReferencia = [input.mesReferencia]
  } else if (fallback.mesesReferencia && fallback.mesesReferencia.length > 0) {
    mesesReferencia = fallback.mesesReferencia
  } else if (fallback.mesReferencia) {
    mesesReferencia = [fallback.mesReferencia]
  } else {
    // Se não houver nenhum valor, usar o mês atual como padrão
    mesesReferencia = [getMesReferenciaAtual()]
  }

  // Garantir que sempre haja pelo menos 1 mês
  if (mesesReferencia.length === 0) {
    mesesReferencia = [getMesReferenciaAtual()]
  }

  // Ordenar meses em ordem cronológica
  return [...mesesReferencia].sort()
}

/**
 * Normaliza mesReferencia (mantido para compatibilidade)
 * Usa o primeiro mês de mesesReferencia como fonte da verdade
 */
function normalizeMesReferencia(
  mesesReferencia: string[],
  input: Partial<BeneficiariosFiltersState>,
  fallback: BeneficiariosFiltersState
): string {
  // Se mesesReferencia já foi normalizado, usar o primeiro
  if (mesesReferencia.length > 0) {
    return mesesReferencia[0]
  }

  // Fallback para migração de dados antigos
  if (input.mesReferencia !== undefined) {
    const mesRef = typeof input.mesReferencia === "string" && input.mesReferencia.trim()
      ? input.mesReferencia
      : fallback.mesReferencia
    return mesRef
  }

  // Tentar migração de dataFim (legado)
  if ((input as any).dataFim) {
    try {
      const dataFim = (input as any).dataFim
      if (typeof dataFim === "string" && dataFim.trim()) {
        const date = new Date(dataFim)
        if (!Number.isNaN(date.getTime())) {
          const year = date.getFullYear()
          const month = String(date.getMonth() + 1).padStart(2, "0")
          return `${year}-${month}`
        }
      }
    } catch {
      // Ignorar erro de conversão
    }
  }

  return fallback.mesReferencia || getMesReferenciaAtual()
}

/**
 * Normaliza operadoras (suporta migração de string para array)
 */
function normalizeOperadoras(
  input: Partial<BeneficiariosFiltersState>,
  fallback: BeneficiariosFiltersState
): string[] {
  const operadorasValue =
    input.operadoras !== undefined
      ? input.operadoras
      : (input as any).operadora !== undefined
      ? [(input as any).operadora].filter(Boolean)
      : undefined
  return normalizeToStringArray(operadorasValue, fallback.operadoras)
}

/**
 * Normaliza e valida filtros completos
 */
export function normalizeFilters(
  input: Partial<BeneficiariosFiltersState>,
  fallback: BeneficiariosFiltersState
): BeneficiariosFiltersState {
  // Normalizar meses primeiro (é a base para outras validações)
  const mesesReferencia = normalizeMesesReferencia(input, fallback)
  const mesReferencia = normalizeMesReferencia(mesesReferencia, input, fallback)
  
  // Normalizar outros campos
  const operadoras = normalizeOperadoras(input, fallback)
  const entidades = normalizeToStringArray(input.entidades, fallback.entidades)
  const tipo = typeof input.tipo === "string" && input.tipo !== "" ? input.tipo : fallback.tipo
  const cpf = normalizeCpf(input.cpf, fallback.cpf)

  return {
    mesReferencia,
    mesesReferencia,
    operadoras,
    entidades,
    tipo,
    cpf,
  }
}

/**
 * Valida filtros contra listas de valores disponíveis
 * Remove valores inválidos e retorna os filtros validados
 */
export function validateFilters(
  filters: BeneficiariosFiltersState,
  options: {
    operadorasDisponiveis: string[]
    tiposDisponiveis: string[]
  }
): Partial<BeneficiariosFiltersState> {
  const updates: Partial<BeneficiariosFiltersState> = {}
  
  // Validar operadoras
  const operadorasValidas = filters.operadoras.filter(op => 
    options.operadorasDisponiveis.includes(op)
  )
  if (operadorasValidas.length !== filters.operadoras.length) {
    updates.operadoras = operadorasValidas
    // Se operadoras foram removidas, limpar entidades também
    updates.entidades = []
  }

  // Validar tipo
  if (filters.tipo && filters.tipo !== "Todos" && !options.tiposDisponiveis.includes(filters.tipo)) {
    updates.tipo = "Todos"
  }

  // Validar meses (garantir pelo menos 1)
  if (filters.mesesReferencia.length === 0) {
    updates.mesesReferencia = [getMesReferenciaAtual()]
    updates.mesReferencia = getMesReferenciaAtual()
  }

  return Object.keys(updates).length > 0 ? updates : {}
}

/**
 * Filtra operadoras para mostrar apenas ASSIM SAÚDE
 */
export function filterAssimSaude(operadoras: string[]): string[] {
  return operadoras.filter(
    (op: string) => 
      op.toUpperCase() === "ASSIM SAÚDE" || 
      op.toUpperCase() === "ASSIM SAUDE"
  )
}

export { STORAGE_KEY }

