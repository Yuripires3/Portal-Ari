import { NextRequest, NextResponse } from "next/server"
import { getDBConnection } from "@/lib/db"

// Gerar UUID v4 simples
function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0
    const v = c === 'x' ? r : (r & 0x3 | 0x8)
    return v.toString(16)
  })
}

/**
 * POST /api/bonificacoes/calculo/iniciar
 * 
 * Inicia uma nova execução de cálculo e grava descontos em staging.
 * 
 * Body:
 * - dt_referencia: Date (YYYY-MM-DD) - Data de referência do cálculo
 * - usuario_id: number - ID do usuário
 * - session_id: string - ID da sessão/UI
 * 
 * Retorna:
 * - run_id: UUID da execução
 * - preview: Array de descontos em staging
 */
export async function POST(request: NextRequest) {
  let connection: any = null

  try {
    const body = await request.json()
    const { dt_referencia, usuario_id, session_id } = body

    // Validações
    if (!dt_referencia || !usuario_id || !session_id) {
      return NextResponse.json(
        { error: "dt_referencia, usuario_id e session_id são obrigatórios" },
        { status: 400 }
      )
    }

    // Validar formato da data
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/
    if (!dateRegex.test(dt_referencia)) {
      return NextResponse.json(
        { error: "dt_referencia deve estar no formato YYYY-MM-DD" },
        { status: 400 }
      )
    }

    connection = await getDBConnection()

    // Garantir que as tabelas de apoio existam
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS locks_calculo (
        dt_referencia DATE PRIMARY KEY,
        locked_by BIGINT NOT NULL,
        locked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP NOT NULL,
        INDEX idx_locks_expires (expires_at)
      ) ENGINE=InnoDB COMMENT='Locks para controle de concorrência em cálculos'
    `)

    await connection.execute(`
      CREATE TABLE IF NOT EXISTS calculo_sessions (
        session_id VARCHAR(64) PRIMARY KEY,
        run_id VARCHAR(36) NOT NULL,
        usuario_id BIGINT NOT NULL,
        dt_referencia DATE NOT NULL,
        last_heartbeat TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_sessions_run_id (run_id),
        INDEX idx_sessions_heartbeat (last_heartbeat)
      ) ENGINE=InnoDB COMMENT='Sessões ativas de cálculo para controle de timeout'
    `)

    // Iniciar transação
    await connection.beginTransaction()

    try {
      // Remover lock expirado para esta data (permite retentar sem depender do cron)
      await connection.execute(
        `DELETE FROM locks_calculo WHERE dt_referencia = ? AND expires_at <= NOW()`,
        [dt_referencia]
      )

      // Lock por escopo (dt_referencia) usando SELECT ... FOR UPDATE
      // MySQL não tem pg_advisory_lock, então usamos tabela de locks
      const [lockResult]: any = await connection.execute(
        `SELECT * FROM locks_calculo 
         WHERE dt_referencia = ? 
         AND expires_at > NOW()
         FOR UPDATE`,
        [dt_referencia]
      )

      let needInsertLock = lockResult.length === 0

      if (lockResult.length > 0) {
        const lock = lockResult[0]
        // Comparar como string para evitar diferença número vs string (MySQL BIGINT, JSON number)
        const lockedByStr = String(lock.locked_by ?? "").trim()
        const usuarioIdStr = String(usuario_id ?? "").trim()
        const mesmoUsuario = lockedByStr !== "" && usuarioIdStr !== "" && lockedByStr === usuarioIdStr
        // Se há lock ativo de outro usuário, retornar erro
        if (!mesmoUsuario) {
          await connection.rollback()
          return NextResponse.json(
            { 
              error: "Cálculo já está em execução para esta data de referência",
              locked_by: lock.locked_by,
              locked_at: lock.locked_at
            },
            { status: 409 } // Conflict
          )
        }
        // Mesmo usuário: verificar se há sessão ativa (heartbeat recente)
        const [activeSessions]: any = await connection.execute(
          `SELECT 1 FROM calculo_sessions 
           WHERE dt_referencia = ? AND usuario_id = ? 
           AND last_heartbeat > DATE_SUB(NOW(), INTERVAL 2 MINUTE) 
           LIMIT 1`,
          [dt_referencia, usuario_id]
        )
        if (activeSessions.length === 0) {
          // Lock órfão (aba fechada/crash): remover e permitir novo cálculo
          await connection.execute(
            `DELETE FROM locks_calculo WHERE dt_referencia = ?`,
            [dt_referencia]
          )
          needInsertLock = true
        } else {
          // Sessão ativa: apenas renovar expiração do lock
          await connection.execute(
            `UPDATE locks_calculo 
             SET expires_at = DATE_ADD(NOW(), INTERVAL 2 HOUR)
             WHERE dt_referencia = ?`,
            [dt_referencia]
          )
        }
      }

      if (needInsertLock) {
        await connection.execute(
          `INSERT INTO locks_calculo (dt_referencia, locked_by, expires_at)
           VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 2 HOUR))
           ON DUPLICATE KEY UPDATE 
             locked_by = VALUES(locked_by),
             locked_at = NOW(),
             expires_at = DATE_ADD(NOW(), INTERVAL 2 HOUR)`,
          [dt_referencia, usuario_id]
        )
      }

      // Gerar run_id
      const run_id = generateUUID()

      // Registrar sessão ativa
      await connection.execute(
        `INSERT INTO calculo_sessions (session_id, run_id, usuario_id, dt_referencia, last_heartbeat)
         VALUES (?, ?, ?, ?, NOW())
         ON DUPLICATE KEY UPDATE 
           run_id = VALUES(run_id),
           last_heartbeat = NOW()`,
        [session_id, run_id, usuario_id, dt_referencia]
      )

      // Commit da preparação
      await connection.commit()

      // Retornar run_id (os descontos serão inseridos em staging pelo script Python)
      return NextResponse.json({
        success: true,
        run_id,
        message: "Execução iniciada. Os descontos serão inseridos em staging durante o cálculo."
      })

    } catch (error: any) {
      await connection.rollback()
      throw error
    }

  } catch (error: any) {
    console.error("Erro ao iniciar cálculo:", error)
    return NextResponse.json(
      {
        error: error.message || "Erro ao iniciar cálculo",
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

