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
  return await mysql.createConnection(config)
}

