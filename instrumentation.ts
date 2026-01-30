/**
 * Executado uma vez quando o servidor Next.js inicia (ex.: após deploy).
 * Limpa locks e sessões de cálculo para que nenhum cálculo fique "travado"
 * e usuários possam iniciar novos cálculos na nova versão.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return

  try {
    const { getDBConnection } = await import("@/lib/db")
    const conn = await getDBConnection()
    try {
      await conn.execute("DELETE FROM locks_calculo")
      await conn.execute("DELETE FROM calculo_sessions")
      await conn.execute(
        "DELETE FROM registro_bonificacao_descontos WHERE status = ?",
        ["staging"]
      )
      console.log("[instrumentation] Cálculos e locks limpos ao subir a aplicação.")
    } finally {
      await conn.end()
    }
  } catch (e) {
    // Em build ou sem DB configurado, ignora
    if (process.env.NODE_ENV === "production") {
      console.warn("[instrumentation] Limpeza ao subir falhou (ignorado):", (e as Error)?.message)
    }
  }
}
