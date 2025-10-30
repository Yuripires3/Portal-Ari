import bcrypt from "bcryptjs"

const BCRYPT_ROUNDS = 12

/**
 * Gera hash da senha usando bcrypt
 */
export async function hashPassword(password: string): Promise<string> {
  return await bcrypt.hash(password, BCRYPT_ROUNDS)
}

/**
 * Compara senha com hash
 */
export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return await bcrypt.compare(password, hash)
}

/**
 * Valida força da senha
 */
export function validatePasswordStrength(password: string): { valid: boolean; errors: string[] } {
  const errors: string[] = []

  if (password.length < 8) {
    errors.push("Senha deve ter no mínimo 8 caracteres")
  }

  if (!/[A-Z]/.test(password)) {
    errors.push("Senha deve conter pelo menos 1 letra maiúscula")
  }

  if (!/[a-z]/.test(password)) {
    errors.push("Senha deve conter pelo menos 1 letra minúscula")
  }

  if (!/[0-9]/.test(password)) {
    errors.push("Senha deve conter pelo menos 1 dígito")
  }

  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    errors.push("Senha deve conter pelo menos 1 caractere especial")
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}

/**
 * Valida formato de CPF (aceita com ou sem máscara)
 */
export function validateCPF(cpf: string): boolean {
  // Remove formatação
  const cleanCPF = cpf.replace(/\D/g, "")

  // Deve ter 11 dígitos
  if (cleanCPF.length !== 11) return false

  // Verifica se todos os dígitos são iguais
  if (/^(\d)\1{10}$/.test(cleanCPF)) return false

  // Validação do dígito verificador
  let sum = 0
  for (let i = 0; i < 9; i++) {
    sum += parseInt(cleanCPF.charAt(i)) * (10 - i)
  }
  let digit = 11 - (sum % 11)
  if (digit >= 10) digit = 0
  if (digit !== parseInt(cleanCPF.charAt(9))) return false

  sum = 0
  for (let i = 0; i < 10; i++) {
    sum += parseInt(cleanCPF.charAt(i)) * (11 - i)
  }
  digit = 11 - (sum % 11)
  if (digit >= 10) digit = 0
  if (digit !== parseInt(cleanCPF.charAt(10))) return false

  return true
}

/**
 * Normaliza CPF para formato CHAR(14) - mantém exatamente como recebido (com ou sem máscara)
 */
export function normalizeCPF(cpf: string): string {
  // Remove espaços e caracteres não permitidos, mantém apenas números e pontos/traço
  const normalized = cpf.trim().replace(/[^\d.\-]/g, "")
  
  // Se tem máscara, garante formato ###.###.###-##
  if (normalized.includes(".") || normalized.includes("-")) {
    const numbers = normalized.replace(/\D/g, "")
    if (numbers.length === 11) {
      return `${numbers.slice(0, 3)}.${numbers.slice(3, 6)}.${numbers.slice(6, 9)}-${numbers.slice(9)}`
    }
  }
  
  // Se não tem máscara, adiciona
  const numbers = normalized.replace(/\D/g, "")
  if (numbers.length === 11) {
    return `${numbers.slice(0, 3)}.${numbers.slice(3, 6)}.${numbers.slice(6, 9)}-${numbers.slice(9)}`
  }
  
  // Se já está formatado, retorna como está
  return normalized.padEnd(14, " ")
}

/**
 * Valida formato de email
 */
export function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email)
}

/**
 * Valida usuario_login (4-150 chars, alfanumérico + _/./-)
 */
export function validateUsuarioLogin(usuario: string): { valid: boolean; error?: string } {
  if (usuario.length < 4 || usuario.length > 150) {
    return { valid: false, error: "Usuário deve ter entre 4 e 150 caracteres" }
  }

  if (!/^[a-zA-Z0-9._-]+$/.test(usuario)) {
    return {
      valid: false,
      error: "Usuário deve conter apenas letras, números, pontos, underscores e hífens",
    }
  }

  return { valid: true }
}

/**
 * Valida área (enum)
 */
export function validateArea(area: string | null): boolean {
  if (area === null) return true
  return ["Operacoes", "Financeiro", "Faturamento", "TI", "Movimentacao"].includes(area)
}

