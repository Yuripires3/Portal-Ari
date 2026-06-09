import { NextRequest, NextResponse } from "next/server"
import { requireAdminApi } from "@/lib/api-auth"
import { getDBConnection } from "@/lib/db"
import type { IndicadorKey } from "@/lib/indicadores/types"

const CHAVES_CALCULADAS = new Set<IndicadorKey>([
  "base_vidas",
  "pct_cancelamento",
  "inadimplencia",
  "ticket_medio",
])

const CHAVES_EDITAVEIS = new Set<IndicadorKey>([
  "meta_orcada",
  "base_dental",
  "base_saude",
  "vidas_canceladas",
  "migracao_assim_assim",
  "migracao_assim_outras",
  "migracao_caberj_assim",
  "migracao_caberj_outras",
  "total_migracao",
  "cancelamento_liquido",
  "retencao",
  "cancel_inadimplencia",
  "cancel_solicitacao_cliente",
  "cancel_solicitado_ops",
  "exclusao_dependente",
  "falecimento",
  "outros",
  "faturamento_orcado",
  "faturamento_emitido",
  "faturamento_recebido",
  "vendas",
  "comissao_concessionarias",
  "bonificacao_corretores_supervisores",
])

interface AtualizarValorBody {
  ano?: unknown
  mes?: unknown
  operadora?: unknown
  indicadorKey?: unknown
  valor?: unknown
}

export async function PUT(request: NextRequest) {
  const guard = await requireAdminApi(request)
  if (!guard.ok) return guard.response

  let connection: Awaited<ReturnType<typeof getDBConnection>> | null = null

  try {
    const body = (await request.json()) as AtualizarValorBody
    const ano = Number(body.ano)
    const mes = Number(body.mes)
    const operadora = String(body.operadora ?? "").trim()
    const indicadorKey = String(body.indicadorKey ?? "") as IndicadorKey
    const valor = Number(body.valor)

    if (!Number.isInteger(ano) || ano < 2000 || ano > 2100) {
      return NextResponse.json({ error: "Ano invalido" }, { status: 400 })
    }
    if (!Number.isInteger(mes) || mes < 1 || mes > 12) {
      return NextResponse.json({ error: "Mes invalido" }, { status: 400 })
    }
    if (!operadora) {
      return NextResponse.json({ error: "Operadora obrigatoria" }, { status: 400 })
    }
    if (!CHAVES_EDITAVEIS.has(indicadorKey) || CHAVES_CALCULADAS.has(indicadorKey)) {
      return NextResponse.json({ error: "Indicador nao editavel" }, { status: 400 })
    }
    if (!Number.isFinite(valor)) {
      return NextResponse.json({ error: "Valor invalido" }, { status: 400 })
    }

    connection = await getDBConnection()
    await connection.beginTransaction()

    const [operadoraRows] = await connection.execute(
      `SELECT tipo, ordem_operadora
       FROM indicadores_consolidado_valores
       WHERE ano = ? AND operadora = ?
       ORDER BY id
       LIMIT 1
       FOR UPDATE`,
      [ano, operadora]
    )
    const operadoraDb = (
      operadoraRows as Array<{
        tipo: "operadora" | "consolidado"
        ordem_operadora: number
      }>
    )[0]

    if (!operadoraDb || operadoraDb.tipo !== "operadora") {
      await connection.rollback()
      return NextResponse.json(
        { error: "Registro de operadora nao encontrado ou nao editavel" },
        { status: 404 }
      )
    }

    await connection.execute(
      `INSERT INTO indicadores_consolidado_valores
        (ano, operadora, tipo, ordem_operadora, indicador_key, mes, valor, fonte)
       VALUES (?, ?, 'operadora', ?, ?, ?, ?, 'ajuste_manual')
       ON DUPLICATE KEY UPDATE
         valor = VALUES(valor),
         fonte = 'ajuste_manual',
         updated_at = CURRENT_TIMESTAMP`,
      [ano, operadora, operadoraDb.ordem_operadora, indicadorKey, mes, valor]
    )

    const [somaRows] = await connection.execute(
      `SELECT SUM(valor) AS total
       FROM indicadores_consolidado_valores
       WHERE ano = ?
         AND mes = ?
         AND indicador_key = ?
         AND tipo = 'operadora'
         AND operadora <> 'AESP Odonto'`,
      [ano, mes, indicadorKey]
    )
    const total = Number(
      (somaRows as Array<{ total: string | number | null }>)[0]?.total ?? 0
    )

    await connection.execute(
      `UPDATE indicadores_consolidado_valores
       SET valor = ?, fonte = 'banco_operacional', updated_at = CURRENT_TIMESTAMP
       WHERE ano = ?
         AND mes = ?
         AND indicador_key = ?
         AND tipo = 'consolidado'`,
      [total, ano, mes, indicadorKey]
    )

    await connection.commit()
    return NextResponse.json({
      ok: true,
      ano,
      mes,
      operadora,
      indicadorKey,
      valor,
    })
  } catch (error) {
    await connection?.rollback().catch(() => {})
    console.error("[Indicadores/Valores] Erro ao salvar:", error)
    return NextResponse.json({ error: "Erro ao salvar indicador" }, { status: 500 })
  } finally {
    await connection?.end()
  }
}
