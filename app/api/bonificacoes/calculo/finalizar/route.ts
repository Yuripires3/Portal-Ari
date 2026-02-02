import { NextRequest, NextResponse } from "next/server"
import { getDBConnection } from "@/lib/db"

/**
 * POST /api/bonificacoes/calculo/finalizar
 * 
 * Finaliza uma execução de cálculo, promovendo descontos de staging para finalizado.
 * Implementa lógica de compensação (ledger) para ajustes.
 * 
 * Body:
 * - run_id: string - UUID da execução
 * - usuario_id: number - ID do usuário que está finalizando
 * 
 * Lógica:
 * 1. Para cada desconto em staging do run_id:
 *    - Se não existe finalizado ativo: promove para finalizado
 *    - Se existe e valor igual: idempotente, descarta staging
 *    - Se existe e valor diferente: cria compensação + novo lançamento
 * 2. Remove staging do run_id
 */
export async function POST(request: NextRequest) {
  let connection: any = null

  try {
    const body = await request.json()
    const { run_id, usuario_id } = body

    if (!run_id || !usuario_id) {
      return NextResponse.json(
        { error: "run_id e usuario_id são obrigatórios" },
        { status: 400 }
      )
    }

    connection = await getDBConnection()

    // Iniciar transação com isolamento REPEATABLE READ
    await connection.execute("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ")
    await connection.beginTransaction()

    try {
      // Buscar todos os descontos em staging do run_id
      const [stagingDescontos]: any = await connection.execute(
        `SELECT id, dt_referencia, chave_negocio, valor, cpf, nome, dt_movimentacao, 
                dt_apuracao, tipo_movimentacao, proposta, dt_exclusao_proposta, motivo, origem
         FROM registro_bonificacao_descontos
         WHERE run_id = ? AND status = 'staging'
         ORDER BY id`,
        [run_id]
      )

      const stats = {
        total_promovidos: 0,
        total_compensados: 0,
        total_ignorados: 0,
        difs: [] as any[]
      }

      // Se não há descontos em staging, só encerrar sessão e liberar lock
      if (stagingDescontos.length === 0) {
        const [sessionInfo]: any = await connection.execute(
          `SELECT dt_referencia FROM calculo_sessions WHERE run_id = ?`,
          [run_id]
        )
        if (sessionInfo.length > 0) {
          await connection.execute(
            `DELETE FROM locks_calculo WHERE dt_referencia = ?`,
            [sessionInfo[0].dt_referencia]
          )
        }
        await connection.execute(
          `DELETE FROM calculo_sessions WHERE run_id = ?`,
          [run_id]
        )
        await connection.commit()
        return NextResponse.json({
          success: true,
          message: "Nenhum desconto a registrar. Sessão encerrada.",
          stats
        })
      }

      // Processar cada desconto em staging
      for (const staging of stagingDescontos) {
        const { id: stagingId, dt_referencia, chave_negocio, valor: valorStaging } = staging

        // Verificar se existe desconto finalizado ativo para mesma chave
        // Usar SELECT ... FOR UPDATE para garantir exclusão mútua na transação
        const [existentes]: any = await connection.execute(
          `SELECT id, valor, is_active
           FROM registro_bonificacao_descontos
           WHERE dt_referencia = ?
             AND chave_negocio = ?
             AND status = 'finalizado'
             AND is_active = TRUE
           LIMIT 1
           FOR UPDATE`,
          [dt_referencia, chave_negocio]
        )

        if (existentes.length === 0) {
          // Não existe finalizado: promover staging para finalizado
          await connection.execute(
            `UPDATE registro_bonificacao_descontos
             SET status = 'finalizado',
                 is_active = TRUE,
                 finalizado_at = NOW(),
                 usuario_id = ?
             WHERE id = ?`,
            [usuario_id, stagingId]
          )
          stats.total_promovidos++

        } else {
          const existente = existentes[0]
          const valorExistente = parseFloat(String(existente.valor || 0))
          const valorStagingNum = parseFloat(String(valorStaging || 0))

          if (Math.abs(valorExistente - valorStagingNum) < 0.01) {
            // Valores iguais: idempotente, apenas descartar staging
            await connection.execute(
              `UPDATE registro_bonificacao_descontos
               SET status = 'cancelado',
                   canceled_at = NOW(),
                   is_active = FALSE
               WHERE id = ?`,
              [stagingId]
            )
            stats.total_ignorados++

          } else {
            // Valores diferentes: criar compensação (ledger)
            const idExistente = existente.id

            // 1. Criar lançamento de compensação (negativo)
            const [compensacaoResult]: any = await connection.execute(
              `INSERT INTO registro_bonificacao_descontos
               (run_id, session_id, usuario_id, dt_referencia, status, is_active, chave_negocio,
                valor, cpf, nome, dt_movimentacao, dt_apuracao, tipo_movimentacao, proposta,
                dt_exclusao_proposta, motivo, origem, parent_id, finalizado_at, created_at)
               VALUES (?, ?, ?, ?, 'finalizado', TRUE, ?,
                       ?, ?, ?, ?, ?, ?, ?,
                       ?, ?, ?, ?, NOW(), NOW())`,
              [
                run_id,
                null, // session_id não necessário para compensação
                usuario_id,
                dt_referencia,
                chave_negocio,
                -valorExistente, // Valor negativo para compensar
                staging.cpf,
                staging.nome,
                staging.dt_movimentacao,
                staging.dt_apuracao,
                staging.tipo_movimentacao,
                staging.proposta,
                staging.dt_exclusao_proposta,
                'Ajuste compensatório',
                staging.origem || 'sistema',
                idExistente, // parent_id aponta para o lançamento anterior
              ]
            )

            // 2. Promover staging para finalizado com novo valor
            await connection.execute(
              `UPDATE registro_bonificacao_descontos
               SET status = 'finalizado',
                   is_active = TRUE,
                   finalizado_at = NOW(),
                   usuario_id = ?
               WHERE id = ?`,
              [usuario_id, stagingId]
            )

            // 3. Desativar lançamento anterior
            await connection.execute(
              `UPDATE registro_bonificacao_descontos
               SET is_active = FALSE
               WHERE id = ?`,
              [idExistente]
            )

            stats.total_compensados++
            stats.difs.push({
              chave_negocio,
              valor_anterior: valorExistente,
              valor_novo: valorStagingNum,
              diferenca: valorStagingNum - valorExistente
            })
          }
        }
      }

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
      }

      // Remover sessão
      await connection.execute(
        `DELETE FROM calculo_sessions WHERE run_id = ?`,
        [run_id]
      )

      await connection.commit()

      return NextResponse.json({
        success: true,
        message: "Cálculo finalizado com sucesso",
        stats
      })

    } catch (error: any) {
      await connection.rollback()
      throw error
    }

  } catch (error: any) {
    console.error("Erro ao finalizar cálculo:", error)
    return NextResponse.json(
      {
        error: error.message || "Erro ao finalizar cálculo",
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

