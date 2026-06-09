import { getDBConnection } from "@/lib/db"
import {
  buscarAnosDisponiveisEstaticos,
  buscarConsolidadoEstatico,
  montarConsolidadoDeOperadoras,
  type IndicadoresRawOperadora,
} from "./static-data-service"
import type {
  ConsolidadoResponse,
  IndicadoresCompetencia,
  IndicadorKey,
  MesNumero,
  StatusCompetencia,
} from "./types"
import { sincronizarIndicadoresOperacionais } from "./operational-indicators-service"

interface IndicadorDbRow {
  operadora: string
  tipo: "operadora" | "consolidado"
  ordem_operadora: number
  indicador_key: IndicadorKey
  mes: number
  valor: string | number | null
}

interface CompetenciaDbRow {
  mes: number
  status: StatusCompetencia
  atualizado_em: string | null
  fechado_em: string | null
}

interface BaseAnteriorDbRow {
  operadora: string
  indicador_key: "base_vidas" | "base_saude" | "base_dental"
  valor: string | number | null
}

function registrarFallback(error: unknown, operacao: string) {
  console.warn(
    `[Indicadores] Falha ao ${operacao} no MySQL; usando dados estaticos:`,
    error instanceof Error ? error.message : error
  )
}

async function tentarAtualizarSnapshot() {
  try {
    await sincronizarIndicadoresOperacionais()
  } catch (error) {
    console.warn(
      "[Indicadores] Falha ao atualizar o snapshot; consultando a ultima versao salva:",
      error instanceof Error ? error.message : error
    )
  }
}

function montarCompetencias(rows: CompetenciaDbRow[]): IndicadoresCompetencia[] {
  return rows
    .filter((row) => row.mes >= 1 && row.mes <= 12)
    .map((row) => ({
      mes: row.mes as MesNumero,
      status: row.status,
      atualizadoEm: row.atualizado_em,
      fechadoEm: row.fechado_em,
    }))
}

function aplicarControleCompetencias(
  dados: ConsolidadoResponse,
  competencias: IndicadoresCompetencia[]
): ConsolidadoResponse {
  if (competencias.length === 0) return dados

  const ultimoMesControlado = Math.max(...competencias.map((item) => item.mes))
  return {
    ...dados,
    mesesDisponiveis: dados.mesesDisponiveis.filter((mes) => mes <= ultimoMesControlado),
    competencias,
  }
}

function montarBasesDezembroAnterior(rows: BaseAnteriorDbRow[]): Map<string, number | null> {
  const acumulado = new Map<
    string,
    { baseVidas: number | null; componentes: number; temComponente: boolean }
  >()

  for (const row of rows) {
    const atual = acumulado.get(row.operadora) ?? {
      baseVidas: null,
      componentes: 0,
      temComponente: false,
    }
    const valor = row.valor === null ? null : Number(row.valor)

    if (row.indicador_key === "base_vidas") {
      atual.baseVidas = valor
    } else if (valor !== null && Number.isFinite(valor)) {
      atual.componentes += valor
      atual.temComponente = true
    }
    acumulado.set(row.operadora, atual)
  }

  return new Map(
    [...acumulado].map(([operadora, valores]) => [
      operadora,
      valores.baseVidas ?? (valores.temComponente ? valores.componentes : null),
    ])
  )
}

export async function buscarAnosDisponiveis(): Promise<number[]> {
  let connection: Awaited<ReturnType<typeof getDBConnection>> | null = null

  try {
    await tentarAtualizarSnapshot()
    connection = await getDBConnection()
    const [rows] = await connection.execute(
      `SELECT DISTINCT ano
       FROM indicadores_consolidado_valores
       ORDER BY ano DESC`
    )
    const anos = (rows as Array<{ ano: number | string }>).map((row) => Number(row.ano))
    return anos.length > 0 ? anos : buscarAnosDisponiveisEstaticos()
  } catch (error) {
    registrarFallback(error, "listar anos")
    return buscarAnosDisponiveisEstaticos()
  } finally {
    await connection?.end()
  }
}

export async function buscarConsolidado(ano: number): Promise<ConsolidadoResponse> {
  let connection: Awaited<ReturnType<typeof getDBConnection>> | null = null

  try {
    await tentarAtualizarSnapshot()
    connection = await getDBConnection()
    const [rows] = await connection.execute(
      `SELECT operadora, tipo, ordem_operadora, indicador_key, mes, valor
       FROM indicadores_consolidado_valores
       WHERE ano = ?
       ORDER BY ordem_operadora, id`,
      [ano]
    )
    const [competenciaRows] = await connection.execute(
      `SELECT mes, status, atualizado_em, fechado_em
       FROM indicadores_competencias
       WHERE ano = ?
       ORDER BY mes`,
      [ano]
    )
    const [baseAnteriorRows] = await connection.execute(
      `SELECT operadora, indicador_key, valor
       FROM indicadores_consolidado_valores
       WHERE ano = ?
         AND mes = 12
         AND indicador_key IN ('base_vidas', 'base_saude', 'base_dental')`,
      [ano - 1]
    )

    const valores = rows as IndicadorDbRow[]
    if (valores.length === 0) return buscarConsolidadoEstatico(ano)

    const porOperadora = new Map<string, IndicadoresRawOperadora>()

    for (const row of valores) {
      let bloco = porOperadora.get(row.operadora)
      if (!bloco) {
        bloco = {
          operadora: row.operadora,
          tipo: row.tipo,
          indicadores: {},
        }
        porOperadora.set(row.operadora, bloco)
      }

      const meses = bloco.indicadores[row.indicador_key] ?? {}
      meses[String(row.mes)] = row.valor === null ? null : Number(row.valor)
      bloco.indicadores[row.indicador_key] = meses
    }

    const dados = montarConsolidadoDeOperadoras(
      ano,
      [...porOperadora.values()],
      montarBasesDezembroAnterior(baseAnteriorRows as BaseAnteriorDbRow[])
    )
    return aplicarControleCompetencias(
      dados,
      montarCompetencias(competenciaRows as CompetenciaDbRow[])
    )
  } catch (error) {
    registrarFallback(error, `carregar o ano ${ano}`)
    return buscarConsolidadoEstatico(ano)
  } finally {
    await connection?.end()
  }
}
