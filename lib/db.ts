import mysql from "mysql2/promise"

interface DBConfig {
  host: string
  port: number
  user: string
  password: string
  database: string
}

const DEFAULT_APP_TIMEZONE = process.env.APP_TIMEZONE || process.env.TZ || "America/Sao_Paulo"
const DEFAULT_MYSQL_OFFSET = process.env.DB_TIMEZONE_OFFSET || "-03:00"
// Usar offset ao invés de nome de timezone para evitar erro se timezone tables não estiverem carregadas
const DEFAULT_SESSION_TIMEZONE = process.env.DB_SESSION_TIMEZONE || DEFAULT_MYSQL_OFFSET

if (!process.env.TZ) {
  process.env.TZ = DEFAULT_APP_TIMEZONE
}

function getDBConfig(): DBConfig {
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

async function configureConnectionTimezone(connection: mysql.Connection) {
  // Tentar aplicar o timezone sem interromper a requisição
  try {
    if (DEFAULT_SESSION_TIMEZONE) {
      await connection.query("SET time_zone = ?", [DEFAULT_SESSION_TIMEZONE])
      return
    }
  } catch (error) {
    // Se o timezone nomeado não estiver disponível (ex: tabelas de timezone não carregadas)
    if (process.env.DB_DEBUG === 'true' || process.env.NODE_ENV !== 'production') {
      console.warn('[DB] Falha ao aplicar timezone nomeado, tentando fallback:', error)
    }
  }

  try {
    await connection.query("SET time_zone = ?", [DEFAULT_MYSQL_OFFSET])
  } catch (error) {
    console.error('[DB] Não foi possível configurar time_zone na sessão MySQL:', error)
  }
}

export async function getDBConnection() {
  const config = getDBConfig()
  
  // Log de debug para diagnóstico (apenas em desenvolvimento ou se DB_DEBUG estiver definido)
  // Adicionar timeout maior para conexões remotas
  // NOTA: acquireTimeout não é válido para createConnection(), apenas para createPool()
  const connectionConfig = {
    ...config,
    connectTimeout: 30000, // 30 segundos
    timezone: DEFAULT_MYSQL_OFFSET,
    dateStrings: true,
  }
  
  const connection = await mysql.createConnection(connectionConfig)
  await configureConnectionTimezone(connection)
  return connection
}

/**
 * Retorna o filtro SQL para descontos finalizados e ativos.
 * OTIMIZAÇÃO: Assume que as colunas de staging sempre existem (criadas via migration).
 */
export function getDescontosStatusFilter(): string {
  return "AND status = 'finalizado' AND is_active = TRUE"
}

