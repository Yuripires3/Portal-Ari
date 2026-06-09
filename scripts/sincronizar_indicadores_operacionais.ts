import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"
import { sincronizarIndicadoresOperacionais } from "../lib/indicadores/operational-indicators-service.ts"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const envPath = path.join(root, ".env")

if (fs.existsSync(envPath)) {
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

async function main() {
  await sincronizarIndicadoresOperacionais()
  console.log("Indicadores operacionais sincronizados.")
}

main().catch((error) => {
  console.error("Falha ao sincronizar indicadores:", error)
  process.exitCode = 1
})
