/**
 * Helper de permissões baseado na classificação do usuário
 */

type UserClassification = "ADMIN" | "USUARIO" | "COMERCIAL" | "admin" | "usuario" | "comercial"

interface User {
  classificacao?: UserClassification | string
  role?: "admin" | "user"
  id?: string
  cpf?: string
  usuario_login?: string
  nome?: string
  email?: string
  area?: string | null
}

/**
 * Normaliza a classificação do usuário para maiúsculas
 */
export function normalizeClassification(user: User | null | undefined): UserClassification | null {
  if (!user) return null
  
  // Prioriza classificacao sobre role
  const classification = user.classificacao || user.role
  if (!classification) return null
  
  const normalized = String(classification).toUpperCase()
  
  // Mapeia role para classificacao se necessário
  if (normalized === "ADMIN") {
    return "ADMIN"
  } else if (normalized === "USER" || normalized === "USUARIO") {
    return "USUARIO"
  } else if (normalized === "COMERCIAL") {
    return "COMERCIAL"
  }
  
  // Fallback: assume USUARIO se não reconhecer
  return normalized as UserClassification || "USUARIO"
}

/** Acesso total ao portal (classificação ADMIN ou role admin). */
export function isAdmin(user: User | null | undefined): boolean {
  if (!user) return false
  const role = String(user.role || "").toLowerCase()
  const classificacao = String(user.classificacao || "").toUpperCase()
  return role === "admin" || classificacao === "ADMIN"
}

/**
 * Verifica se o usuário pode editar regras (ADMIN ou USUARIO)
 */
export function canEditRules(user: User | null | undefined): boolean {
  const classification = normalizeClassification(user)
  return classification === "ADMIN" || classification === "USUARIO"
}

/**
 * Verifica se o usuário pode cadastrar regras (ADMIN ou USUARIO)
 */
export function canCreateRules(user: User | null | undefined): boolean {
  return canEditRules(user)
}

/**
 * Verifica se o usuário pode excluir regras (ADMIN ou USUARIO)
 */
export function canDeleteRules(user: User | null | undefined): boolean {
  return canEditRules(user)
}

/**
 * Verifica se o usuário pode importar regras em lote (ADMIN ou USUARIO)
 */
export function canImportRules(user: User | null | undefined): boolean {
  return canEditRules(user)
}

