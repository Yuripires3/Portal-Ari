import { NextRequest, NextResponse } from "next/server"
import { getDBConnection } from "@/lib/db"
import { getRequestAuthUser } from "@/lib/api-auth"

/**
 * POST /api/bonificacoes/calculo/cancelar
 * 
 * Cancela uma execução de cálculo, marcando descontos em staging como cancelados.
 * NUNCA toca em registros finalizados.
 * 
 * Body:
 * - run_id: string - UUID da execução
 */
export async function POST(request: NextRequest) {
  let connection: any = null

  try {
    const auth = await getRequestAuthUser(request)
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: 401 })
    }

    const body = await request.json()
    const { run_id, force } = body

    if (!run_id) {
      return NextResponse.json(
        { error: "run_id é obrigatório" },
        { status: 400 }
      )
    }

    connection = await getDBConnection()

    // Iniciar transação
    await connection.beginTransaction()

    try {
      const [runSessionRows]: any = await connection.execute(
        `SELECT usuario_id FROM calculo_sessions WHERE run_id = ? LIMIT 1`,
        [run_id]
      )

      let ownerId = runSessionRows[0]?.usuario_id
      if (ownerId == null) {
        const [runStagingRows]: any = await connection.execute(
          `SELECT usuario_id FROM registro_bonificacao_descontos
           WHERE run_id = ? AND status = 'staging' AND usuario_id IS NOT NULL
           LIMIT 1`,
          [run_id]
        )
        ownerId = runStagingRows[0]?.usuario_id
      }
      const authUserId = String(auth.userId ?? "")
      const isOwner = ownerId != null && String(ownerId) === authUserId
      const forceByAdmin = Boolean(force) && Boolean(auth.isAdmin)

      if (!isOwner && !forceByAdmin) {
        await connection.rollback()
        return NextResponse.json(
          { error: "Sem permissão para cancelar esta execução. Apenas o dono ou admin." },
          { status: 403 }
        )
      }

      // Guardar data de referência Antes de remover (usado para liberar lock se sessão não existir)
      const [dtReferenciaInfo]: any = await connection.execute(
        `SELECT DISTINCT dt_referencia 
         FROM registro_bonificacao_descontos
         WHERE run_id = ? AND status = 'staging'
         LIMIT 1`,
        [run_id]
      )

      // Remover registros em staging do run_id
      const [result]: any = await connection.execute(
        `DELETE FROM registro_bonificacao_descontos
         WHERE run_id = ?
           AND status = 'staging'`,
        [run_id]
      )

      const totalRemovidos = result.affectedRows || 0

      // Liberar lock
      const [sessionInfo]: any = await connection.execute(
        `SELECT dt_referencia FROM calculo_sessions WHERE run_id = ?`,
        [run_id]
      )

      if (sessionInfo.length > 0) {
        await connection.execute(
          `DELETE FROM locks_calculo WHERE dt_referencia = ?`,
          [sessionInfo[0].dt_referencia]
        )
      } else if (dtReferenciaInfo.length > 0) {
        await connection.execute(
          `DELETE FROM locks_calculo WHERE dt_referencia = ?`,
          [dtReferenciaInfo[0].dt_referencia]
        )
      }

      // Remover sessão
      await connection.execute(
        `DELETE FROM calculo_sessions WHERE run_id = ?`,
        [run_id]
      )

      await connection.commit()

      return NextResponse.json({
        success: true,
        message: forceByAdmin
          ? `${totalRemovidos} registro(s) removido(s). Execução cancelada pelo admin.`
          : `${totalRemovidos} registro(s) de desconto removido(s)`,
        total_removidos: totalRemovidos
      })

    } catch (error: any) {
      await connection.rollback()
      throw error
    }

  } catch (error: any) {
    console.error("Erro ao cancelar cálculo:", error)
    return NextResponse.json(
      {
        error: error.message || "Erro ao cancelar cálculo",
        details: process.env.NODE_ENV === "development" ? error.stack : undefined
      },
      { status: 500 }
    )
  } finally {
    if (connection) {
      await connection.end()
    }
  }
}

