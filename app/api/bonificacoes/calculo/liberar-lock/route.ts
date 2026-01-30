import { NextRequest, NextResponse } from "next/server"
import { getDBConnection } from "@/lib/db"

/**
 * POST /api/bonificacoes/calculo/liberar-lock
 *
 * Libera o lock da data de referência quando o usuário atual é o dono do lock.
 * Útil quando o cálculo travou ou a aba foi fechada sem cancelar.
 *
 * Body:
 * - dt_referencia: string (YYYY-MM-DD)
 * - usuario_id: number
 */
export async function POST(request: NextRequest) {
  let connection: any = null

  try {
    const body = await request.json()
    const { dt_referencia, usuario_id } = body

    if (!dt_referencia || usuario_id == null || usuario_id === "") {
      return NextResponse.json(
        { error: "dt_referencia e usuario_id são obrigatórios" },
        { status: 400 }
      )
    }

    const dateRegex = /^\d{4}-\d{2}-\d{2}$/
    if (!dateRegex.test(dt_referencia)) {
      return NextResponse.json(
        { error: "dt_referencia deve estar no formato YYYY-MM-DD" },
        { status: 400 }
      )
    }

    connection = await getDBConnection()

    const [rows]: any = await connection.execute(
      `SELECT locked_by FROM locks_calculo WHERE dt_referencia = ?`,
      [dt_referencia]
    )

    if (rows.length === 0) {
      return NextResponse.json({
        success: true,
        message: "Não há lock para esta data.",
        liberado: false
      })
    }

    const lockedByStr = String(rows[0].locked_by ?? "").trim()
    const usuarioIdStr = String(usuario_id ?? "").trim()
    if (lockedByStr !== usuarioIdStr) {
      return NextResponse.json(
        {
          error: "O lock pertence a outro usuário. Só o dono pode liberar.",
          locked_by: rows[0].locked_by
        },
        { status: 403 }
      )
    }

    await connection.execute(
      `DELETE FROM locks_calculo WHERE dt_referencia = ?`,
      [dt_referencia]
    )

    // Remover sessões órfãs desta data/usuário para não bloquear o próximo iniciar
    await connection.execute(
      `DELETE FROM calculo_sessions WHERE dt_referencia = ? AND usuario_id = ?`,
      [dt_referencia, usuario_id]
    )

    return NextResponse.json({
      success: true,
      message: "Lock liberado. Você pode iniciar o cálculo novamente.",
      liberado: true
    })
  } catch (error: any) {
    console.error("Erro ao liberar lock:", error)
    return NextResponse.json(
      {
        error: error.message || "Erro ao liberar lock",
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
