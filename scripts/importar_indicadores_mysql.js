const fs = require("fs")
const path = require("path")
const mysql = require("mysql2/promise")

const ROOT = path.resolve(__dirname, "..")
const JSON_PATH = path.join(ROOT, "data", "indicadores-consolidado.json")
const MIGRATION_PATHS = [
  path.join(ROOT, "migrations", "002_create_indicadores_consolidado.sql"),
  path.join(ROOT, "migrations", "003_create_indicadores_competencias.sql"),
]

function carregarEnvLocal() {
  const envPath = path.join(ROOT, ".env")
  if (!fs.existsSync(envPath)) return

  for (const rawLine of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith("#")) continue

    const separator = line.indexOf("=")
    if (separator < 1) continue

    const key = line.slice(0, separator).trim()
    let value = line.slice(separator + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }

    if (process.env[key] === undefined) process.env[key] = value
  }
}

function getConfig() {
  const required = ["DB_HOST", "DB_USER", "DB_PASSWORD", "DB_NAME"]
  const missing = required.filter((key) => !process.env[key])
  if (missing.length > 0) {
    throw new Error(`Variaveis de banco ausentes: ${missing.join(", ")}`)
  }

  return {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    charset: "utf8mb4",
    connectTimeout: 30000,
    multipleStatements: true,
  }
}

function montarRegistros(data) {
  const registros = []
  const fonte = data.fonte || path.basename(JSON_PATH)

  for (const [anoTexto, anoData] of Object.entries(data.anos || {})) {
    const ano = Number(anoTexto)
    if (!Number.isInteger(ano)) continue

    for (const [ordem, bloco] of (anoData.operadoras || []).entries()) {
      const tipo =
        bloco.tipo === "consolidado" || String(bloco.operadora).toUpperCase() === "CONSOLIDADO"
          ? "consolidado"
          : "operadora"

      for (const [indicadorKey, meses] of Object.entries(bloco.indicadores || {})) {
        for (const [mesTexto, valor] of Object.entries(meses || {})) {
          const mes = Number(mesTexto)
          if (!Number.isInteger(mes) || mes < 1 || mes > 12) continue

          registros.push([
            ano,
            bloco.operadora,
            tipo,
            ordem,
            indicadorKey,
            mes,
            valor,
            fonte,
          ])
        }
      }
    }
  }

  return registros
}

async function main() {
  carregarEnvLocal()

  const data = JSON.parse(fs.readFileSync(JSON_PATH, "utf8"))
  const migrations = MIGRATION_PATHS.map((migrationPath) =>
    fs.readFileSync(migrationPath, "utf8")
  )
  const registros = montarRegistros(data)
  const anos = [...new Set(registros.map((row) => row[0]))].sort((a, b) => a - b)

  if (registros.length === 0) {
    throw new Error("Nenhum indicador encontrado para importar")
  }

  if (process.argv.includes("--dry-run")) {
    console.log(
      `Validacao concluida: ${registros.length} valores, anos ${anos.join(", ")}.`
    )
    return
  }

  const connection = await mysql.createConnection(getConfig())

  try {
    for (const migration of migrations) {
      await connection.query(migration)
    }
    const [competenciasFechadasRows] = await connection.query(
      `SELECT ano, mes
       FROM indicadores_competencias
       WHERE status = 'fechado'`
    )
    const competenciasFechadas = new Set(
      competenciasFechadasRows.map((row) => `${Number(row.ano)}-${Number(row.mes)}`)
    )
    const registrosImportar = registros.filter(
      (row) => !competenciasFechadas.has(`${row[0]}-${row[5]}`)
    )

    await connection.beginTransaction()

    const placeholdersAnos = anos.map(() => "?").join(", ")
    await connection.execute(
      `DELETE FROM indicadores_consolidado_valores
       WHERE ano IN (${placeholdersAnos})
         AND fonte NOT IN ('banco_operacional', 'ajuste_manual')
         AND NOT EXISTS (
           SELECT 1
           FROM indicadores_competencias competencia
           WHERE competencia.ano = indicadores_consolidado_valores.ano
             AND competencia.mes = indicadores_consolidado_valores.mes
             AND competencia.status = 'fechado'
         )`,
      anos
    )

    const chunkSize = 500
    for (let offset = 0; offset < registrosImportar.length; offset += chunkSize) {
      const chunk = registrosImportar.slice(offset, offset + chunkSize)
      const placeholders = chunk.map(() => "(?, ?, ?, ?, ?, ?, ?, ?)").join(", ")
      await connection.query(
        `INSERT INTO indicadores_consolidado_valores
          (ano, operadora, tipo, ordem_operadora, indicador_key, mes, valor, fonte)
         VALUES ${placeholders}
         ON DUPLICATE KEY UPDATE
           tipo = IF(fonte IN ('banco_operacional', 'ajuste_manual'), tipo, VALUES(tipo)),
           ordem_operadora = IF(
             fonte IN ('banco_operacional', 'ajuste_manual'),
             ordem_operadora,
             VALUES(ordem_operadora)
           ),
           valor = IF(fonte IN ('banco_operacional', 'ajuste_manual'), valor, VALUES(valor)),
           fonte = IF(fonte IN ('banco_operacional', 'ajuste_manual'), fonte, VALUES(fonte)),
           updated_at = CURRENT_TIMESTAMP`,
        chunk.flat()
      )
    }

    await connection.commit()
    const [totais] = await connection.query(
      `SELECT ano, COUNT(*) AS total
       FROM indicadores_consolidado_valores
       WHERE ano IN (${placeholdersAnos})
       GROUP BY ano
       ORDER BY ano`,
      anos
    )
    console.log(
      `Importacao concluida: ${registrosImportar.length} valores atualizados; ` +
        `${registros.length - registrosImportar.length} valores de competencias fechadas preservados.`
    )
    console.table(totais)
  } catch (error) {
    await connection.rollback().catch(() => {})
    throw error
  } finally {
    await connection.end()
  }
}

main().catch((error) => {
  console.error("Falha ao importar indicadores:", error.message)
  process.exitCode = 1
})
