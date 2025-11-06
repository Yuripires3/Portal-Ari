import mysql from "mysql2/promise"

export interface DBConfig {
  host: string
  port: number
  user: string
  password: string
  database: string
}

export function getDBConfig(): DBConfig {
  if (!process.env.DB_HOST || !process.env.DB_USER || !process.env.DB_PASSWORD || !process.env.DB_NAME) {
    throw new Error("Variáveis de ambiente do banco não configuradas")
  }

  return {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  }
}

export async function getDBConnection() {
  const config = getDBConfig()
  
  // Log de debug para diagnóstico (apenas em desenvolvimento ou se DB_DEBUG estiver definido)
  if (process.env.DB_DEBUG === 'true' || process.env.NODE_ENV !== 'production') {
    console.log('[DB] Tentando conectar:', {
      host: config.host,
      port: config.port,
      user: config.user,
      database: config.database,
      // Não logar senha por segurança
    })
  }
  
  // Adicionar timeout maior para conexões remotas
  const connectionConfig = {
    ...config,
    connectTimeout: 30000, // 30 segundos
    acquireTimeout: 30000,
  }
  
  return await mysql.createConnection(connectionConfig)
}

/**
 * Retorna o filtro SQL para descontos finalizados e ativos.
 * OTIMIZAÇÃO: Assume que as colunas de staging sempre existem (criadas via migration).
 */
export function getDescontosStatusFilter(): string {
  return "AND status = 'finalizado' AND is_active = TRUE"
}

/**
 * @deprecated Use getDescontosStatusFilter() diretamente - as colunas sempre existem
 * Mantido apenas para compatibilidade temporária
 */
export async function hasStagingFields(connection: any): Promise<boolean> {
  return true // Sempre true - colunas criadas via migration
}

