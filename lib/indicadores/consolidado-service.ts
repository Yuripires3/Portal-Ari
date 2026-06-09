import type { Connection, RowDataPacket } from "mysql2/promise"
import { INDICADORES_DEFINICOES, MESES_NUMEROS, TABELAS_INDICADORES } from "./constants"
import { aplicarCalculosIndicadores, criarMapaVazioMeses } from "./calculations"
import {
  extrairMesAno,
  mapearColunasTabela,
  parseNumero,
  type ColunasMapeadas,
} from "./column-mapping"
import { prioridadeOperadora } from "./operadora-display"
import type {
  ConsolidadoLinha,
  ConsolidadoOperadora,
  ConsolidadoResponse,
  IndicadorKey,
  MesNumero,
} from "./types"

type TableCache = {
  colunas: string[]
  mapa: ColunasMapeadas
}

async function listarColunas(connection: Connection, tabela: string): Promise<string[]> {
  const [rows] = await connection.execute<RowDataPacket[]>(`SHOW COLUMNS FROM \`${tabela}\``)
  return rows.map((r) => String(r.Field))
}

async function tabelaExiste(connection: Connection, tabela: string): Promise<boolean> {
  const [rows] = await connection.execute<RowDataPacket[]>("SHOW TABLES LIKE ?", [tabela])
  return rows.length > 0
}

function mesclarValor(
  destino: Partial<Record<IndicadorKey, number | null>>,
  key: IndicadorKey,
  valor: number | null
) {
  if (valor === null) return
  const atual = destino[key]
  destino[key] = atual === null || atual === undefined ? valor : atual + valor
}

function processarLinhasTabela(
  rows: RowDataPacket[],
  mapa: ColunasMapeadas,
  ano: number,
  acumulado: Map<string, Record<MesNumero, Partial<Record<IndicadorKey, number | null>>>>
) {
  if (!mapa.operadora) return

  for (const row of rows) {
    const operadora = String(row[mapa.operadora] ?? "").trim()
    if (!operadora) continue

    const periodo = extrairMesAno(row as Record<string, unknown>, mapa, ano)
    if (!periodo || periodo.ano !== ano) continue

    const mes = periodo.mes as MesNumero
    if (!acumulado.has(operadora)) {
      acumulado.set(operadora, criarMapaVazioMeses())
    }

    const porMes = acumulado.get(operadora)!
    const celula = porMes[mes]

    for (const [key, coluna] of Object.entries(mapa.indicadores) as [IndicadorKey, string][]) {
      mesclarValor(celula, key, parseNumero(row[coluna]))
    }
  }
}

async function carregarTabela(
  connection: Connection,
  tabela: string,
  ano: number,
  cache: Map<string, TableCache>,
  acumulado: Map<string, Record<MesNumero, Partial<Record<IndicadorKey, number | null>>>>
) {
  const existe = await tabelaExiste(connection, tabela)
  if (!existe) return

  let info = cache.get(tabela)
  if (!info) {
    const colunas = await listarColunas(connection, tabela)
    info = { colunas, mapa: mapearColunasTabela(colunas) }
    cache.set(tabela, info)
  }

  const whereParts: string[] = []
  const values: unknown[] = []

  if (info.mapa.ano) {
    whereParts.push(`\`${info.mapa.ano}\` = ?`)
    values.push(ano)
  } else if (info.mapa.dataReferencia) {
    whereParts.push(`YEAR(\`${info.mapa.dataReferencia}\`) = ?`)
    values.push(ano)
  }

  const where = whereParts.length > 0 ? `WHERE ${whereParts.join(" AND ")}` : ""
  const [rows] = await connection.execute<RowDataPacket[]>(
    `SELECT * FROM \`${tabela}\` ${where}`,
    values
  )

  processarLinhasTabela(rows, info.mapa, ano, acumulado)
}

function montarLinhas(
  porMes: Record<MesNumero, Partial<Record<IndicadorKey, number | null>>>
): ConsolidadoLinha[] {
  // Excel sempre exibe as 19 linhas de indicadores, mesmo sem valor no mês.
  return INDICADORES_DEFINICOES.map((def) => {
    const valores = {} as Record<MesNumero, number | null>

    for (const mes of MESES_NUMEROS) {
      const brutos = porMes[mes]
      const calculados = aplicarCalculosIndicadores(brutos)
      const valor = calculados[def.key]
      valores[mes] = valor === undefined ? null : valor
    }

    return {
      key: def.key,
      label: def.label,
      formato: def.formato,
      exibirVazioSeZero: def.exibirVazioSeZero,
      valores,
    }
  })
}

function obterBaseVidasReferencia(
  porMes: Record<MesNumero, Partial<Record<IndicadorKey, number | null>>>
): number {
  for (const mes of MESES_NUMEROS) {
    const calc = aplicarCalculosIndicadores(porMes[mes])
    if (calc.base_vidas && calc.base_vidas > 0) return calc.base_vidas
  }
  return 0
}

export async function buscarAnosDisponiveis(connection: Connection): Promise<number[]> {
  const anos = new Set<number>()
  const cache = new Map<string, TableCache>()

  for (const tabela of Object.values(TABELAS_INDICADORES)) {
    const existe = await tabelaExiste(connection, tabela)
    if (!existe) continue

    let info = cache.get(tabela)
    if (!info) {
      const colunas = await listarColunas(connection, tabela)
      info = { colunas, mapa: mapearColunasTabela(colunas) }
      cache.set(tabela, info)
    }

    if (info.mapa.ano) {
      const [rows] = await connection.execute<RowDataPacket[]>(
        `SELECT DISTINCT \`${info.mapa.ano}\` AS ano FROM \`${tabela}\` ORDER BY ano DESC`
      )
      for (const row of rows) {
        const ano = Number(row.ano)
        if (!Number.isNaN(ano)) anos.add(ano)
      }
    } else if (info.mapa.dataReferencia) {
      const [rows] = await connection.execute<RowDataPacket[]>(
        `SELECT DISTINCT YEAR(\`${info.mapa.dataReferencia}\`) AS ano FROM \`${tabela}\` ORDER BY ano DESC`
      )
      for (const row of rows) {
        const ano = Number(row.ano)
        if (!Number.isNaN(ano)) anos.add(ano)
      }
    }
  }

  return Array.from(anos).sort((a, b) => b - a)
}

export async function buscarConsolidado(
  connection: Connection,
  ano: number
): Promise<ConsolidadoResponse> {
  const cache = new Map<string, TableCache>()
  const acumulado = new Map<string, Record<MesNumero, Partial<Record<IndicadorKey, number | null>>>>()

  await Promise.all([
    carregarTabela(connection, TABELAS_INDICADORES.ativos, ano, cache, acumulado),
    carregarTabela(connection, TABELAS_INDICADORES.inativos, ano, cache, acumulado),
    carregarTabela(connection, TABELAS_INDICADORES.atendimentos, ano, cache, acumulado),
  ])

  const operadoras: ConsolidadoOperadora[] = Array.from(acumulado.entries())
    .sort(([nomeA, dadosA], [nomeB, dadosB]) => {
      const prioA = prioridadeOperadora(nomeA)
      const prioB = prioridadeOperadora(nomeB)
      if (prioA !== prioB) return prioA - prioB
      return obterBaseVidasReferencia(dadosB) - obterBaseVidasReferencia(dadosA)
    })
    .map(([operadora, porMes]) => ({
      operadora,
      linhas: montarLinhas(porMes),
    }))

  const mesesDisponiveis = MESES_NUMEROS.filter((mes) =>
    operadoras.some((op) => op.linhas.some((l) => l.valores[mes] !== null))
  )

  return { ano, operadoras, mesesDisponiveis }
}
