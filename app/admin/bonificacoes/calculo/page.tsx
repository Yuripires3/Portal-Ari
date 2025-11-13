"use client"

import React, { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import unidecode from "unidecode"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Checkbox } from "@/components/ui/checkbox"
import { Separator } from "@/components/ui/separator"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/hooks/use-toast"
import { Loader2, AlertTriangle, CheckCircle2, Download } from "lucide-react"
import { signalPageLoaded } from "@/components/ui/page-loading"
import { Progress } from "@/components/ui/progress"
import { ConfiguracaoExecucaoCard } from "./_components/ConfiguracaoExecucaoCard"
import { useAuth } from "@/components/auth/auth-provider"
import { formatDateBR, formatDateISO } from "@/lib/date-utils"
import { downloadXlsxFromObjects } from "@/utils/downloadXlsx"

interface Indicadores {
  vlr_bruto_total: string
  vlr_bruto_cor: string
  vlr_bruto_sup: string
  desc_total: string
  desc_cor: string
  desc_sup: string
  vlr_liquido_total: string
  vlr_liquido_cor: string
  vlr_liquido_sup: string
  prop_inicial: number
  ticket_medio: string
  vidas_pagas: number
}

interface CalculoResponse {
  exec_id: string
  sucesso: boolean
  erro?: string
  logs: string
  preview_df5: any[]
  df5_lite?: Array<{ cpf_corretor?: string; cpf_supervisor?: string; chave_pix_vendedor?: string; chave_pix_supervisor?: string }>
  indicadores: Indicadores | null
  filtros: Record<string, any[]>
  sem_registro: Record<string, any[]>
  merges: Record<string, string>
  unif_bonif?: any[]
  unif_com?: any[]
  df4_sem_pix?: any[]
  data_pagamento?: string | null
}

export default function CalculoBonificacaoPage() {
  const { toast } = useToast()
  const router = useRouter()
  const { user } = useAuth() as any
  const [runId, setRunId] = useState<string | null>(null)
  const [sessionId] = useState<string>(() => {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID()
    }
    return `session_${Date.now()}_${Math.random().toString(16).slice(2)}`
  })
  const [modo, setModo] = useState<"automatico" | "periodo">("automatico")
  const [dataInicial, setDataInicial] = useState("")
  const [dataFinal, setDataFinal] = useState("")
  const [executando, setExecutando] = useState(false)
  const [validado, setValidado] = useState(false)
  const [registrando, setRegistrando] = useState(false)
  const [resultado, setResultado] = useState<CalculoResponse | null>(null)
  const [erroTecnico, setErroTecnico] = useState<string | null>(null)
  const [detalhesTecnicosAbertos, setDetalhesTecnicosAbertos] = useState(false)
  const [etapaAtual, setEtapaAtual] = useState<string>("")
  const [progresso, setProgresso] = useState(0)
  const [etapasDetalhadas, setEtapasDetalhadas] = useState<Array<{
    nome: string
    status: "pendente" | "executando" | "concluido" | "erro"
    linhas?: number
    detalhes?: string
    percentual?: number
  }>>([])
  
  // Estados para edição das tabelas unif_bonif e unif_com
  const [unifBonifData, setUnifBonifData] = useState<any[]>([])
  const [unifComData, setUnifComData] = useState<any[]>([])
  const [df4SemPixData, setDf4SemPixData] = useState<any[]>([])
  const [editingUnifBonif, setEditingUnifBonif] = useState<{ rowIndex: number; field: string } | null>(null)
  const [editingUnifCom, setEditingUnifCom] = useState<{ rowIndex: number; field: string } | null>(null)
  const [validadoUnifBonif, setValidadoUnifBonif] = useState(false)
  const [validadoUnifCom, setValidadoUnifCom] = useState(false)
  const [registrandoUnifBonif, setRegistrandoUnifBonif] = useState(false)
  const [registrandoUnifCom, setRegistrandoUnifCom] = useState(false)
  const [registradoUnifBonif, setRegistradoUnifBonif] = useState(false)
  const [registradoUnifCom, setRegistradoUnifCom] = useState(false)
  const [dataApuracaoAtual, setDataApuracaoAtual] = useState<string | null>(null)
  const [showLeavePrompt, setShowLeavePrompt] = useState(false)
  const [pendingHref, setPendingHref] = useState<string | null>(null)
  const [pendingBack, setPendingBack] = useState(false)
  const [exportingPedidoE, setExportingPedidoE] = useState(false)
  const [autoDownloaded, setAutoDownloaded] = useState(false)
  const [idsDescontosInseridos, setIdsDescontosInseridos] = useState<number[]>([])

  // Helper: lazy-load SheetJS in browser
  const getXLSX = async (): Promise<any> => {
    if (typeof window === 'undefined') throw new Error('XLSX só no browser')
    // @ts-ignore
    if (window.XLSX) {
      // @ts-ignore
      return window.XLSX
    }
    return await new Promise((resolve, reject) => {
      // @ts-ignore
      if (window.XLSX) {
        // @ts-ignore
        return resolve(window.XLSX)
      }
      const script = document.createElement('script')
      // Prefer xlsx-js-style (supports cell styles); fallback handled above if already present
      script.src = 'https://cdn.jsdelivr.net/npm/xlsx-js-style@1.2.0/dist/xlsx.min.js'
      script.async = true
      script.onload = () => {
        try {
          // @ts-ignore
          const XLSX = window.XLSX
          if (XLSX) resolve(XLSX)
          else reject(new Error('XLSX not available after loading'))
        } catch (e) { reject(e as any) }
      }
      script.onerror = () => reject(new Error('Failed to load XLSX from CDN'))
      document.body.appendChild(script)
    })
  }

  const finalizarCalculo = async () => {
    const usuarioId = user?.id ? Number(user.id) : null
    if (!runId || !usuarioId || Number.isNaN(usuarioId)) {
      toast({
        title: "Não foi possível finalizar",
        description: "A execução atual não possui identificador ou usuário válido. Recarregue e execute novamente.",
        variant: "destructive"
      })
      return
    }

    try {
      const response = await fetch("/api/bonificacoes/calculo/finalizar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ run_id: runId, usuario_id: usuarioId })
      })
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data?.error || "Erro ao finalizar cálculo")
      }

      await cancelar({ removerDescontos: false })

      toast({
        title: "Cálculo finalizado",
        description: data?.message || "Descontos promovidos e resumo encerrado."
      })
    } catch (error: any) {
      console.error("[FINALIZAR] Erro ao finalizar cálculo:", error)
      toast({
        title: "Erro",
        description: error?.message || "Erro ao finalizar cálculo",
        variant: "destructive"
      })
    }
  }

  // Normalizações / detecções
  const onlyDigits = (v: any) => String(v ?? '').replace(/\D/g, '')
  const isEmail = (v: any) => typeof v === 'string' && /.+@.+\..+/.test(v)
  const classifyPhone = (v: any): boolean => {
    const d = onlyDigits(v)
    const dNo55 = d.startsWith('55') ? d.slice(2) : d
    return dNo55.length === 10 || dNo55.length === 11
  }
  const isCpf = (v: any) => onlyDigits(v).length === 11
  const isCnpj = (v: any) => onlyDigits(v).length === 14

  // Extrai melhor chave PIX de uma linha do df5 (prioridade: celular > email > cpf/cnpj)
  const extractBestPixFromDf5Row = (row: Record<string, any>): { key: string | null; typeCode: '01' | '02' | '03' | null } => {
    const values = Object.values(row || {}) as any[]
    // 1) celular
    const cell = values.find((v) => classifyPhone(v))
    if (cell) return { key: onlyDigits(cell), typeCode: '01' }
    // 2) email
    const mail = values.find((v) => isEmail(v))
    if (mail) return { key: String(mail), typeCode: '02' }
    // 3) cpf/cnpj
    const doc = values.find((v) => isCpf(v) || isCnpj(v))
    if (doc) return { key: onlyDigits(doc), typeCode: '03' }
    return { key: null, typeCode: null }
  }

  // Busca no df5 usando o CPF do Unificado Comercial:
  // 1) Se bate com "CPF Corretor" => usar "chave_pix_vendedor"
  // 2) Senão, se bate com "CPF Supervisor" => usar "chave_pix_supervisor"
  const findPixForCpf = (cpf: string): { key: string; typeCode: '01' | '02' | '03' } | null => {
    const target = onlyDigits(cpf)
    // Usar preview_df5 (quando existir) como fonte auxiliar
    const rows = (resultado?.df5_lite as any[]) || (resultado?.preview_df5 as any[]) || []
    for (const r of rows) {
      const get = (name: string) => r[name] ?? r[name.toUpperCase()] ?? r[name.toLowerCase()]
      const cpfCor = get('CPF Corretor') ?? get('cpf_corretor')
      if (cpfCor && onlyDigits(cpfCor) === target) {
        const raw = get('chave_pix_vendedor')
        if (raw) {
          if (classifyPhone(raw)) return { key: onlyDigits(raw), typeCode: '01' }
          if (isEmail(raw)) return { key: String(raw), typeCode: '02' }
          if (isCpf(raw) || isCnpj(raw)) return { key: onlyDigits(raw), typeCode: '03' }
        }
        // fallback geral na mesma linha
        const best = extractBestPixFromDf5Row(r as any)
        if (best.key && best.typeCode) return best as any
      }

      const cpfSup = get('CPF Supervisor') ?? get('cpf_supervisor')
      if (cpfSup && onlyDigits(cpfSup) === target) {
        const raw = get('chave_pix_supervisor')
        if (raw) {
          if (classifyPhone(raw)) return { key: onlyDigits(raw), typeCode: '01' }
          if (isEmail(raw)) return { key: String(raw), typeCode: '02' }
          if (isCpf(raw) || isCnpj(raw)) return { key: onlyDigits(raw), typeCode: '03' }
        }
        // fallback geral na mesma linha
        const best = extractBestPixFromDf5Row(r as any)
        if (best.key && best.typeCode) return best as any
      }
    }
    return null
  }

  // Exporta pedido E+
  const exportPedidoE = async () => {
    if (!unifComData || unifComData.length === 0) throw new Error('Sem dados para exportar')
    setExportingPedidoE(true)
    try {
      const XLSX = await getXLSX()

      const headers = [
        'NOME/RAZAO DOCIAL',
        'CPF/CNPJ',
        'TIPO/CHAVE',
        'CHAVE/PIX',
        'VALOR',
      ]

      // Helper para obter campo por vários aliases (case-insensitive)
      const getFromRow = (row: any, names: string[]): any => {
        for (const n of names) {
          const direct = row[n]
          if (direct !== undefined && direct !== null && String(direct).length > 0) return direct
          const upper = row[n.toUpperCase()]
          if (upper !== undefined && upper !== null && String(upper).length > 0) return upper
          const lower = row[n.toLowerCase()]
          if (lower !== undefined && lower !== null && String(lower).length > 0) return lower
        }
        // Busca frouxa por chave que contenha o termo pedido (ex: "CPF Unificado Comercial")
        const keys = Object.keys(row || {})
        for (const k of keys) {
          const kl = k.toLowerCase().replace(/\s+/g, ' ')
          if (names.some(n => kl.includes(n.toLowerCase()))) {
            const v = row[k]
            if (v !== undefined && v !== null && String(v).length > 0) return v
          }
        }
        return null
      }

      const rows: any[] = []
      for (const row of unifComData) {
        const nome = String((row as any).nome ?? '')
        // Usar o CPF da linha do Unificado Comercial como chave de busca (normalizado)
        const docRaw = getFromRow(row, [
          'cpf', 'CPF', 'cpf_cnpj', 'CPF/CNPJ', 'cpf_unificado', 'CPF Unificado Comercial',
          'cpf_corretor', 'cpf_supervisor'
        ]) || ''
        const doc = onlyDigits(docRaw)
        // Buscar chave no df5
        const pix = findPixForCpf(doc)
        let tipo: '01' | '02' | '03'
        let chave: string
        if (pix) {
          tipo = pix.typeCode
          chave = String(pix.key)
          // Se a chave for celular (tipo '01'), prefixar com '+'
          if (tipo === '01' && !chave.startsWith('+')) {
            chave = `+${chave}`
          }
        } else {
          tipo = '03'
          chave = doc
        }

        // valor
        const valorField = (row as any).valor_carga ?? (row as any)['valor carga'] ?? (row as any).valor ?? 0
        const valorNum = Number(String(valorField).replace(/[^0-9.-]/g, '')) || 0

        rows.push([nome, doc, tipo, chave, valorNum])
      }

      const aoa = [headers, ...rows]
      const ws = XLSX.utils.aoa_to_sheet(aoa)

      // Tipos: forçar strings nas colunas 0..3 e formato 0.00 na coluna 4
      const range = XLSX.utils.decode_range(ws['!ref'] || 'A1')
      // Header style: yellow background, bold black text
      for (let c = 0; c <= 4; c++) {
        const hAddr = XLSX.utils.encode_cell({ r: range.s.r, c })
        const hCell = ws[hAddr]
        if (hCell) {
          hCell.s = {
            font: { bold: true, color: { rgb: '000000' } },
            // Golden Yellow (#FFCC00)
            fill: { patternType: 'solid', fgColor: { rgb: 'FFCC00' } },
            alignment: { horizontal: 'center', vertical: 'center' },
          }
        }
      }
      for (let r = range.s.r + 1; r <= range.e.r; r++) {
        for (let c = 0; c <= 3; c++) {
          const addr = XLSX.utils.encode_cell({ r, c })
          const cell = ws[addr]
          if (cell) { cell.t = 's'; cell.v = String(cell.v ?? '') }
        }
        const valorAddr = XLSX.utils.encode_cell({ r, c: 4 })
        const vCell = ws[valorAddr]
        if (vCell) { vCell.t = 'n'; vCell.z = '0.00' }
      }

      // Auto column widths (wch) based on content length
      const computeLen = (v: any, idx: number) => {
        if (v === null || v === undefined) return 0
        if (idx === 4) {
          const num = Number(v) || 0
          return num.toFixed(2).length
        }
        return String(v).length
      }
      const colMax: number[] = [0, 0, 0, 0, 0]
      headers.forEach((h, i) => { colMax[i] = Math.max(colMax[i], String(h).length) })
      rows.forEach(r => {
        r.forEach((v: any, i: number) => {
          colMax[i] = Math.max(colMax[i], computeLen(v, i))
        })
      })
      ws['!cols'] = colMax.map(len => ({ wch: Math.min(Math.max(len + 2, 10), 60) }))

      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'pedido_E+')

      const now = new Date()
      const pad = (n: number) => String(n).padStart(2, '0')
      const fileName = `pedido_E+_${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}.xlsx`

      const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
      const blob = new Blob([wbout], { type: 'application/octet-stream' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = fileName
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      toast({ title: 'Arquivo gerado com sucesso' })
      setExportingPedidoE(false)
      return true
    } catch (e: any) {
      console.error('Export Pedido E+ error', e)
      toast({ title: 'Não foi possível gerar o arquivo', description: e?.message || 'Erro', variant: 'destructive' })
      setExportingPedidoE(false)
      return false
    }
  }

  // (Removido) Download df5 via API

  // Auto-download quando ambos registraram
  useEffect(() => {
    if (registradoUnifBonif && registradoUnifCom && !autoDownloaded && unifComData.length > 0) {
      exportPedidoE().finally(() => setAutoDownloaded(true))
    }
  }, [registradoUnifBonif, registradoUnifCom, autoDownloaded, unifComData])

  // Verificar se o usuário tem permissão para acessar esta página
  useEffect(() => {
    const classificacao = user?.classificacao?.toUpperCase()
    const role = user?.role?.toUpperCase()
    // Verificar tanto classificacao quanto role (case-insensitive)
    if (classificacao === "COMERCIAL" || role === "COMERCIAL") {
      toast({
        title: "Acesso negado",
        description: "Você não tem permissão para acessar esta página.",
        variant: "destructive"
      })
      router.push("/admin/bonificacoes/historico")
    }
  }, [user, router, toast])

  useEffect(() => {
    signalPageLoaded()
  }, [])

  // Guardar saída da página quando cálculo estiver em execução ou com resultado carregado
  const CALCULO_STORAGE_KEY = "calculo_bonificacao_state"

  // Desabilitei a guarda automática temporariamente a pedido do usuário para evitar limpeza de cache.

  useEffect(() => {
    if (typeof window === "undefined") return
    try {
      const stored = window.sessionStorage.getItem(CALCULO_STORAGE_KEY)
      if (!stored) return
      const parsed = JSON.parse(stored)
      if (!parsed || typeof parsed !== "object") return
      setResultado(parsed.resultado ?? null)
      setUnifBonifData(parsed.unifBonifData ?? [])
      setUnifComData(parsed.unifComData ?? [])
      setDf4SemPixData(parsed.df4SemPixData ?? [])
      setValidadoUnifBonif(parsed.validadoUnifBonif ?? false)
      setValidadoUnifCom(parsed.validadoUnifCom ?? false)
      setRegistradoUnifBonif(parsed.registradoUnifBonif ?? false)
      setRegistradoUnifCom(parsed.registradoUnifCom ?? false)
      setDataApuracaoAtual(parsed.dataApuracaoAtual ?? null)
      setIdsDescontosInseridos(parsed.idsDescontosInseridos ?? [])
      setAutoDownloaded(parsed.autoDownloaded ?? false)
      setRunId(parsed.runId ?? null)
    } catch (error) {
      console.warn("[Persistência cálculo] Falha ao carregar estado persistido:", error)
      window.sessionStorage.removeItem(CALCULO_STORAGE_KEY)
    }
  }, [])

  useEffect(() => {
    if (typeof window === "undefined") return
    if (!resultado) {
      window.sessionStorage.removeItem(CALCULO_STORAGE_KEY)
      return
    }
    const stateToPersist = {
      resultado,
      unifBonifData,
      unifComData,
      df4SemPixData,
      validadoUnifBonif,
      validadoUnifCom,
      registradoUnifBonif,
      registradoUnifCom,
      dataApuracaoAtual,
      idsDescontosInseridos,
      autoDownloaded,
      runId,
      timestamp: Date.now()
    }
    try {
      window.sessionStorage.setItem(CALCULO_STORAGE_KEY, JSON.stringify(stateToPersist))
    } catch (error) {
      console.warn("[Persistência cálculo] Falha ao salvar estado:", error)
    }
  }, [
    resultado,
    unifBonifData,
    unifComData,
    df4SemPixData,
    validadoUnifBonif,
    validadoUnifCom,
    registradoUnifBonif,
    registradoUnifCom,
    dataApuracaoAtual,
    idsDescontosInseridos,
    autoDownloaded,
    runId
  ])

  // Se o usuário for COMERCIAL, não renderizar o conteúdo
  const classificacao = user?.classificacao?.toUpperCase()
  const role = user?.role?.toUpperCase()
  if (classificacao === "COMERCIAL" || role === "COMERCIAL") {
    return (
      <div className="w-full px-4 sm:px-6 lg:px-8 py-6">
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Acesso negado</AlertTitle>
          <AlertDescription>
            Você não tem permissão para acessar esta página.
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  const validarDatas = (): boolean => {
    if (modo === "periodo") {
      if (!dataInicial || !dataFinal) {
        toast({
          title: "Erro de validação",
          description: "Data inicial e data final são obrigatórias no modo período",
          variant: "destructive"
        })
        return false
      }

      const dtInicial = new Date(dataInicial)
      const dtFinal = new Date(dataFinal)

      if (dtInicial > dtFinal) {
        toast({
          title: "Erro de validação",
          description: "Data inicial não pode ser maior que data final",
          variant: "destructive"
        })
        return false
      }
    }
    return true
  }

  // Definir etapas principais que serão exibidas como boxes
  // Ordem importa: devem estar na ordem de execução
  // Percentuais alinhados com o script Python (calculo_bonificacao_completo.py)
  const etapasPrincipais = [
    { nome: "Conectando ao banco de dados", chave: "banco", busca: ["conectando ao banco", "banco de dados", "MySQL", "testando conexão", "conexão ok"], percentualEsperado: 3 },
    { nome: "Carregando tabelas auxiliares", chave: "auxiliares", busca: ["carregando tabelas auxiliares", "carregando auxiliar", "entidades", "operadoras", "planos", "descontos", "chaves pix"], percentualEsperado: 12 },
    { nome: "Conectando ao Elasticsearch", chave: "elasticsearch", busca: ["conectando ao elasticsearch", "elasticsearch"], percentualEsperado: 26 },
    { nome: "Baixando relatório de faturamento", chave: "faturamento", busca: ["baixando relatório de faturamento", "faturamento", "cobrancas"], percentualEsperado: 32 },
    { nome: "Baixando relatório de contratos", chave: "contratos", busca: ["baixando relatório de contratos", "contratos"], percentualEsperado: 40 },
    { nome: "Baixando relatório de beneficiários", chave: "beneficiarios", busca: ["baixando relatório de beneficiários", "beneficiarios", "beneficiário"], percentualEsperado: 50 },
    { nome: "Baixando relatório de corretores", chave: "corretores", busca: ["baixando relatório de corretores", "corretores", "bonificados"], percentualEsperado: 58 },
    { nome: "Processando e mesclando dados", chave: "merge", busca: ["processando e mesclando dados", "mesclando dados", "transformações e cálculos", "mesclando tabelas"], percentualEsperado: 66 },
    { nome: "Aplicando filtros e transformações", chave: "filtros", busca: ["aplicando filtros", "aplicando transformações", "filtros de exclusão", "transformações de dados"], percentualEsperado: 70 },
    { nome: "Calculando bonificações", chave: "calculo", busca: ["calculando bonificações", "calculando faixas", "mesclando dados de bonificados", "calc_pag"], percentualEsperado: 76 },
    { nome: "Preparando estrutura final", chave: "estrutura", busca: ["preparando estrutura final", "processando unificado", "separando corretores", "calculando descontos"], percentualEsperado: 86 },
    { nome: "Gerando relatórios", chave: "relatorios", busca: ["gerando relatório", "montando estrutura df5", "criando bonificacao_analise", "relatórios"], percentualEsperado: 88 },
    { nome: "Serializando JSON", chave: "serializacao", busca: ["convertendo dataframes", "serializando", "convertendo", "verificando tabelas"], percentualEsperado: 93 }
  ]

  // Função para extrair informações das etapas dos logs
  const extrairInfoEtapas = (logs: string, etapasEncontradas?: Array<{ etapa: string; percentual: number }>) => {
    const etapasComStatus = etapasPrincipais.map(etapa => {
      // Verificar se a etapa aparece nos logs
      const apareceNosLogs = etapa.busca.some(termo => 
        logs.toLowerCase().includes(termo.toLowerCase())
      )
      
      // Buscar quantidade de linhas relacionadas à etapa
      let linhas: number | undefined
      let detalhes: string | undefined
      
      // Padrões para extrair informações específicas de cada etapa
      // Buscar padrões gerais primeiro
      const linhasMatch = logs.match(new RegExp(`${etapa.busca[0]}[^\\n]*?(\\d+)\\s*linhas?`, "i"))
      if (linhasMatch) {
        linhas = parseInt(linhasMatch[1])
      }
      
      // Padrões específicos por etapa
      if (etapa.chave === "faturamento") {
        const match = logs.match(/faturamento[^\n]*?(\d+)\s*linhas?/i) || 
                     logs.match(/faturamento[^\n]*?finalizado/i)
        if (match && !linhas) {
          const numMatch = logs.match(/(\d+)\s*linhas?/i)
          if (numMatch) linhas = parseInt(numMatch[1])
        }
        if (logs.toLowerCase().includes("faturamento") && logs.toLowerCase().includes("finalizado")) {
          detalhes = "Download concluído"
        }
      }
      
      if (etapa.chave === "contratos") {
        const match = logs.match(/contratos[^\n]*?(\d+)\s*linhas?/i) ||
                     logs.match(/contratos[^\n]*?finalizado/i)
        if (match && !linhas) {
          const numMatch = logs.match(/(\d+)\s*linhas?/i)
          if (numMatch) linhas = parseInt(numMatch[1])
        }
        if (logs.toLowerCase().includes("contratos") && logs.toLowerCase().includes("finalizado")) {
          detalhes = "Download concluído"
        }
      }
      
      if (etapa.chave === "beneficiarios") {
        const match = logs.match(/beneficiarios?[^\n]*?(\d+)\s*linhas?/i) ||
                     logs.match(/beneficiarios?[^\n]*?finalizado/i)
        if (match && !linhas) {
          const numMatch = logs.match(/(\d+)\s*linhas?/i)
          if (numMatch) linhas = parseInt(numMatch[1])
        }
        if (logs.toLowerCase().includes("beneficiarios") && logs.toLowerCase().includes("finalizado")) {
          detalhes = "Download concluído"
        }
      }
      
      if (etapa.chave === "corretores") {
        const match = logs.match(/corretores?[^\n]*?(\d+)\s*linhas?/i) ||
                     logs.match(/corretores?[^\n]*?finalizado/i)
        if (match && !linhas) {
          const numMatch = logs.match(/(\d+)\s*linhas?/i)
          if (numMatch) linhas = parseInt(numMatch[1])
        }
        if (logs.toLowerCase().includes("corretores") && logs.toLowerCase().includes("finalizado")) {
          detalhes = "Download concluído"
        }
      }
      
      if (etapa.chave === "calculo") {
        const match = logs.match(/calc_pag[^\n]*?preparado[^\n]*?(\d+)\s*linhas?/i) ||
                     logs.match(/calc_pag[^\n]*?(\d+)\s*linhas?/i)
        if (match && !linhas) {
          const numMatch = match[1] ? [null, match[1]] : logs.match(/(\d+)\s*linhas?/i)
          if (numMatch && numMatch[1]) linhas = parseInt(numMatch[1])
        }
      }
      
      if (etapa.chave === "relatorios") {
        const match = logs.match(/df5[^\n]*?(\d+)\s*linhas?/i) ||
                     logs.match(/vidas_pagas[^\n]*?(\d+)/i)
        if (match && !linhas) {
          const numMatch = match[1] ? [null, match[1]] : logs.match(/(\d+)\s*linhas?/i)
          if (numMatch && numMatch[1]) linhas = parseInt(numMatch[1])
        }
      }
      
      if (etapa.chave === "auxiliares") {
        // Buscar informações sobre tabelas auxiliares carregadas
        const auxMatch = logs.match(/(\d+)\s*tabelas?\s*auxiliares?/i) ||
                        logs.match(/auxiliar[^\n]*?(\d+)\s*linhas?/i) ||
                        logs.match(/SQL (?:Entidade|Operadora|Concessionárias|Planos|Faixas|Bonificação|Descontos|Unificado|Pix)[^\n]*?finalizado/i)
        if (auxMatch && !linhas) {
          const numMatch = auxMatch[1] ? [null, auxMatch[1]] : logs.match(/(\d+)/i)
          if (numMatch && numMatch[1]) linhas = parseInt(numMatch[1])
        }
        // Contar quantas tabelas auxiliares foram carregadas
        const tabelasCarregadas = (logs.match(/SQL [^\n]*?finalizado/gi) || []).length
        if (tabelasCarregadas > 0 && !linhas) {
          detalhes = `${tabelasCarregadas} tabelas carregadas`
        }
      }
      
      if (etapa.chave === "elasticsearch") {
        // Buscar informações sobre conexão ao Elasticsearch
        if (logs.toLowerCase().includes("elasticsearch") && logs.toLowerCase().includes("conectando")) {
          detalhes = "Conectado"
        }
      }
      
      if (etapa.chave === "estrutura") {
        // Buscar informações sobre preparação da estrutura final
        const estruturaMatch = logs.match(/preparando[^\n]*?estrutura/i) ||
                              logs.match(/processando unificado/i) ||
                              logs.match(/separando corretores/i)
        if (estruturaMatch) {
          detalhes = "Processando dados finais"
        }
      }
      
      // Determinar status baseado em etapas encontradas e logs
      let status: "pendente" | "executando" | "concluido" | "erro" = "pendente"
      let percentual: number | undefined
      
      // Encontrar todas as etapas relacionadas a esta etapa principal
      const etapasRelacionadas = etapasEncontradas?.filter(e => 
        etapa.busca.some(termo => e.etapa.toLowerCase().includes(termo.toLowerCase()))
      ) || []
      
      // Se encontrou etapas relacionadas
      if (etapasRelacionadas.length > 0) {
        // Pegar a última etapa relacionada (mais recente)
        const etapaEncontrada = etapasRelacionadas[etapasRelacionadas.length - 1]
        percentual = etapaEncontrada.percentual
        
        // Se a etapa tem 100% ou mais, está concluída
        if (etapaEncontrada.percentual >= 100) {
          status = "concluido"
        } else {
          // Se está entre 0-99%, está executando
          status = "executando"
        }
      }
      
      // Se não encontrou etapa específica, verificar pela última etapa geral
      if (status === "pendente" && etapasEncontradas && etapasEncontradas.length > 0) {
        const ultimaEtapa = etapasEncontradas[etapasEncontradas.length - 1]
        
        // Verificar se a última etapa está relacionada a esta etapa principal
        const ultimaEtapaRelacionada = etapa.busca.some(termo => 
          ultimaEtapa.etapa.toLowerCase().includes(termo.toLowerCase())
        )
        
        if (ultimaEtapaRelacionada) {
          if (ultimaEtapa.percentual >= 100) {
            status = "concluido"
          } else {
            status = "executando"
            percentual = ultimaEtapa.percentual
          }
        } else {
          // Se a última etapa é diferente, verificar se já passamos desta etapa
          // Usar percentual esperado da etapa principal
          const percentualEsperado = etapa.percentualEsperado || 0
          
          if (ultimaEtapa.percentual > percentualEsperado + 3) {
            // Se já passamos desta etapa, ela está concluída
            status = "concluido"
          } else if (ultimaEtapa.percentual >= percentualEsperado - 5 && ultimaEtapa.percentual <= percentualEsperado + 3) {
            // Se está próximo ou nesta etapa, está executando
            status = "executando"
            percentual = ultimaEtapa.percentual
          } else if (apareceNosLogs && ultimaEtapa.percentual >= percentualEsperado - 10) {
            // Se está próximo do percentual esperado e aparece nos logs, está executando
            status = "executando"
            percentual = ultimaEtapa.percentual
          }
        }
      }
      
      // Verificar conclusão pelos logs (compatibilidade com versão anterior)
      if (apareceNosLogs && status === "pendente") {
        // Se encontrou informações específicas, está concluído
        if (linhas !== undefined || detalhes) {
          status = "concluido"
        } else {
          // Verificar se há indicação de conclusão no log
          const finalizadoMatch = logs.match(new RegExp(`${etapa.busca[0]}[^\\n]*?finalizado`, "i"))
          if (finalizadoMatch) {
            status = "concluido"
          } else {
            // Se aparece mas não está finalizado, pode estar executando
            status = "executando"
          }
        }
      }
      
      // Marcar etapas anteriores como concluídas quando uma etapa posterior está executando
      if (etapasEncontradas && etapasEncontradas.length > 0) {
        const ultimaEtapaGeral = etapasEncontradas[etapasEncontradas.length - 1]
        const percentualEsperadoEstaEtapa = etapa.percentualEsperado || 0
        
        // Se a última etapa geral já passou desta etapa, ela está concluída
        if (ultimaEtapaGeral.percentual > percentualEsperadoEstaEtapa + 3 && status === "pendente") {
          status = "concluido"
        }
      }
      
      return {
        nome: etapa.nome,
        status,
        linhas,
        detalhes,
        percentual
      }
    })
    
    return etapasComStatus
  }

  const executarCalculo = async () => {
    if (!validarDatas()) {
      return
    }

    const usuarioId = user?.id ? Number(user.id) : null
    if (!usuarioId || Number.isNaN(usuarioId)) {
      toast({
        title: "Erro",
        description: "Não foi possível identificar o usuário logado para iniciar o cálculo.",
        variant: "destructive"
      })
      return
    }

    setExecutando(true)
    setResultado(null)
    setDf4SemPixData([])
    setErroTecnico(null)
    setValidado(false)
    setProgresso(0)
    setEtapaAtual("Executando...")
    // Inicializar etapas como pendentes
    setEtapasDetalhadas(etapasPrincipais.map(e => ({
      nome: e.nome,
      status: "pendente" as const
    })))

    // Intervalo para simular progresso baseado no tempo decorrido
    // Isso ajuda a atualizar as etapas mesmo sem resposta completa
    let intervaloProgresso: NodeJS.Timeout | null = null
    const startTime = Date.now()
    const tempoEstimadoTotal = 120000 // 2 minutos estimado (será ajustado dinamicamente)
    
    // Atualizar etapas periodicamente durante a execução
    intervaloProgresso = setInterval(() => {
      const tempoDecorrido = Date.now() - startTime
      const progressoEstimado = Math.min(95, (tempoDecorrido / tempoEstimadoTotal) * 100)
      
      // Atualizar etapas baseado no progresso estimado
      // Só atualizar se ainda não recebemos dados reais do backend
      setEtapasDetalhadas(prevEtapas => {
        // Se já temos etapas com status diferente de pendente, não sobrescrever
        // (isso significa que já recebemos dados reais)
        if (prevEtapas.some(e => e.status !== "pendente")) {
          return prevEtapas
        }
        
        // Caso contrário, atualizar baseado no tempo estimado
        return etapasPrincipais.map((etapaPrincipal, index) => {
          const percentualEsperado = etapaPrincipal.percentualEsperado || 0
          
          if (progressoEstimado > percentualEsperado + 3) {
            return {
              nome: etapaPrincipal.nome,
              status: "concluido" as const
            }
          } else if (progressoEstimado >= percentualEsperado - 5 && progressoEstimado <= percentualEsperado + 3) {
            return {
              nome: etapaPrincipal.nome,
              status: "executando" as const,
              percentual: Math.round(progressoEstimado)
            }
          }
          
          return {
            nome: etapaPrincipal.nome,
            status: "pendente" as const
          }
        })
      })
      
      // Só atualizar progresso se ainda não temos progresso real
      setProgresso(prev => prev === 0 ? Math.round(progressoEstimado) : prev)
    }, 1000) // Atualizar a cada segundo

    let currentRunId: string | null = null

    try {
      // Iniciar execução para reservar lock e obter run_id
      const dtReferencia =
        modo === "periodo"
          ? (dataInicial || dataFinal || formatDateISO(new Date()))
          : formatDateISO(new Date())

      const iniciarResponse = await fetch("/api/bonificacoes/calculo/iniciar", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          dt_referencia: dtReferencia,
          usuario_id: usuarioId,
          session_id: sessionId
        })
      })

      const iniciarData = await iniciarResponse.json()
      if (!iniciarResponse.ok || !iniciarData?.run_id) {
        throw new Error(iniciarData?.error || "Não foi possível iniciar o cálculo")
      }

      currentRunId = iniciarData.run_id
      setRunId(iniciarData.run_id)

      const response = await fetch("/api/bonificacoes/calcular", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          modo,
          data_inicial: modo === "periodo" ? dataInicial : undefined,
          data_final: modo === "periodo" ? dataFinal : undefined,
          run_id: currentRunId,
          session_id: sessionId,
          usuario_id: usuarioId
        })
      })

      const data: CalculoResponse & { etapas?: Array<{ etapa: string; percentual: number }> } = await response.json()

      if (!response.ok) {
        throw new Error(data.erro || "Erro ao executar cálculo")
      }


      // Extrair informações das etapas dos logs
      const etapasInfo = extrairInfoEtapas(data.logs || "", data.etapas)
      
      // Usar etapas reais do script Python se disponíveis
      if (data.etapas && data.etapas.length > 0) {
        const ultimaEtapa = data.etapas[data.etapas.length - 1]
        setEtapaAtual(ultimaEtapa.etapa)
        setProgresso(ultimaEtapa.percentual)
        
        // Encontrar todas as etapas reais que correspondem a cada etapa principal
        const etapasAtualizadas = etapasInfo.map((etapaInfo, index) => {
          const etapaPrincipal = etapasPrincipais[index]
          const percentualEsperado = etapaPrincipal?.percentualEsperado || 0
          
          // Buscar etapas reais que correspondem a esta etapa principal
          const etapasCorrespondentes = (data.etapas || []).filter(e => 
            etapaPrincipal.busca.some(termo => 
              e.etapa.toLowerCase().includes(termo.toLowerCase())
            )
          )
          
          // Se encontrou etapas correspondentes, usar a mais recente
          if (etapasCorrespondentes.length > 0) {
            const etapaCorrespondente = etapasCorrespondentes[etapasCorrespondentes.length - 1]
            
            // Se a etapa correspondente já passou do percentual esperado, está concluída
            if (etapaCorrespondente.percentual >= percentualEsperado + 2) {
              return { 
                ...etapaInfo, 
                status: "concluido" as const,
                percentual: etapaCorrespondente.percentual
              }
            }
            
            // Se está próximo ou no percentual esperado, está executando
            if (etapaCorrespondente.percentual >= percentualEsperado - 3) {
              return { 
                ...etapaInfo, 
                status: "executando" as const,
                percentual: etapaCorrespondente.percentual
              }
            }
          }
          
          // Se o percentual atual já passou desta etapa, marcar como concluída
          if (ultimaEtapa.percentual > percentualEsperado + 3) {
            return { ...etapaInfo, status: "concluido" as const, percentual: ultimaEtapa.percentual }
          }
          
          // Se o percentual atual está próximo ou nesta etapa, marcar como executando
          if (ultimaEtapa.percentual >= percentualEsperado - 5 && ultimaEtapa.percentual <= percentualEsperado + 3) {
            return { ...etapaInfo, status: "executando" as const, percentual: ultimaEtapa.percentual }
          }
          
          // Se ainda não chegou nesta etapa mas já passou das anteriores, manter status calculado
          return etapaInfo
        })
        
        setEtapasDetalhadas(etapasAtualizadas)
        
        // Se a última etapa já está em 100%, marcar tudo como concluído
        if (ultimaEtapa.percentual >= 100) {
          if (intervaloProgresso) {
            clearInterval(intervaloProgresso)
          }
          setEtapasDetalhadas(etapasInfo.map(e => ({ ...e, status: "concluido" as const })))
          setProgresso(100)
          setEtapaAtual("Cálculo concluído!")
        } else {
          // Ainda está executando, manter status atualizado
          setEtapasDetalhadas(etapasAtualizadas)
        }
      } else {
        // Se não há etapas específicas, usar a lógica padrão
        setEtapasDetalhadas(etapasInfo)
      }

      if (intervaloProgresso) {
        clearInterval(intervaloProgresso)
      }
      
      // Se chegou aqui e não marcou como concluído, verificar se sucesso
      if (data.sucesso && (!data.etapas || data.etapas.length === 0 || data.etapas[data.etapas.length - 1].percentual >= 100)) {
        setProgresso(100)
        setEtapaAtual("Cálculo concluído!")
        // Marcar todas as etapas como concluídas
        setEtapasDetalhadas(etapasInfo.map(e => ({ ...e, status: "concluido" as const })))
      }

      setResultado(data)
      
      // Armazenar data de movimentação (dt_pagamento) para poder excluir descontos se necessário
      // dt_movimentacao no banco vem de dt_pagamento do cálculo
      // Precisamos usar data_pagamento que é retornada pelo script Python
      let dataMovimentacaoParaArmazenar: string | null = null
      
      
      if (data.data_pagamento) {
        // Converter de ISO string para formato YYYY-MM-DD
        const dataPagamentoStr = data.data_pagamento
        
        // Se já está no formato YYYY-MM-DD, usar diretamente
        if (typeof dataPagamentoStr === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dataPagamentoStr)) {
          dataMovimentacaoParaArmazenar = dataPagamentoStr
        } else {
          // Tentar converter de ISO string para formato YYYY-MM-DD
          const dataPagamentoDate = new Date(dataPagamentoStr)
          if (!isNaN(dataPagamentoDate.getTime())) {
            dataMovimentacaoParaArmazenar = formatDateISO(dataPagamentoDate)
          } else {
            console.warn(`[CALCULO] Erro ao converter data_pagamento: ${dataPagamentoStr}`)
          }
        }
      } else {
        console.warn(`[CALCULO] data_pagamento não encontrado no resultado. Chaves disponíveis:`, Object.keys(data))
      }
      
      if (dataMovimentacaoParaArmazenar) {
        setDataApuracaoAtual(dataMovimentacaoParaArmazenar)
      } else {
        console.warn(`[CALCULO] Não foi possível capturar data de movimentação. data_pagamento no resultado: ${data.data_pagamento}`)
      }
      
      // Resetar estados de registro quando novos dados chegam
      setRegistradoUnifBonif(false)
      setRegistradoUnifCom(false)
      
      // Inicializar dados das tabelas editáveis
      if (data.unif_bonif) {
        setUnifBonifData(data.unif_bonif)
      }
      if (data.unif_com) {
        setUnifComData(data.unif_com)
      }
      setDf4SemPixData(normalizeDf4SemPix((data as any)?.df4_sem_pix || []))

      // Verificar se há erro de "Fora da data de virada"
      if (data.erro || !data.sucesso) {
        toast({
          title: "Aviso",
          description: data.erro || "Fora da data de virada",
          variant: "destructive"
        })
      } else {
        toast({
          title: "Sucesso",
          description: "Cálculo executado com sucesso. Revise os resultados antes de registrar."
        })
      }
    } catch (error: any) {
      if (intervaloProgresso) {
        clearInterval(intervaloProgresso)
      }
      setProgresso(0)
      setEtapaAtual("Erro na execução")
      console.error("Erro ao executar cálculo:", error)
      setErroTecnico(error.message || "Erro desconhecido")
      toast({
        title: "Erro",
        description: error.message || "Erro ao executar cálculo",
        variant: "destructive"
      })

      if (currentRunId) {
        try {
          await fetch("/api/bonificacoes/calculo/cancelar", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ run_id: currentRunId })
          })
        } catch (cancelError) {
          console.warn("[CALCULO] Falha ao cancelar execução após erro:", cancelError)
        } finally {
          setRunId(null)
        }
      }
    } finally {
      setExecutando(false)
    }
  }

  const registrar = async () => {
    if (!resultado || !validado) {
      return
    }

    setRegistrando(true)

    try {
      const usuarioId = user?.id ? Number(user.id) : null
      const response = await fetch("/api/bonificacoes/registrar", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          exec_id: resultado.exec_id,
          confirmado: true,
          run_id: runId,
          session_id: sessionId,
          usuario_id: usuarioId,
          dt_referencia: dataApuracaoAtual
        })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Erro ao registrar")
      }

      // Armazenar IDs dos descontos inseridos para poder excluir se necessário
      if (data.registros?.idsDescontos && Array.isArray(data.registros.idsDescontos)) {
        setIdsDescontosInseridos(data.registros.idsDescontos)
      }

      toast({
        title: "Sucesso",
        description: "Cálculo registrado com sucesso!",
      })

      // Limpar estado
      setResultado(null)
      setValidado(false)
      setDataInicial("")
      setDataFinal("")
      setIdsDescontosInseridos([])

    } catch (error: any) {
      console.error("Erro ao registrar:", error)
      toast({
        title: "Erro",
        description: error.message || "Erro ao registrar cálculo",
        variant: "destructive"
      })
    } finally {
      setRegistrando(false)
    }
  }

  const podeMostrarFinalizar = (() => {
    if (!runId) return false
    const temUnifBonif = unifBonifData.length > 0
    const temUnifCom = unifComData.length > 0

    if (temUnifBonif && temUnifCom) {
      return registradoUnifBonif && registradoUnifCom
    }
    if (temUnifBonif && !temUnifCom) {
      return registradoUnifBonif
    }
    if (!temUnifBonif && temUnifCom) {
      return registradoUnifCom
    }
    return false
  })()

  const cancelar = async ({ removerDescontos = true }: { removerDescontos?: boolean } = {}) => {
    if (removerDescontos && runId) {
      try {
        await fetch("/api/bonificacoes/calculo/cancelar", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ run_id: runId })
        })
      } catch (error) {
        console.warn("[CANCELAR] Falha ao cancelar execução no backend:", error)
      }
    } else if (removerDescontos) {
      // Verificar se há descontos para excluir antes de tentar excluir
      // Se não houver IDs de descontos inseridos e não houver indicadores de descontos, não precisa excluir nada
      const temDescontosPorIds = idsDescontosInseridos.length > 0
      
      // Verificar se há descontos pelos indicadores (desc_total diferente de zero)
      let temDescontosPorIndicadores = false
      if (resultado?.indicadores?.desc_total) {
        const descTotalStr = resultado.indicadores.desc_total
        // Remover formatação e converter para número
        const descTotalNum = parseFloat(descTotalStr.replace(/[^\d,]/g, "").replace(",", "."))
        temDescontosPorIndicadores = !isNaN(descTotalNum) && descTotalNum !== 0
      }
      
      // Se não há descontos (nem por IDs nem por indicadores), não precisa excluir nada
      if (!temDescontosPorIds && !temDescontosPorIndicadores) {
        // Continuar com a limpeza de estados sem tentar excluir
      }
      // Priorizar exclusão por IDs se disponíveis (descontos inseridos via API registrar)
      else if (temDescontosPorIds) {
        try {
          const response = await fetch("/api/bonificacoes/excluir-descontos", {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              ids: idsDescontosInseridos
            })
          })
          
          const responseData = await response.json()
          
          if (!response.ok) {
            throw new Error(responseData.error || "Erro ao excluir descontos")
          }
          
          
          if (responseData.registrosExcluidos > 0) {
            toast({
              title: "Descontos excluídos",
              description: `${responseData.registrosExcluidos} registro(s) de desconto foram excluídos.`,
            })
          }
        } catch (error: any) {
          console.error("[CANCELAR] Erro ao excluir descontos por IDs:", error)
          toast({
            title: "Aviso",
            description: `Não foi possível excluir os descontos automaticamente: ${error.message || "Erro desconhecido"}`,
            variant: "destructive"
          })
          // Não bloquear o cancelamento se houver erro ao excluir descontos
        }
      } 
      // Fallback: exclusão por data (para descontos inseridos pelo script Python antes do registro)
      else if (temDescontosPorIndicadores) {
        // Salvar dataApuracaoAtual antes de limpar estados (ela contém dt_movimentacao/dt_pagamento)
        let dataMovimentacaoParaExcluir = dataApuracaoAtual
        
        
        // Se não houver dataApuracaoAtual, tentar extrair do resultado
        if (!dataMovimentacaoParaExcluir && resultado) {
          // Tentar extrair data_pagamento do resultado
          const resultadoComData = resultado as any
          if (resultadoComData.data_pagamento) {
            const dataPagamentoStr = resultadoComData.data_pagamento
            
            const dataPagamentoDate = new Date(dataPagamentoStr)
            if (!isNaN(dataPagamentoDate.getTime())) {
              dataMovimentacaoParaExcluir = formatDateISO(dataPagamentoDate)
            }
          }
          
          // Se ainda não encontrou, tentar extrair de unif_bonif ou unif_com (dt_pagamento)
          if (!dataMovimentacaoParaExcluir && unifBonifData.length > 0) {
            const primeiraLinha = unifBonifData[0]
            if (primeiraLinha.dt_pagamento) {
              const dtPagamentoStr = primeiraLinha.dt_pagamento
              const dtPagamentoDate = new Date(dtPagamentoStr)
              if (!isNaN(dtPagamentoDate.getTime())) {
                dataMovimentacaoParaExcluir = formatDateISO(dtPagamentoDate)
              }
            }
          }
        }
        
        // Se houver data de movimentação, tentar excluir descontos registrados
        if (dataMovimentacaoParaExcluir) {
          // Validar formato da data (deve ser YYYY-MM-DD)
          const dataRegex = /^\d{4}-\d{2}-\d{2}$/
          if (!dataRegex.test(dataMovimentacaoParaExcluir)) {
            console.error(`[CANCELAR] Formato de data inválido: ${dataMovimentacaoParaExcluir}. Esperado: YYYY-MM-DD`)
            toast({
              title: "Aviso",
              description: `Formato de data inválido para exclusão de descontos: ${dataMovimentacaoParaExcluir}`,
              variant: "destructive"
            })
          } else {
            try {
              const response = await fetch("/api/bonificacoes/excluir-descontos", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json"
                },
                body: JSON.stringify({
                  dt_movimentacao: dataMovimentacaoParaExcluir
                })
              })
              
              const responseData = await response.json()
              
              if (!response.ok) {
                throw new Error(responseData.error || "Erro ao excluir descontos")
              }
              
              
              if (responseData.registrosExcluidos > 0) {
                toast({
                  title: "Descontos excluídos",
                  description: `${responseData.registrosExcluidos} registro(s) de desconto foram excluídos.`,
                })
              } else {
                console.warn(`[CANCELAR] Nenhum registro foi excluído. Verifique os logs do servidor.`)
              }
            } catch (error: any) {
              console.error("[CANCELAR] Erro ao excluir descontos:", error)
              toast({
                title: "Aviso",
                description: `Não foi possível excluir os descontos automaticamente: ${error.message || "Erro desconhecido"}`,
                variant: "destructive"
              })
              // Não bloquear o cancelamento se houver erro ao excluir descontos
            }
          }
        } else {
          console.warn("[CANCELAR] Nenhuma data de movimentação encontrada para excluir descontos")
          console.warn(`[CANCELAR] dataApuracaoAtual é: ${dataApuracaoAtual}`)
        }
      }
    } else {
    }
    
    // Limpar todos os estados
    setResultado(null)
    setValidado(false)
    setErroTecnico(null)
    setDataInicial("")
    setDataFinal("")
    setDataApuracaoAtual(null)
    setProgresso(0)
    setEtapaAtual("")
    setUnifBonifData([])
    setUnifComData([])
    setDf4SemPixData([])
    setValidadoUnifBonif(false)
    setValidadoUnifCom(false)
    setRegistradoUnifBonif(false)
    setRegistradoUnifCom(false)
    setIdsDescontosInseridos([])
    setRunId(null)
  }

  // Função para clonar dados antes do envio (sem alterar acentuação)
  const aplicarUnidecodeNosDados = (data: any[]): any[] => {
    return data.map(row => ({ ...row }))
  }

  // Funções para edição de unif_bonif
  const handleUnifBonifEdit = (rowIndex: number, field: string, value: any) => {
    if (registradoUnifBonif) return // Não permitir edição após registro
    const newData = [...unifBonifData]
    newData[rowIndex] = { ...newData[rowIndex], [field]: value }
    setUnifBonifData(newData)
  }

  const registrarUnifBonif = async (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault()
      e.stopPropagation()
    }
    if (!validadoUnifBonif || !resultado || registradoUnifBonif) return
    
    setRegistrandoUnifBonif(true)
    try {
      // Aplicar unidecode nos dados antes de enviar
      const dadosLimpos = aplicarUnidecodeNosDados(unifBonifData)
      
      const response = await fetch("/api/bonificacoes/registrar-unif-bonif", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          exec_id: resultado.exec_id,
          data: dadosLimpos,
          confirmado: true
        })
      })

      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error || "Erro ao registrar unif_bonif")
      }

      toast({
        title: "Sucesso",
        description: "unif_bonif registrado com sucesso!",
      })
      setRegistradoUnifBonif(true)
      setEditingUnifBonif(null) // Cancelar qualquer edição em andamento
    } catch (error: any) {
      console.error("Erro ao registrar unif_bonif:", error)
      toast({
        title: "Erro",
        description: error.message || "Erro ao registrar unif_bonif",
        variant: "destructive"
      })
    } finally {
      setRegistrandoUnifBonif(false)
    }
  }

  // Funções para edição de unif_com
  const handleUnifComEdit = (rowIndex: number, field: string, value: any) => {
    if (registradoUnifCom) return // Não permitir edição após registro
    const newData = [...unifComData]
    newData[rowIndex] = { ...newData[rowIndex], [field]: value }
    setUnifComData(newData)
  }

  const registrarUnifCom = async (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault()
      e.stopPropagation()
    }
    if (!validadoUnifCom || !resultado || registradoUnifCom) return
    
    setRegistrandoUnifCom(true)
    try {
      // Aplicar unidecode nos dados antes de enviar
      const dadosLimpos = aplicarUnidecodeNosDados(unifComData)
      
      const response = await fetch("/api/bonificacoes/registrar-unif-com", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          exec_id: resultado.exec_id,
          data: dadosLimpos,
          confirmado: true
        })
      })

      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error || "Erro ao registrar unif_com")
      }

      toast({
        title: "Sucesso",
        description: "unif_com registrado com sucesso!",
      })
      setRegistradoUnifCom(true)
      setEditingUnifCom(null) // Cancelar qualquer edição em andamento
    } catch (error: any) {
      console.error("Erro ao registrar unif_com:", error)
      toast({
        title: "Erro",
        description: error.message || "Erro ao registrar unif_com",
        variant: "destructive"
      })
    } finally {
      setRegistrandoUnifCom(false)
    }
  }

  // Função para parsear valor monetário formatado para número
  const parseCurrencyValue = (value: string): number => {
    if (!value) return 0
    // Remove formatação: R$, espaços, pontos (milhares) e converte vírgula para ponto
    const cleanValue = value.replace(/[R$\s]/g, '').replace(/\./g, '').replace(',', '.')
    const numValue = parseFloat(cleanValue)
    return isNaN(numValue) ? 0 : numValue
  }

  // Função para formatar valor monetário usando Intl.NumberFormat
  const formatCurrencyBRL = (value: string | number): string => {
    const numValue = typeof value === 'string' ? parseCurrencyValue(value) : value
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(numValue)
  }

  // Função para verificar se um valor é negativo
  const isNegative = (value: string): boolean => {
    if (!value) return false
    // Verifica se contém sinal negativo na string formatada
    if (value.includes('-')) return true
    // Remove formatação e tenta converter para número
    const numValue = parseCurrencyValue(value)
    return numValue < 0
  }

  // Função legacy para compatibilidade
  const formatCurrency = (value: string) => {
    return value || "R$ 0,00"
  }

  // Mapeamento de nomes de colunas para exibição
  const getColumnDisplayName = (key: string): string => {
    const columnNames: Record<string, string> = {
      'dt_pagamento': 'Data Pagamento',
      'dt_inicio_vigencia': 'Data Início Vigência',
      'dt_registro': 'Data Registro',
      'dt_analise': 'Data Análise',
      'dt_movimentacao': 'Data Movimentação',
      'dt_apuracao': 'Data Apuração',
      'dt_exclusao': 'Data Exclusão',
      'operadora': 'Operadora',
      'entidade': 'Entidade',
      'numero_proposta': 'Número Proposta',
      'cpf': 'CPF',
      'nome': 'Nome',
      'tipo_beneficiario': 'Tipo Beneficiário',
      'idade': 'Idade',
      'parcela': 'Parcela',
      'cnpj_concessionaria': 'CNPJ Concessionária',
      'cpf_corretor': 'CPF Corretor',
      'nome_corretor': 'Nome Corretor',
      'vlr_bruto_corretor': 'Valor Bruto Corretor',
      'id_beneficiario': 'ID Beneficiário',
      'chave_plano': 'Chave Plano',
      'cpf_supervisor': 'CPF Supervisor',
      'nome_supervisor': 'Nome Supervisor',
      'vlr_bruto_supervisor': 'Valor Bruto Supervisor',
      'descontado': 'Descontado',
      'chave_id': 'Chave ID',
      'NOME_RAZAO_SOCIAL': 'Nome/razão social',
      'CPF_CNPJ': 'Cpf/cnpj',
      'EMAIL': 'E-mail'
    }
    
    return columnNames[key.toLowerCase()] || key
      .split('_')
      .map(palavra => palavra.charAt(0).toUpperCase() + palavra.slice(1).toLowerCase())
      .join(' ')
  }

  // Função para verificar se um campo é de data
  const isDateField = (fieldName: string): boolean => {
    const dateFields = ['dt_pagamento', 'dt_inicio_vigencia', 'dt_registro', 'dt_analise', 'dt_movimentacao', 'dt_apuracao', 'dt_exclusao']
    return dateFields.some(df => fieldName.toLowerCase().includes(df.toLowerCase()) || fieldName.toLowerCase().includes('data') || fieldName.toLowerCase().includes('date'))
  }

  // Função para normalizar e corrigir caracteres corrompidos usando unidecode
  const normalizeValue = (value: any): string => {
    if (value === null || value === undefined) return ''
    if (typeof value === 'string') return value
    try {
      return String(value ?? '')
    } catch {
      return ''
    }
  }

  // Função para formatar data para exibição (apenas data, formato pt-BR)
  const formatDateDisplay = (value: any): string => {
    if (!value) return ''
    const formatted = formatDateBR(value)
    return formatted || String(value || '')
  }

  // Função para formatar data para input type="date" (YYYY-MM-DD)
  const formatDateForInput = (value: any): string => {
    if (!value) return ''
    return formatDateISO(value)
  }

  // Função para converter valor de input date para formato de banco
  const parseDateInput = (value: string): string => {
    if (!value) return ''
    return formatDateISO(value) || value
  }

  // Função para formatar nomes de filtros
  const formatarNomeFiltro = (key: string): string => {
    // Normalizar a chave para comparação (remover acentos e converter para minúsculas)
    const normalizeKey = (str: string) => {
      return unidecode(str)
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim()
    }
    
    // Limpar e normalizar a chave de entrada para evitar problemas de encoding
    let cleanKey = key.trim()
    
    // Detectar padrões conhecidos mesmo com encoding corrompido
    // Usar padrões base (sem acentos) para detectar chaves conhecidas
    const keyLowerNormalized = normalizeKey(cleanKey)
    
    // Mapear padrões normalizados para textos sem acentos (usando unidecode)
    // Incluir variações corrompidas (sem Ç) que devem ser convertidas para C
    const padroesNormalizados: Record<string, string> = {
      'nao elegivel': 'NAO ELEGIVEL',
      'nao_elegivel': 'NAO ELEGIVEL',
      'erro na chave': 'ERRO NA CHAVE',
      'erro_na_chave': 'ERRO NA CHAVE',
      'sem bonificacao': 'SEM BONIFICACAO',
      'sem_bonificacao': 'SEM BONIFICACAO',
      'sem bonificao': 'SEM BONIFICACAO', // Variação corrompida (sem Ç)
      'sem_bonificao': 'SEM BONIFICACAO', // Variação corrompida (sem Ç)
      'nao achou': 'NAO ACHOU',
      'nao_achou': 'NAO ACHOU',
      'faixa fora': 'FAIXA FORA',
      'faixa_fora': 'FAIXA FORA',
      'operadoras': 'OPERADORAS',
      'entidades': 'ENTIDADES',
      'concessionarias': 'CONCESSIONARIAS',
      'planos': 'PLANOS'
    }
    
    // Se encontrar um padrão normalizado conhecido, retornar texto sem acentos
    if (padroesNormalizados[keyLowerNormalized]) {
      return padroesNormalizados[keyLowerNormalized]
    }
    
    const normalizedKey = normalizeKey(cleanKey)
    
    // Mapeamento de chaves específicas para textos sem acentos
    // Incluir variações corrompidas (sem Ç) que devem ser convertidas para C
    const mapeamento: Record<string, string> = {
      'nao_elegivel': 'NAO ELEGIVEL',
      'nao elegivel': 'NAO ELEGIVEL',
      'não elegível': 'NAO ELEGIVEL',
      'não_elegível': 'NAO ELEGIVEL',
      'erro_na_chave': 'ERRO NA CHAVE',
      'erro na chave': 'ERRO NA CHAVE',
      'sem bonificacao': 'SEM BONIFICAÇÃO',
      'sem_bonificacao': 'SEM BONIFICAÇÃO',
      'Sem Bonificação': 'SEM BONIFICAÇÃO',
      'SEM BONIFICAÇÃO': 'SEM BONIFICAÇÃO',
      'sem bonificação': 'SEM BONIFICAÇÃO',
      'sem_bonificação': 'SEM BONIFICAÇÃO',
      'sem bonificao': 'SEM BONIFICAÇÃO', // Variação corrompida (sem Ç)
      'sem_bonificao': 'SEM BONIFICAÇÃO', // Variação corrompida (sem Ç)
      'SEM BONIFICAO': 'SEM BONIFICAÇÃO', // Variação corrompida (sem Ç)
      'nao_achou': 'NAO ACHOU',
      'nao achou': 'NAO ACHOU',
      'não achou': 'NAO ACHOU',
      'não_achou': 'NAO ACHOU',
      'erro': 'ERRO',
      'faixa_fora': 'FAIXA FORA',
      'faixa fora': 'FAIXA FORA',
      'faixa fora da': 'FAIXA FORA',
      'operadoras': 'OPERADORAS',
      'entidades': 'ENTIDADES',
      'concessionarias': 'CONCESSIONARIAS',
      'planos': 'PLANOS'
    }

    // Buscar no mapeamento usando a chave normalizada
    for (const [mapKey, mapValue] of Object.entries(mapeamento)) {
      if (normalizeKey(mapKey) === normalizedKey) {
        return mapValue
      }
    }
    
    // Se a chave original existe no mapeamento, usar diretamente
    if (mapeamento[cleanKey]) {
      return mapeamento[cleanKey]
    }

    // Caso contrário, formatar removendo underscores, capitalizando e removendo acentos com unidecode
    return unidecode(cleanKey)
      .split('_')
      .map((palavra: string) => palavra.charAt(0).toUpperCase() + palavra.slice(1).toLowerCase())
      .join(' ')
      .toUpperCase()
  }

  const hojeStr = formatDateISO(new Date())
  const DF4_SEM_PIX_COLUMNS = [
    { key: "NOME_RAZAO_SOCIAL", label: "Nome/razão social" },
    { key: "CPF_CNPJ", label: "Cpf/cnpj" },
    { key: "EMAIL", label: "E-mail" },
    { key: "CELULAR", label: "Celular" },
    { key: "VALOR", label: "Valor" }
  ]

  const normalizeDf4SemPix = (rows: any[]): any[] => {
    if (!Array.isArray(rows)) return []
    return rows.map((r) => ({
      NOME_RAZAO_SOCIAL:
        r?.NOME_RAZAO_SOCIAL ??
        r?.["NOME/RAZÃO SOCIAL"] ??
        r?.["NOME/RAZAO SOCIAL"] ??
        r?.nome_vendedor ??
        r?.nome ??
        "",
      CPF_CNPJ: r?.CPF_CNPJ ?? r?.["CPF/CNPJ"] ?? r?.cpf_vendedor ?? r?.cpf ?? "",
      EMAIL: r?.EMAIL ?? r?.["E-MAIL"] ?? r?.email ?? "",
      CELULAR: r?.CELULAR ?? r?.celular ?? "",
      VALOR: r?.VALOR ?? 0
    }))
  }

  return (
    <div className="w-full px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {showLeavePrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowLeavePrompt(false)} />
          <div className="relative z-10 w-full max-w-md bg-white dark:bg-zinc-900 rounded-2xl shadow-xl border p-6">
            <h2 className="text-lg font-semibold mb-2">Sair do cálculo?</h2>
            <p className="text-sm text-muted-foreground mb-6">Ao sair da tela o cálculo será cancelado.</p>
            <div className="flex w-full justify-center items-center gap-3 flex-wrap">
              <Button
                variant="outline"
                onClick={() => {
                  setShowLeavePrompt(false)
                  setPendingHref(null)
                }}
              >
                Continuar Cálculo
              </Button>
              <Button
                variant="outline"
                onClick={async () => {
                  try {
                    await cancelar()
                  } finally {
                    const href = pendingHref
                    const doBack = pendingBack
                    setShowLeavePrompt(false)
                    setPendingHref(null)
                    setPendingBack(false)
                    if (href) {
                      router.push(href)
                    } else if (doBack) {
                      router.back()
                    }
                  }
                }}
              >
                Sair
              </Button>
            </div>
          </div>
        </div>
      )}
      <div>
        <h1 className="text-3xl font-bold">Cálculo de bonificação</h1>
      </div>

      {/* Configuração de Execução - No topo */}
      <ConfiguracaoExecucaoCard
        modo={modo}
        defaultInicio={dataInicial}
        defaultFim={dataFinal}
        onExecutar={(params) => {
          // Atualizar estados locais antes de executar
          setModo(params.modo)
          if (params.modo === "periodo" && params.inicio && params.fim) {
            setDataInicial(params.inicio)
            setDataFinal(params.fim)
          } else if (params.modo === "automatico") {
            setDataInicial("")
            setDataFinal("")
          }
          // Executar cálculo - validarDatas() usará os estados atualizados
          setTimeout(() => executarCalculo(), 0)
        }}
        onCancelar={cancelar}
        isLoading={executando}
        loadingText={etapaAtual}
        showCancel={!!resultado}
      />

      {/* Erro técnico */}
      {erroTecnico && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Erro na execução</AlertTitle>
          <AlertDescription>
            {erroTecnico}
            <Button
              variant="link"
              className="p-0 h-auto mt-2"
              onClick={() => setDetalhesTecnicosAbertos(!detalhesTecnicosAbertos)}
            >
              {detalhesTecnicosAbertos ? "Ocultar" : "Mostrar"} detalhes técnicos
            </Button>
            {detalhesTecnicosAbertos && (
              <pre className="mt-2 text-xs bg-muted p-2 rounded overflow-auto">
                {erroTecnico}
              </pre>
            )}
          </AlertDescription>
        </Alert>
      )}

      {/* Aviso de "Fora da data de virada" */}
      {resultado && resultado.erro && resultado.erro.includes("Fora da data de virada") && (
        <Alert variant="warning">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Aviso</AlertTitle>
          <AlertDescription>
            {resultado.erro}. O registro não está disponível.
          </AlertDescription>
        </Alert>
      )}

      {/* Resumo de Indicadores */}
      {resultado && (
        <>
          {/* Resumo de Indicadores */}
          {resultado.indicadores && (
            <Card className="border shadow-sm bg-white dark:bg-gray-900 rounded-2xl overflow-hidden">
              <CardHeader className="pb-4">
                <CardTitle className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                  Resumo da Apuração
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* KPIs Principais */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {/* KPI: Vidas Faturadas */}
                  <div className="bg-gradient-to-br from-blue-50 to-blue-100/50 dark:from-blue-900/20 dark:to-blue-800/10 rounded-2xl p-4 border border-blue-100 dark:border-blue-800/30 shadow-sm">
                    <p className="text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wide mb-2">
                      Vidas Faturadas
                    </p>
                    <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                      {resultado.indicadores.prop_inicial?.toLocaleString('pt-BR') || '0'}
                    </p>
                  </div>

                  {/* KPI: Vidas Pagas */}
                  <div className="bg-gradient-to-br from-green-50 to-green-100/50 dark:from-green-900/20 dark:to-green-800/10 rounded-2xl p-4 border border-green-100 dark:border-green-800/30 shadow-sm">
                    <p className="text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wide mb-2">
                      Vidas Pagas
                    </p>
                    <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                      {resultado.indicadores.vidas_pagas?.toLocaleString('pt-BR') || '0'}
                    </p>
                  </div>

                  {/* KPI: Ticket Médio */}
                  <div className="bg-gradient-to-br from-purple-50 to-purple-100/50 dark:from-purple-900/20 dark:to-purple-800/10 rounded-2xl p-4 border border-purple-100 dark:border-purple-800/30 shadow-sm">
                    <p className="text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wide mb-2">
                      Ticket Médio
                    </p>
                    <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                      {formatCurrencyBRL(resultado.indicadores.ticket_medio)}
                    </p>
                  </div>
                </div>

                {/* Separador Sutil */}
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-gray-200 dark:border-gray-700"></div>
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-white dark:bg-gray-900 px-2 text-gray-500 dark:text-gray-400">
                      Resumo Financeiro
                    </span>
                  </div>
                </div>

                {/* Resumo Financeiro */}
                <div className="space-y-4">
                  {/* Total */}
                  <div className="bg-gray-50 dark:bg-gray-800/50 rounded-2xl p-5 border border-gray-200 dark:border-gray-700 shadow-sm">
                    <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-4 uppercase tracking-wide">
                      Total
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="space-y-1">
                        <p className="text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wide">
                          Produção
                        </p>
                        <p className="text-lg font-bold text-gray-900 dark:text-gray-100">
                          {formatCurrencyBRL(resultado.indicadores.vlr_bruto_total)}
                        </p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wide">
                          Desconto
                        </p>
                        <p className={`text-lg font-semibold ${
                          isNegative(resultado.indicadores.desc_total)
                            ? 'text-red-600 dark:text-red-400'
                            : 'text-gray-900 dark:text-gray-100'
                        }`}>
                          {formatCurrencyBRL(resultado.indicadores.desc_total)}
                        </p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wide">
                          Valor a Pagar
                        </p>
                        <p className="text-lg font-bold text-green-600 dark:text-green-400">
                          {formatCurrencyBRL(resultado.indicadores.vlr_liquido_total)}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Corretores */}
                  <div className="bg-gray-50 dark:bg-gray-800/50 rounded-2xl p-5 border border-gray-200 dark:border-gray-700 shadow-sm">
                    <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-4 uppercase tracking-wide">
                      Corretores
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="space-y-1">
                        <p className="text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wide">
                          Produção
                        </p>
                        <p className="text-lg font-bold text-gray-900 dark:text-gray-100">
                          {formatCurrencyBRL(resultado.indicadores.vlr_bruto_cor)}
                        </p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wide">
                          Desconto
                        </p>
                        <p className={`text-lg font-semibold ${
                          isNegative(resultado.indicadores.desc_cor)
                            ? 'text-red-600 dark:text-red-400'
                            : 'text-gray-900 dark:text-gray-100'
                        }`}>
                          {formatCurrencyBRL(resultado.indicadores.desc_cor)}
                        </p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wide">
                          Valor a Pagar
                        </p>
                        <p className="text-lg font-bold text-green-600 dark:text-green-400">
                          {formatCurrencyBRL(resultado.indicadores.vlr_liquido_cor)}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Supervisores */}
                  <div className="bg-gray-50 dark:bg-gray-800/50 rounded-2xl p-5 border border-gray-200 dark:border-gray-700 shadow-sm">
                    <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-4 uppercase tracking-wide">
                      Supervisores
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="space-y-1">
                        <p className="text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wide">
                          Produção
                        </p>
                        <p className="text-lg font-bold text-gray-900 dark:text-gray-100">
                          {formatCurrencyBRL(resultado.indicadores.vlr_bruto_sup)}
                        </p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wide">
                          Desconto
                        </p>
                        <p className={`text-lg font-semibold ${
                          isNegative(resultado.indicadores.desc_sup)
                            ? 'text-red-600 dark:text-red-400'
                            : 'text-gray-900 dark:text-gray-100'
                        }`}>
                          {formatCurrencyBRL(resultado.indicadores.desc_sup)}
                        </p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wide">
                          Valor a Pagar
                        </p>
                        <p className="text-lg font-bold text-green-600 dark:text-green-400">
                          {formatCurrencyBRL(resultado.indicadores.vlr_liquido_sup)}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Preview df5 */}
          {resultado.preview_df5 && resultado.preview_df5.length > 0 && (
                <Card className="border shadow-sm bg-white">
                  <CardHeader>
                    <CardTitle>Preview - Dados de Análise (df5)</CardTitle>
                    <CardDescription>
                      Primeiras 50 linhas do resultado
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="h-[400px] w-full">
                      <Table>
                        <TableHeader>
                          {Object.keys(resultado.preview_df5[0] || {}).map((key) => (
                            <TableHead key={key} className="text-xs">
                              {key}
                            </TableHead>
                          ))}
                        </TableHeader>
                        <TableBody>
                          {resultado.preview_df5.map((row, idx) => (
                            <TableRow key={idx}>
                              {Object.values(row).map((value: any, cellIdx) => (
                                <TableCell key={cellIdx} className="text-xs">
                                  {String(value || "")}
                                </TableCell>
                              ))}
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </ScrollArea>
                  </CardContent>
            </Card>
          )}

          {/* Filtros, Sem Registro e Merges - Apenas se houver erro no merge ou itens encontrados */}
          {resultado && (() => {
            // Verificar se há erros no merge (algum merge com valor diferente de "Certo")
            const temErroMerge = resultado.merges && Object.values(resultado.merges).some(valor => valor !== "Certo")
            
            // Verificar se há filtros com itens (arrays não vazios)
            const temFiltrosComItens = resultado.filtros && Object.entries(resultado.filtros).some(
              ([_, values]) => Array.isArray(values) && values.length > 0
            )
            
            // Verificar se há sem_registro com itens (arrays não vazios)
            const temSemRegistroComItens = resultado.sem_registro && Object.entries(resultado.sem_registro).some(
              ([_, values]) => Array.isArray(values) && values.length > 0
            )
            
            // Só exibir se houver erro no merge ou itens encontrados
            if (!temErroMerge && !temFiltrosComItens && !temSemRegistroComItens) {
              return null
            }
            
            return (
              <Card className="border shadow-sm bg-white">
                  <CardHeader>
                    <CardTitle>Detalhes Adicionais</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Accordion type="single" collapsible className="w-full">
                      {temFiltrosComItens && (
                        <AccordionItem value="filtros">
                          <AccordionTrigger>Filtros</AccordionTrigger>
                          <AccordionContent>
                            {Object.entries(resultado.filtros).map(([key, values]) => {
                              // Só mostrar se tiver itens
                              if (!Array.isArray(values) || values.length === 0) return null
                              return (
                                <div key={key} className="mb-4">
                                  <p className="font-semibold mb-1">{formatarNomeFiltro(key)}</p>
                                  <ul className="list-disc list-inside text-sm space-y-1">
                                    {values.map((value, idx) => (
                                      <li key={idx}>{String(value)}</li>
                                    ))}
                                  </ul>
                                </div>
                              )
                            })}
                          </AccordionContent>
                        </AccordionItem>
                      )}

                      {temSemRegistroComItens && (
                        <AccordionItem value="sem_registro">
                          <AccordionTrigger>Informações não registradas</AccordionTrigger>
                          <AccordionContent>
                            {Object.entries(resultado.sem_registro).map(([key, values]) => {
                              // Só mostrar se tiver itens
                              if (!Array.isArray(values) || values.length === 0) return null
                              return (
                                <div key={key} className="mb-4">
                                  <p className="font-semibold mb-1">{formatarNomeFiltro(key)}</p>
                                  <ul className="list-disc list-inside text-sm space-y-1">
                                    {values.map((value, idx) => (
                                      <li key={idx}>{String(value)}</li>
                                    ))}
                                  </ul>
                                </div>
                              )
                            })}
                          </AccordionContent>
                        </AccordionItem>
                      )}

                      {temErroMerge && (
                        <AccordionItem value="merges">
                          <AccordionTrigger>Status de Merges</AccordionTrigger>
                          <AccordionContent>
                            {Object.entries(resultado.merges).map(([key, value]) => {
                              // Só mostrar merges com erro
                              if (value === "Certo") return null
                              return (
                                <div key={key} className="flex items-center justify-between mb-2">
                                  <span className="text-sm">{key}</span>
                                  <Badge variant="destructive">
                                    {value}
                                  </Badge>
                                </div>
                              )
                            })}
                          </AccordionContent>
                        </AccordionItem>
                      )}
                    </Accordion>
                  </CardContent>
                </Card>
            )
          })()}

          {/* Tabela unif_bonif editável */}
          {resultado && unifBonifData.length > 0 && (
            <Card className="border shadow-sm bg-white">
              <CardHeader>
                <CardTitle>Unificado Bonificação ({unifBonifData.length} linha{unifBonifData.length !== 1 ? 's' : ''})</CardTitle>
                <CardDescription>
                  Analise e edite os dados antes de registrar
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="overflow-auto max-h-[600px] border rounded-md">
                  <Table className="min-w-full">
                    <TableHeader className="sticky top-0 z-10">
                      <TableRow>
                        {Object.keys(unifBonifData[0] || {}).filter(key => key !== 'desc').map((key) => (
                          <TableHead key={key} className="text-xs whitespace-nowrap">
                            {getColumnDisplayName(key)}
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {unifBonifData.map((row, idx) => (
                        <TableRow key={idx}>
                          {Object.entries(row)
                            .filter(([key]) => key !== 'desc')
                            .map(([key, value]) => {
                              const isDate = isDateField(key)
                              return (
                                <TableCell key={key} className="text-xs whitespace-nowrap">
                                  {!registradoUnifBonif && editingUnifBonif?.rowIndex === idx && editingUnifBonif?.field === key ? (
                                    isDate ? (
                                      <Input
                                        type="date"
                                        value={formatDateForInput(value)}
                                        onChange={(e) => handleUnifBonifEdit(idx, key, parseDateInput(e.target.value))}
                                        onBlur={() => setEditingUnifBonif(null)}
                                        className="h-8 text-xs w-32"
                                        autoFocus
                                      />
                                    ) : (
                                      <Input
                                        value={normalizeValue(value)}
                                        onChange={(e) => handleUnifBonifEdit(idx, key, e.target.value)}
                                        onBlur={() => setEditingUnifBonif(null)}
                                        className="h-8 text-xs"
                                        autoFocus
                                      />
                                    )
                                  ) : (
                                    <div
                                      onClick={() => !registradoUnifBonif && setEditingUnifBonif({ rowIndex: idx, field: key })}
                                      className={registradoUnifBonif ? "p-1" : "cursor-pointer hover:bg-muted p-1 rounded"}
                                    >
                                      {isDate ? formatDateDisplay(value) : normalizeValue(value)}
                                    </div>
                                  )}
                                </TableCell>
                              )
                            })}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <div className="space-y-3">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="validadoUnifBonif"
                      checked={validadoUnifBonif}
                      onCheckedChange={(checked) => !registradoUnifBonif && setValidadoUnifBonif(checked === true)}
                      disabled={registradoUnifBonif}
                    />
                    <Label htmlFor="validadoUnifBonif" className={registradoUnifBonif ? "cursor-not-allowed opacity-60" : "cursor-pointer"}>
                      Li e validei os dados acima
                    </Label>
                  </div>
                  <Button
                    onClick={registrarUnifBonif}
                    disabled={registradoUnifBonif || !validadoUnifBonif || registrandoUnifBonif}
                    className={`w-full ${registradoUnifBonif ? "bg-green-800 hover:bg-green-600 text-white" : ""}`}
                    type="button"
                  >
                    {registrandoUnifBonif ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Registrando...
                      </>
                    ) : registradoUnifBonif ? (
                      <>
                        <CheckCircle2 className="mr-2 h-4 w-4" />
                        Registrado
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="mr-2 h-4 w-4" />
                        Registrar
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Tabela unif_com editável */}
          {resultado && unifComData.length > 0 && (
            <Card className="border shadow-sm bg-white">
              <CardHeader>
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <CardTitle>Unificado Comercial ({unifComData.length} linha{unifComData.length !== 1 ? 's' : ''})</CardTitle>
                    <CardDescription>
                      Analise e edite os dados antes de registrar
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      onClick={() => exportPedidoE()}
                      disabled={exportingPedidoE || unifComData.length === 0}
                    >
                      {exportingPedidoE ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Gerando...
                        </>
                      ) : (
                        <>
                          <Download className="mr-2 h-4 w-4" />
                          Baixar pedido E+
                        </>
                      )}
                    </Button>
                    
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="overflow-auto max-h-[600px] border rounded-md">
                  <Table className="min-w-full">
                    <TableHeader className="sticky top-0 bg-white z-10">
                      <TableRow>
                        {Object.keys(unifComData[0] || {}).filter(key => key !== 'desc').map((key) => (
                          <TableHead key={key} className="text-xs whitespace-nowrap">
                            {getColumnDisplayName(key)}
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {unifComData.map((row, idx) => (
                        <TableRow key={idx}>
                          {Object.entries(row)
                            .filter(([key]) => key !== 'desc')
                            .map(([key, value]) => {
                              const isDate = isDateField(key)
                              return (
                                <TableCell key={key} className="text-xs whitespace-nowrap">
                                  {!registradoUnifCom && editingUnifCom?.rowIndex === idx && editingUnifCom?.field === key ? (
                                    isDate ? (
                                      <Input
                                        type="date"
                                        value={formatDateForInput(value)}
                                        onChange={(e) => handleUnifComEdit(idx, key, parseDateInput(e.target.value))}
                                        onBlur={() => setEditingUnifCom(null)}
                                        className="h-8 text-xs w-32"
                                        autoFocus
                                      />
                                    ) : (
                                      <Input
                                        value={normalizeValue(value)}
                                        onChange={(e) => handleUnifComEdit(idx, key, e.target.value)}
                                        onBlur={() => setEditingUnifCom(null)}
                                        className="h-8 text-xs"
                                        autoFocus
                                      />
                                    )
                                  ) : (
                                    <div
                                      onClick={() => !registradoUnifCom && setEditingUnifCom({ rowIndex: idx, field: key })}
                                      className={registradoUnifCom ? "p-1" : "cursor-pointer hover:bg-muted p-1 rounded"}
                                    >
                                      {isDate ? formatDateDisplay(value) : normalizeValue(value)}
                                    </div>
                                  )}
                                </TableCell>
                              )
                            })}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <div className="space-y-3">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="validadoUnifCom"
                      checked={validadoUnifCom}
                      onCheckedChange={(checked) => !registradoUnifCom && setValidadoUnifCom(checked === true)}
                      disabled={registradoUnifCom}
                    />
                    <Label htmlFor="validadoUnifCom" className={registradoUnifCom ? "cursor-not-allowed opacity-60" : "cursor-pointer"}>
                      Li e validei os dados acima
                    </Label>
                  </div>
                  <Button
                    onClick={registrarUnifCom}
                    disabled={registradoUnifCom || !validadoUnifCom || registrandoUnifCom}
                    className={`w-full ${registradoUnifCom ? "bg-green-800 hover:bg-green-700 text-white" : ""}`}
                    type="button"
                  >
                    {registrandoUnifCom ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Registrando...
                      </>
                    ) : registradoUnifCom ? (
                      <>
                        <CheckCircle2 className="mr-2 h-4 w-4" />
                        Registrado
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="mr-2 h-4 w-4" />
                        Registrar
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Tabela DF4 sem Pix (somente visualização) */}
          {resultado && resultado.sucesso && df4SemPixData.length > 0 && (
            <Card className="border shadow-sm bg-white">
              <CardHeader>
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <CardTitle>Vendedor sem pix</CardTitle>
                    <CardDescription>
                      Dados exibidos apenas para consulta. Esta tabela não é registrada no banco.
                    </CardDescription>
                  </div>
                  <Button
                    variant="outline"
                    disabled={!Array.isArray(df4SemPixData) || df4SemPixData.length === 0}
                    onClick={async () => {
                      const XLSX = await getXLSX()
                      downloadXlsxFromObjects(
                        df4SemPixData,
                        `cadastro_E_plus_df4_sem_pix_${new Date().toISOString().slice(0, 16).replace("T", "_")}.xlsx`,
                        XLSX
                      )
                      toast({ title: "Arquivo gerado com sucesso" })
                    }}
                  >
                    <Download className="mr-2 h-4 w-4" />
                    Baixar cadastro E+
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="overflow-auto max-h-[600px] border rounded-md">
                  <Table className="min-w-full">
                    <TableHeader className="sticky top-0 bg-white z-10">
                      <TableRow>
                        {DF4_SEM_PIX_COLUMNS.map((column) => (
                          <TableHead
                            key={column.key}
                            className="text-xs whitespace-nowrap px-2 py-1"
                          >
                            {column.label}
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {df4SemPixData.map((row, idx) => (
                        <TableRow key={idx}>
                          {DF4_SEM_PIX_COLUMNS.map((column) => {
                            const value = (row as any)?.[column.key]
                            const isDate = isDateField(column.key)
                            return (
                              <TableCell key={column.key} className="text-xs whitespace-nowrap px-2 py-1">
                                {isDate ? formatDateDisplay(value) : normalizeValue(value)}
                              </TableCell>
                            )
                          })}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}

          {resultado && resultado.sucesso && df4SemPixData.length === 0 && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Vendedor sem pix</AlertTitle>
              <AlertDescription>Nenhum vendedor sem pix.</AlertDescription>
            </Alert>
          )}

          {/* Botão Fechar Resumo - aparece quando todas as tabelas disponíveis foram registradas */}
          {podeMostrarFinalizar && (
            <Card className="border shadow-sm bg-white">
              <CardContent className="py-6">
                <div className="flex justify-center">
                  <Button
                    onClick={finalizarCalculo}
                    variant="outline"
                    className="w-full sm:w-auto"
                    type="button"
                  >
                    Finalizar
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

        </>
      )}

      {!resultado && !executando && (
        <Card className="border shadow-sm bg-white">
          <CardContent className="py-12 text-center text-muted-foreground">
            Execute o cálculo para ver os resultados aqui
          </CardContent>
        </Card>
      )}
    </div>
  )
}


