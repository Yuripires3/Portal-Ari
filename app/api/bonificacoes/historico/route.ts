import { NextRequest, NextResponse } from "next/server"
import { getDBConnection } from "@/lib/db"

export async function GET(request: NextRequest) {
  let connection: any = null
  
  try {
    // Verificar variáveis de ambiente
    if (!process.env.DB_HOST || !process.env.DB_USER || !process.env.DB_PASSWORD || !process.env.DB_NAME) {
      return NextResponse.json(
        { error: "Variáveis de ambiente não configuradas" },
        { status: 500 }
      )
    }

    // Extrair parâmetros
    const searchParams = request.nextUrl.searchParams
    
    // Se for uma requisição para buscar valores únicos
    const action = searchParams.get("action")
    if (action === "getTiposPremiado" || action === "getTiposCartao" || action === "getPremiacoes" || action === "getTiposPremiacao") {
      let tiposConnection: any = null
      try {
        tiposConnection = await getDBConnection()
        
        // Para premiacao, precisamos converter para string pois pode ser numérico
        if (action === "getPremiacoes") {
          const [tipos]: any = await tiposConnection.execute(
            `SELECT premiacao, MAX(dt_pagamento) as ultima_data 
             FROM unificado_bonificacao_comercial 
             WHERE premiacao IS NOT NULL 
             GROUP BY premiacao 
             ORDER BY ultima_data DESC, premiacao ASC`
          )
          return NextResponse.json({
            premiacoes: tipos.map((row: any) => String(row.premiacao)).filter(Boolean)
          })
        }
        
        let fieldName = ""
        if (action === "getTiposPremiado" || action === "getTiposPremiacao") fieldName = "tipo_premiado"
        else if (action === "getTiposCartao") fieldName = "tipo_cartao"
        
        const [tipos]: any = await tiposConnection.execute(
          `SELECT ${fieldName}, MAX(dt_pagamento) as ultima_data 
           FROM unificado_bonificacao_comercial 
           WHERE ${fieldName} IS NOT NULL AND ${fieldName} != '' 
           GROUP BY ${fieldName} 
           ORDER BY ultima_data DESC, ${fieldName} ASC`
        )
        
        const resultKey = action === "getTiposPremiado" ? "tipos" : 
                         action === "getTiposCartao" ? "tiposCartao" : "tiposPremiacao"
        
        return NextResponse.json({
          [resultKey]: tipos.map((row: any) => row[fieldName]).filter(Boolean)
        })
      } catch (error: any) {
        console.error(`Erro ao buscar ${action}:`, error)
        return NextResponse.json(
          { error: error.message || `Erro ao buscar ${action}` },
          { status: 500 }
        )
      } finally {
        if (tiposConnection) {
          await tiposConnection.end()
        }
      }
    }

    // Criar conexão
    connection = await getDBConnection()
    
    const cpf = searchParams.get("cpf")
    const nome = searchParams.get("nome")
    const dt_pagamento_inicio = searchParams.get("dt_pagamento_inicio")
    const tipo_premiado = searchParams.get("tipo_premiado")
    const page = parseInt(searchParams.get("page") || "1")
    const pageSize = Math.min(parseInt(searchParams.get("pageSize") || "20"), 100)

    // Construir WHERE
    const whereConditions: string[] = []
    const whereValues: any[] = []

    if (cpf) {
      // Normalizar CPF removendo formatação (pontos e traços) antes de buscar
      const normalizedCpf = cpf.replace(/\D/g, "")
      // Remover formatação do CPF no banco antes de comparar
      whereConditions.push("REPLACE(REPLACE(REPLACE(ubc.cpf, '.', ''), '-', ''), ' ', '') LIKE ?")
      whereValues.push(`%${normalizedCpf}%`)
    }
    if (nome) {
      whereConditions.push("ubc.nome LIKE ?")
      whereValues.push(`%${nome}%`)
    }
    if (dt_pagamento_inicio) {
      whereConditions.push("ubc.dt_pagamento >= ?")
      whereValues.push(dt_pagamento_inicio)
    }
    if (tipo_premiado) {
      whereConditions.push("ubc.tipo_premiado = ?")
      whereValues.push(tipo_premiado)
    }

    const whereClause = whereConditions.length > 0 
      ? `WHERE ${whereConditions.join(" AND ")}` 
      : ""

    // Verificar se a tabela existe primeiro
    try {
      const [tableCheck]: any = await connection.execute(
        `SHOW TABLES LIKE 'unificado_bonificacao_comercial'`
      )
      if (tableCheck.length === 0) {
        return NextResponse.json(
          { error: "Tabela 'unificado_bonificacao_comercial' não encontrada no banco de dados" },
          { status: 404 }
        )
      }
    } catch (tableError: any) {
      console.error("Erro ao verificar tabela:", tableError)
    }

    // Contar total de registros
    const [countResult]: any = await connection.execute(
      `SELECT COUNT(*) as total FROM unificado_bonificacao_comercial ubc ${whereClause}`,
      whereValues
    )
    const total = countResult[0]?.total || 0
    const totalPages = Math.ceil(total / pageSize)
    const offset = (page - 1) * pageSize
    
    // Construir ORDER BY com múltiplas classificações
    const orderByClause = "ORDER BY ubc.`dt_pagamento` DESC, ubc.`tipo_premiado` ASC, COALESCE(ubc.`valor_carga`, 0) DESC, ubc.`id` DESC"
    
    // Construir query de forma mais segura - usar LIMIT e OFFSET diretamente na string (como na API de regras)
    const cpfSanitize = "REPLACE(REPLACE(REPLACE(ubc.cpf, '.', ''), '-', ''), ' ', '')"
    let query = `SELECT 
        ubc.cpf, 
        ubc.nome, 
        ubc.valor_carga, 
        COALESCE(rd.desconto_realizado, 0) AS desconto_realizado,
        ubc.tipo_cartao, 
        ubc.premiacao, 
        ubc.tipo_premiado, 
        ubc.mes_apurado, 
        ubc.obs, 
        ubc.dt_pagamento, 
        ubc.id,
        rc.chave_pix AS chave_pix,
        rc.tipo_chave AS tipo_chave
      FROM unificado_bonificacao_comercial ubc
      LEFT JOIN (
        SELECT 
          REPLACE(REPLACE(REPLACE(cpf, '.', ''), '-', ''), ' ', '') AS cpf_normalizado,
          dt_movimentacao,
          SUM(COALESCE(valor, 0)) AS desconto_realizado
        FROM registro_bonificacao_descontos
        WHERE 
          status = 'finalizado'
          AND is_active = TRUE
          AND LOWER(TRIM(tipo_movimentacao)) = 'desconto realizado'
        GROUP BY cpf_normalizado, dt_movimentacao
      ) rd 
        ON rd.cpf_normalizado = ${cpfSanitize}
        AND rd.dt_movimentacao = ubc.dt_pagamento
      LEFT JOIN registro_chave_pix rc ON rc.cpf = ubc.cpf`
    
    if (whereClause) {
      query += ` ${whereClause}`
    }
    
    query += ` ${orderByClause}`
    query += ` LIMIT ${pageSize} OFFSET ${offset}`
    
    try {
      const [rows]: any = await connection.execute(query, whereValues)

      return NextResponse.json({
        data: rows || [],
        pagination: {
          page,
          pageSize,
          total,
          totalPages
        }
      })
    } catch (queryError: any) {
      console.error("=== ERRO NA QUERY ===")
      console.error("Mensagem:", queryError.message)
      console.error("Código:", queryError.code)
      console.error("Query que falhou:", query)
      console.error("Parâmetros WHERE:", whereValues)
      console.error("Stack:", queryError.stack)
      console.error("===================")
      throw queryError // Re-lança o erro para ser capturado pelo catch externo
    }
  } catch (error: any) {
    console.error("Erro ao buscar histórico:", error)
    console.error("Stack trace:", error.stack)
    return NextResponse.json(
      { 
        error: error.message || "Erro ao buscar histórico de bonificações",
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined
      },
      { status: 500 }
    )
  } finally {
    if (connection) {
      await connection.end()
    }
  }
}

export async function POST(request: NextRequest) {
  let connection: any = null
  
  try {
    // Verificar variáveis de ambiente
    if (!process.env.DB_HOST || !process.env.DB_USER || !process.env.DB_PASSWORD || !process.env.DB_NAME) {
      return NextResponse.json(
        { error: "Variáveis de ambiente não configuradas" },
        { status: 500 }
      )
    }

    const body = await request.json()
    let {
      cpf,
      nome,
      id_cartao,
      valor_carga,
      tipo_cartao,
      premiacao,
      tipo_premiado,
      mes_apurado,
      obs,
      dt_pagamento
    } = body

    // Normalizar CPF para o formato aceito pelo banco (apenas números, máximo 11 dígitos)
    if (cpf) {
      const numericCpf = String(cpf).replace(/\D/g, "")
      cpf = numericCpf.slice(0, 11) || null
    }

    // Observação: se vazio, preencher automaticamente com "Transferência realizada"
    if (!obs || !String(obs).trim()) {
      obs = 'Transferência realizada'
    } else {
      obs = String(obs).trim()
    }

    // Validações básicas
    if (!cpf || !nome) {
      return NextResponse.json(
        { error: "CPF e Nome são obrigatórios" },
        { status: 400 }
      )
    }

    // Criar conexão
    connection = await getDBConnection()

    // Inserir registro
    const [result]: any = await connection.execute(
      `INSERT INTO unificado_bonificacao_comercial 
       (cpf, nome, id_cartao, valor_carga, tipo_cartao, premiacao, tipo_premiado, mes_apurado, obs, dt_pagamento)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        cpf || null,
        nome || null,
        id_cartao || null,
        valor_carga || null,
        tipo_cartao || null,
        premiacao || null,
        tipo_premiado || null,
        mes_apurado || null,
        obs || null,
        dt_pagamento || null
      ]
    )

    return NextResponse.json({
      success: true,
      id: result.insertId,
      message: "Registro criado com sucesso"
    })
  } catch (error: any) {
    console.error("Erro ao criar registro:", error)
    return NextResponse.json(
      { error: error.message || "Erro ao criar registro" },
      { status: 500 }
    )
  } finally {
    if (connection) {
      await connection.end()
    }
  }
}

