import { NextRequest, NextResponse } from "next/server"
import { getDBConnection } from "@/lib/db"

/**
 * POST /api/bonificacoes/calculo/cleanup-on-deploy
 *
 * Chamado após deploy para derrubar cálculos em andamento e limpar locks/sessões.
 * Protegido por token (DEPLOY_CLEANUP_SECRET ou CLEANUP_TOKEN).
 *
 * Faz:
 * - DELETE locks_calculo (todos)
 * - DELETE calculo_sessions (todos)
 * - DELETE registro_bonificacao_descontos WHERE status = 'staging'
 */
export async function POST(request: NextRequest) {
  const secret =
    process.env.DEPLOY_CLEANUP_SECRET || process.env.CLEANUP_TOKEN || "cleanup-secret"
  const authHeader = request.headers.get("authorization")
  const token = authHeader?.replace(/^Bearer\s+/i, "").trim()
  if (token !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let connection: any = null
  try {
    connection = await getDBConnection()

    const [delLocks]: any = await connection.execute("DELETE FROM locks_calculo")
    const [delSessions]: any = await connection.execute("DELETE FROM calculo_sessions")
    const [delStaging]: any = await connection.execute(
      "DELETE FROM registro_bonificacao_descontos WHERE status = ?",
      ["staging"]
    )

    const locksRemoved = delLocks?.affectedRows ?? 0
    const sessionsRemoved = delSessions?.affectedRows ?? 0
    const stagingRemoved = delStaging?.affectedRows ?? 0

    return NextResponse.json({
      success: true,
      message: "Cálculos e locks limpos após deploy.",
      locks_removidos: locksRemoved,
      sessoes_removidas: sessionsRemoved,
      staging_removidos: stagingRemoved,
    })
  } catch (error: any) {
    console.error("Erro no cleanup-on-deploy:", error)
    return NextResponse.json(
      {
        error: error.message || "Erro ao limpar cálculos",
        details: process.env.NODE_ENV === "development" ? error.stack : undefined,
      },
      { status: 500 }
    )
  } finally {
    if (connection) {
      await connection.end()
    }
  }
}
