import { NextRequest, NextResponse } from "next/server"
import { spawn } from "child_process"
import path from "path"
import { storeCalculoResult, generateExecId } from "@/lib/calculo-cache"
import { pandasToArray } from "@/lib/pandas-utils"
import { access } from "fs/promises"
import { constants as fsConstants } from "fs"

interface CalcularRequest {
  modo: "automatico" | "periodo"
  data_inicial?: string
  data_final?: string
}

export async function POST(request: NextRequest) {
  try {
    const body: CalcularRequest = await request.json()
    const { modo, data_inicial, data_final } = body

    // Validações
    if (!modo || !["automatico", "periodo"].includes(modo)) {
      return NextResponse.json(
        { error: "Modo inválido. Deve ser 'automatico' ou 'periodo'" },
        { status: 400 }
      )
    }

    if (modo === "periodo") {
      if (!data_inicial || !data_final) {
        return NextResponse.json(
          { error: "No modo período, data_inicial e data_final são obrigatórias" },
          { status: 400 }
        )
      }

      const dtInicial = new Date(data_inicial)
      const dtFinal = new Date(data_final)

      if (isNaN(dtInicial.getTime()) || isNaN(dtFinal.getTime())) {
        return NextResponse.json(
          { error: "Datas inválidas" },
          { status: 400 }
        )
      }

      if (dtInicial > dtFinal) {
        return NextResponse.json(
          { error: "Data inicial não pode ser maior que data final" },
          { status: 400 }
        )
      }
    }

    // Gerar exec_id
    const exec_id = generateExecId()

    // Preparar parâmetros para o script Python
    const scriptPath = path.join(process.cwd(), "scripts", "calculo_bonificacao_completo.py")

    try {
      await access(scriptPath, fsConstants.F_OK)
    } catch {
      return NextResponse.json({
        exec_id,
        sucesso: false,
        erro: "Script Python não encontrado no container.",
        logs: `Caminho procurado: ${scriptPath}\nCertifique-se de que o arquivo foi copiado para a imagem.`,
        preview_df5: [],
        indicadores: null,
        filtros: {},
        sem_registro: {},
        merges: {}
      })
    }
    const params = {
      modo,
      data_inicial: data_inicial || null,
      data_final: data_final || null,
      // Solicitar tabelas necessárias para export (com limite alto)
      max_rows_per_df: 200000,
      include_frames: {
        df5: true,
        unif_bonif: true,
        unif_com: true,
        df4_sem_pix: true
      }
    }

    // Executar script Python
    let pythonResult: any
    let logs = ""
    let stdout = ''
    let stderr = ''
    
    try {
      // Determinar comando Python (python3 ou python)
      const pythonCmd = process.env.PYTHON_BIN
        ? process.env.PYTHON_BIN
        : process.platform === "win32"
          ? "python"
          : "python3"
      
      // Executar com entrada JSON via stdin usando spawn (melhor controle de stdin)
      const timeout = 600000 // 10 minutos (600000ms) - aumentado para processar grandes volumes de dados
      const startTime = Date.now()
      
      // Usar spawn para melhor controle de stdin/stdout/stderr
      const pythonProcess = spawn(pythonCmd, [scriptPath], {
        stdio: ['pipe', 'pipe', 'pipe']
      })

      pythonProcess.stdout.setEncoding("utf8")
      pythonProcess.stderr.setEncoding("utf8")
      
      // Resetar stdout e stderr para esta execução
      stdout = ''
      stderr = ''
      
      // Coletar stdout
      pythonProcess.stdout.on('data', (data) => {
        stdout += data.toString()
      })
      
      // Coletar stderr
      pythonProcess.stderr.on('data', (data) => {
        stderr += data.toString()
        // Log em tempo real para debug
        console.log("[PYTHON STDERR]", data.toString().substring(0, 200))
      })
      
      // Enviar parâmetros via stdin
      const inputJson = JSON.stringify(params)
      pythonProcess.stdin.write(inputJson)
      pythonProcess.stdin.end()
      
      // Criar promise que resolve quando o processo termina
      const processPromise = new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
        pythonProcess.on('close', (code) => {
          if (code !== 0 && code !== null) {
            reject(new Error(`Script Python terminou com código ${code}`))
          } else {
            resolve({ stdout, stderr })
          }
        })
        
        pythonProcess.on('error', (error) => {
          reject(new Error(`Erro ao executar script Python: ${error.message}`))
        })
      })
      
      // Adicionar timeout manual
      const timeoutPromise = new Promise<never>((_, reject) => {
        const timeoutId = setTimeout(() => {
          pythonProcess.kill() // Matar processo se timeout
          reject(new Error(`Timeout: Script Python demorou mais de ${timeout / 1000} segundos para executar`))
        }, timeout)

        pythonProcess.on("close", () => clearTimeout(timeoutId))
        pythonProcess.on("exit", () => clearTimeout(timeoutId))
        pythonProcess.on("error", () => clearTimeout(timeoutId))
      })
      
      const result = await Promise.race([processPromise, timeoutPromise])
      stdout = result.stdout
      stderr = result.stderr
      
      const executionTime = Date.now() - startTime
      console.log(`Script Python executado em ${executionTime}ms`)
      
      // Capturar logs do stderr (prints redirecionados)
      if (stderr) {
        logs += stderr
        console.log("[STDERR]", stderr.substring(0, 500)) // Log para debug
      }
      
      if (stdout) {
        console.log("[STDOUT]", stdout.substring(0, 500)) // Log para debug
      }
      
      // Extrair etapas dos logs (formato [ETAPA:XX%] mensagem)
      const etapasEncontradas: Array<{ etapa: string; percentual: number }> = []
      const regexEtapa = /\[ETAPA:?(\d+)?%?\]\s*(.+)/g
      let match
      const allOutput = stdout + stderr
      while ((match = regexEtapa.exec(allOutput)) !== null) {
        const percentual = match[1] ? parseInt(match[1]) : null
        const mensagem = match[2].trim()
        if (percentual !== null) {
          etapasEncontradas.push({ etapa: mensagem, percentual })
        }
      }
      
      console.log(`[ETAPAS] Encontradas ${etapasEncontradas.length} etapas`)
      console.log(`[STDOUT LENGTH] ${stdout.length} caracteres`)
      
      // Verificar se stdout está vazio ou muito pequeno
      if (!stdout || stdout.trim().length === 0) {
        // Se stdout está vazio mas há stderr, o script pode ter travado ou não completado
        const lastEtapa = etapasEncontradas.length > 0 
          ? etapasEncontradas[etapasEncontradas.length - 1] 
          : null
        
        throw new Error(
          `Script Python não retornou saída. ` +
          `Última etapa executada: ${lastEtapa ? `${lastEtapa.percentual}% - ${lastEtapa.etapa}` : 'N/A'}. ` +
          `Verifique os logs para mais detalhes.`
        )
      }
      
      // Tentar encontrar o JSON completo na stdout
      // O JSON pode estar no início ou no final, mas geralmente está no final
      let jsonStr = stdout.trim()
      
      // Tentar encontrar o início do JSON (primeiro {)
      let jsonStart = jsonStr.indexOf('{')
      if (jsonStart >= 0) {
        // Extrair do primeiro { até o final
        jsonStr = jsonStr.substring(jsonStart)
        
        // Tentar encontrar o final do JSON válido procurando pelo último }
        // Mas precisamos garantir que é um JSON válido balanceado
        let braceCount = 0
        let jsonEnd = -1
        for (let i = 0; i < jsonStr.length; i++) {
          if (jsonStr[i] === '{') braceCount++
          if (jsonStr[i] === '}') {
            braceCount--
            if (braceCount === 0) {
              jsonEnd = i + 1
              break
            }
          }
        }
        
        if (jsonEnd > 0) {
          jsonStr = jsonStr.substring(0, jsonEnd)
        }
      }
      
      try {
        pythonResult = JSON.parse(jsonStr)
      } catch (parseError: any) {
        // Se não for JSON válido, verificar se há mensagens de erro no stderr
        const errorIndicators = ['ERRO', 'Traceback', 'Error', 'Exception']
        const hasError = errorIndicators.some(indicator => 
          stderr.toLowerCase().includes(indicator.toLowerCase())
        )
        
        if (hasError) {
          // Extrair parte relevante do erro do stderr
          const errorMatch = stderr.match(/\[ERRO[^\]]*\][^\n]*|Traceback[^\n]*/i)
          const errorMsg = errorMatch ? errorMatch[0] : 'Erro desconhecido no script Python'
          throw new Error(`Script Python retornou erro: ${errorMsg}`)
        }
        
        // Log detalhado para debug
        console.error(`[JSON PARSE ERROR]`, parseError.message)
        console.error(`[JSON STR LENGTH]`, jsonStr.length)
        console.error(`[JSON STR LAST 200]`, jsonStr.substring(Math.max(0, jsonStr.length - 200)))
        
        // Se não for JSON válido, tratar como erro
        throw new Error(
          `Script Python retornou saída inválida (erro de parse: ${parseError.message}). ` +
          `JSON tentado (últimos 500 chars): ${jsonStr.substring(Math.max(0, jsonStr.length - 500))}`
        )
      }
      
      // Adicionar logs do resultado se disponível
      if (pythonResult.logs) {
        logs = pythonResult.logs
      }
      
      // Adicionar etapas encontradas ao resultado
      if (etapasEncontradas.length > 0) {
        pythonResult.etapas = etapasEncontradas
      }
      
    } catch (error: any) {
      console.error("Erro ao executar script Python:", error)
      console.error("Error details:", {
        code: error.code,
        message: error.message,
        stderr: stderr?.substring(0, 500) || error.stderr?.substring(0, 500),
        stdout: stdout?.substring(0, 500) || error.stdout?.substring(0, 500)
      })
      
      // Se o script não existir ou falhar, retornar erro estruturado
      const erroScriptInexistente =
        error.code === "ENOENT" ||
        error.message?.includes("ENOENT") ||
        /no such file or directory/i.test(error.message || "") ||
        /can't open file/i.test(stderr || "")

      if (erroScriptInexistente) {
        return NextResponse.json({
          exec_id,
          sucesso: false,
          erro: "Script Python não encontrado ou Python não instalado. Verifique se o script existe e Python está configurado.",
          logs: `Erro: ${error.message}\n\nCertifique-se de que:\n1. Python está instalado e no PATH\n2. O arquivo scripts/calculo_bonificacao_completo.py existe\n3. Todas as dependências Python estão instaladas\n\nStderr: ${stderr || "N/A"}\nStdout: ${stdout || "N/A"}`,
          preview_df5: [],
          indicadores: null,
          filtros: {},
          sem_registro: {},
          merges: {}
        })
      }
      
      // Timeout específico
      if (error.message?.includes("Timeout")) {
        return NextResponse.json({
          exec_id,
          sucesso: false,
          erro: "Timeout: O script Python demorou muito para executar. Pode estar travado ou processando muitos dados.",
          logs: `Timeout: ${error.message}\n\nStderr: ${stderr || "N/A"}\nStdout: ${stdout || "N/A"}`,
          preview_df5: [],
          indicadores: null,
          filtros: {},
          sem_registro: {},
          merges: {}
        })
      }
      
      return NextResponse.json({
        exec_id,
        sucesso: false,
        erro: error.message || "Erro ao executar script Python",
        logs: `${stderr || ""}\n${stdout || ""}\n${error.message || "Erro desconhecido"}`,
        preview_df5: [],
        indicadores: null,
        filtros: {},
        sem_registro: {},
        merges: {}
      })
    }

    // Verificar se houve erro no script Python
    if (!pythonResult.sucesso || pythonResult.erro) {
      return NextResponse.json({
        exec_id,
        sucesso: false,
        erro: pythonResult.erro || "Erro no script Python",
        logs: pythonResult.logs || logs,
        preview_df5: [],
        indicadores: null,
        filtros: {},
        sem_registro: {},
        merges: {}
      })
    }

    // Processar resultados
    const ensureArray = (value: any): any[] => Array.isArray(value) ? value : []

    const preview_df5 = pandasToArray(pythonResult.preview_df5 || pythonResult.df5 || []).slice(0, 50)
    const df5_completo = pandasToArray(pythonResult.df5 || [])
    const calc_pag = pandasToArray(pythonResult.calc_pag || [])
    let df4_sem_pix = pandasToArray(pythonResult.df4_sem_pix || [])
    const df4_com_pix = pandasToArray(pythonResult.df4_com_pix || [])
    const desc = pandasToArray(pythonResult.desc || [])
    const unif_bonif = pandasToArray(pythonResult.unif_bonif || [])
    const unif_com = pandasToArray(pythonResult.unif_com || [])

    // Garantir que df4_sem_pix traga apenas colunas permitidas
    const df4SemPixColumnsAllowed = [
      "NOME_RAZAO_SOCIAL",
      "CPF_CNPJ",
      "EMAIL",
      "CELULAR",
      "VALOR"
    ]

    if (df4_sem_pix.length > 0) {
      df4_sem_pix = df4_sem_pix.map((row) => {
        const mappedRow: Record<string, any> = {}
        df4SemPixColumnsAllowed.forEach((column) => {
          if (column === "NOME_RAZAO_SOCIAL") {
            mappedRow[column] =
              row?.[column] ??
              row?.["NOME/RAZÃO SOCIAL"] ??
              row?.["NOME/RAZAO SOCIAL"] ??
              row?.nome_vendedor ??
              row?.nome ??
              ""
          } else if (column === "CPF_CNPJ") {
            mappedRow[column] = row?.[column] ?? row?.["CPF/CNPJ"] ?? row?.cpf_vendedor ?? row?.cpf ?? ""
          } else if (column === "EMAIL") {
            mappedRow[column] = row?.[column] ?? row?.["E-MAIL"] ?? row?.email ?? ""
          } else if (column === "CELULAR") {
            mappedRow[column] = row?.[column] ?? row?.celular ?? row?.["CELULAR"] ?? ""
      } else {
        mappedRow[column] = row?.[column] ?? ""
      }
        })
        return mappedRow
      })
    }

    // Extrair indicadores
    const indicadoresRaw = pythonResult.indicadores || {}
    const indicadores = {
      vlr_bruto_total: "R$ 0,00",
      vlr_bruto_cor: "R$ 0,00",
      vlr_bruto_sup: "R$ 0,00",
      desc_total: "R$ 0,00",
      desc_cor: "R$ 0,00",
      desc_sup: "R$ 0,00",
      vlr_liquido_total: "R$ 0,00",
      vlr_liquido_cor: "R$ 0,00",
      vlr_liquido_sup: "R$ 0,00",
      prop_inicial: 0,
      ticket_medio: "R$ 0,00",
      vidas_pagas: 0
      , ...indicadoresRaw
    }

    const sanitizeRecordOfArrays = (value: any): Record<string, any[]> => {
      if (!value || typeof value !== "object" || Array.isArray(value)) return {}
      return Object.fromEntries(
        Object.entries(value).map(([key, val]) => [key, ensureArray(val)])
      )
    }

    const sanitizeRecordOfStrings = (value: any): Record<string, string> => {
      if (!value || typeof value !== "object" || Array.isArray(value)) return {}
      return Object.fromEntries(
        Object.entries(value).map(([key, val]) => [key, String(val ?? "")])
      )
    }

    const filtros = sanitizeRecordOfArrays(pythonResult.filtros)
    const sem_registro = sanitizeRecordOfArrays(pythonResult.sem_registro)
    const merges = sanitizeRecordOfStrings(pythonResult.merges)

    // Verificar se há erro de "Fora da data de virada"
    const foraDaVirada = logs.includes("Fora da data de virada") || pythonResult.erro?.includes("Fora da data de virada")

    if (foraDaVirada) {
      return NextResponse.json({
        exec_id,
        sucesso: false,
        erro: "Fora da data de virada",
        logs: pythonResult.logs || logs,
        preview_df5: [],
        indicadores: null,
        filtros: {},
        sem_registro: {},
        merges: {}
      })
    }

    // Preparar versão leve do df5 apenas com colunas necessárias para PIX (reduz payload)
    const toDigits = (v: any) => (typeof v === 'string' || typeof v === 'number') ? String(v).replace(/\D/g, '') : ''
    const df5_lite = df5_completo.map((row: any) => {
      const obj = row || {}
      // Tentar acessar com chaves em diferentes casos
      const pick = (k: string) => obj[k] ?? obj[k.toUpperCase()] ?? obj[k.toLowerCase()]
      return {
        cpf_corretor: toDigits(pick('CPF Corretor') ?? ''),
        cpf_supervisor: toDigits(pick('CPF Supervisor') ?? ''),
        chave_pix_vendedor: pick('chave_pix_vendedor') ?? '',
        chave_pix_supervisor: pick('chave_pix_supervisor') ?? '',
      }
    })

    // Armazenar resultados no cache
    try {
      storeCalculoResult(exec_id, {
        logs: typeof pythonResult.logs === "string" ? pythonResult.logs : logs,
        preview_df5,
        indicadores,
        filtros,
        sem_registro,
        merges,
        calc_pag,
        df4_sem_pix,
        df4_com_pix,
        df5: df5_completo,
        desc,
        unif_bonif,
        unif_com
      })
    } catch (cacheError: any) {
      console.error("Erro ao armazenar cálculo no cache:", cacheError)
    }

    return NextResponse.json(
      {
        exec_id,
        sucesso: true,
        logs: pythonResult.logs || logs,
        preview_df5,
        indicadores,
        filtros,
        sem_registro,
        merges,
        df5_lite,
        unif_bonif: unif_bonif || [],
        unif_com: unif_com || [],
        df4_sem_pix,
        data_pagamento: pythonResult.data_pagamento || null
      },
      {
        headers: {
          'Content-Type': 'application/json; charset=utf-8'
        }
      }
    )

  } catch (error: any) {
    console.error("Erro ao executar cálculo:", error)
    return NextResponse.json(
      {
        error: error.message || "Erro ao executar cálculo de bonificação",
        details: process.env.NODE_ENV === "development" ? error.stack : undefined
      },
      { status: 500 }
    )
  }
}

