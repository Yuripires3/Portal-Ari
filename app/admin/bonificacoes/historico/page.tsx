"use client"

import { useEffect, useState, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"
import { Plus, X, Trash2, ChevronLeft, ChevronRight, XCircle, Pencil, Check, Download, Loader2 } from "lucide-react"
import { useAuth } from "@/components/auth/auth-provider"
import { canCreateRules, canDeleteRules, canEditRules, normalizeClassification } from "@/lib/permissions"
import { signalPageLoaded } from "@/components/ui/page-loading"
import { formatCurrency } from "@/utils/bonificacao"
import jsPDF from "jspdf"
import autoTable from "jspdf-autotable"
import { formatDateBR, formatDateISO, getDateParts } from "@/lib/date-utils"
import QvLogoImage from "@/logo/qv-beneficios.png"
import { usePersistentState } from "@/hooks/usePersistentState"

interface HistoricoData {
  id?: number
  cpf?: string
  nome?: string
  valor_carga?: number | string
  valor_bruto?: number | string | null
  desconto_realizado?: number | string | null
  tipo_cartao?: string
  premiacao?: number | string
  tipo_premiado?: string
  mes_apurado?: string
  obs?: string
  dt_pagamento?: string
  chave_pix?: string | null
  tipo_chave?: string | null
}

const formatCpf = (cpf: string | null | undefined): string => {
  if (!cpf) return ""
  // Remove qualquer caractere não numérico
  const numericCpf = cpf.replace(/\D/g, "")
  // Preenche com zeros à esquerda se tiver menos de 11 dígitos
  const paddedCpf = numericCpf.padStart(11, "0")
  // Formata como XXX.XXX.XXX-XX
  if (paddedCpf.length === 11) {
    return `${paddedCpf.slice(0, 3)}.${paddedCpf.slice(3, 6)}.${paddedCpf.slice(6, 9)}-${paddedCpf.slice(9, 11)}`
  }
  return paddedCpf
}

// Normalizar CPF para banco (apenas números, máximo 11 dígitos)
const normalizeCpfForDb = (cpf: string | null | undefined): string | null => {
  if (!cpf) return null
  // Remove qualquer caractere não numérico
  const numericCpf = cpf.replace(/\D/g, "")
  // Limita a 11 dígitos
  return numericCpf.slice(0, 11) || null
}

// Obter mês atual no formato MMM/YY (mês com 3 letras em português, ano com 2 dígitos)
const getCurrentMonth = (): string => {
  const now = new Date()
  const monthIndex = now.getMonth()
  const year = String(now.getFullYear()).slice(-2) // Últimos 2 dígitos do ano
  
  // Abreviações dos meses em português
  const meses = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
  const month = meses[monthIndex] // Mês com 3 letras (jan, fev, out, etc.)
  
  return `${month}/${year}`
}

interface ApiResponse {
  data?: HistoricoData[]
  pagination?: {
    page: number
    pageSize: number
    total: number
    totalPages: number
  }
  error?: string
}

type HistoricoFilters = {
  cpf: string
  nome: string
  tipo_premiado: string
  dt_pagamento_inicio: string
}

const HISTORICO_FILTER_STORAGE_KEY = "admin-historico-bonificacoes"
const createEmptyHistoricoFilters = (): HistoricoFilters => ({
  cpf: "",
  nome: "",
  tipo_premiado: "",
  dt_pagamento_inicio: ""
})

export default function HistoricoBonificacoesPage() {
  const { toast } = useToast()
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [data, setData] = useState<HistoricoData[]>([])
  const [page, setPage] = useState(1)
  const [pageSize] = useState(20)
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(0)

  // Permissões
  const canCreate = canCreateRules(user)
  const canDelete = canDeleteRules(user)
  const canEdit = canEditRules(user) // Admin e usuário podem editar, COMERCIAL não pode

  // Estado para edição inline
  const [editingRow, setEditingRow] = useState<number | null>(null)
  const [editedData, setEditedData] = useState<{ [key: string]: any }>({})
  const [originalData, setOriginalData] = useState<{ [key: string]: any }>({})

  // Filtros
  const [filters, setFilters] = usePersistentState<HistoricoFilters>(
    `${HISTORICO_FILTER_STORAGE_KEY}:filters`,
    createEmptyHistoricoFilters
  )
  
  const [generatingPdf, setGeneratingPdf] = useState(false)
  const [generatingPedidoE, setGeneratingPedidoE] = useState(false)
  const userClassification = normalizeClassification(user)
  const canGeneratePedidoE = userClassification === "ADMIN" || userClassification === "USUARIO"

  // Tipos de premiado disponíveis
  const [tiposPremiado, setTiposPremiado] = useState<string[]>([])
  const [tiposCartao, setTiposCartao] = useState<string[]>([])
  const [premiacoes, setPremiacoes] = useState<string[]>([])
  const [tiposPremiacao, setTiposPremiacao] = useState<string[]>([])
  const isInitialLoad = useRef(true)

  // Formulário
  const [formData, setFormData] = useState<HistoricoData>({
    cpf: "",
    nome: "",
    valor_carga: "",
    tipo_cartao: "",
    premiacao: "",
    tipo_premiado: "",
    mes_apurado: getCurrentMonth(), // Preencher automaticamente com o mês atual
    obs: "",
    dt_pagamento: ""
  })

  // Estados para autocomplete de CPF no formulário
  const [cpfQuery, setCpfQuery] = useState("")
  const [cpfFocused, setCpfFocused] = useState(false)
  const [cpfSuggestions, setCpfSuggestions] = useState<Array<{ cpf: string; nome: string; formattedCpf: string }>>([])

  // Estados para autocomplete de CPF no filtro
  const [filterCpfQuery, setFilterCpfQuery] = useState("")
  const [filterCpfFocused, setFilterCpfFocused] = useState(false)
  const [filterCpfSuggestions, setFilterCpfSuggestions] = useState<Array<{ cpf: string; nome: string; formattedCpf: string }>>([])

  // Carregar tipos de premiado
  const fetchTiposPremiado = async () => {
    try {
      const response = await fetch(`/api/bonificacoes/historico?action=getTiposPremiado`)
      if (response.ok) {
        const result = await response.json()
        setTiposPremiado(result.tipos || [])
      }
    } catch (error) {
      console.error("Erro ao carregar tipos de premiado:", error)
    }
  }

  // Carregar tipos de cartão
  const fetchTiposCartao = async () => {
    try {
      const response = await fetch(`/api/bonificacoes/historico?action=getTiposCartao`)
      if (response.ok) {
        const result = await response.json()
        setTiposCartao(result.tiposCartao || [])
      }
    } catch (error) {
      console.error("Erro ao carregar tipos de cartão:", error)
    }
  }

  // Carregar premiações
  const fetchPremiacoes = async () => {
    try {
      const response = await fetch(`/api/bonificacoes/historico?action=getPremiacoes`)
      if (response.ok) {
        const result = await response.json()
        setPremiacoes(result.premiacoes || [])
      }
    } catch (error) {
      console.error("Erro ao carregar premiações:", error)
    }
  }

  // Carregar tipos de premiação
  const fetchTiposPremiacao = async () => {
    try {
      const response = await fetch(`/api/bonificacoes/historico?action=getTiposPremiacao`)
      if (response.ok) {
        const result = await response.json()
        setTiposPremiacao(result.tiposPremiacao || [])
      }
    } catch (error) {
      console.error("Erro ao carregar tipos de premiação:", error)
    }
  }

  // Carregar dados
  const fetchData = async (skipLoadingState = false) => {
    if (!skipLoadingState) {
      setLoading(true)
    }
    try {
      const params = new URLSearchParams()
      params.append("page", page.toString())
      params.append("pageSize", pageSize.toString())
      // Ordenação fixa: dt_pagamento DESC, nome ASC (definida na API)

      if (filters.cpf) params.append("cpf", filters.cpf)
      if (filters.nome) params.append("nome", filters.nome)
      if (filters.tipo_premiado) params.append("tipo_premiado", filters.tipo_premiado)
      if (filters.dt_pagamento_inicio) params.append("dt_pagamento_inicio", filters.dt_pagamento_inicio)

      const response = await fetch(`/api/bonificacoes/historico?${params}`)
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const result: ApiResponse = await response.json()

      if (result.error) {
        console.error("Erro na resposta:", result.error)
        toast({
          title: "Erro ao carregar dados",
          description: result.error,
          variant: "destructive",
        })
        setData([])
        setTotal(0)
        setTotalPages(0)
        return
      }

      // Garantir que sempre definimos os dados, mesmo que seja um array vazio
      setData(Array.isArray(result.data) ? result.data : [])
      setTotal(result.pagination?.total || 0)
      setTotalPages(result.pagination?.totalPages || 0)
      
      // Se não há dados mas há filtros aplicados, mostrar mensagem informativa
    } catch (error) {
      console.error("Erro ao carregar histórico:", error)
      toast({
        title: "Erro",
        description: "Erro ao carregar histórico de bonificações",
        variant: "destructive",
      })
      setData([])
      setTotal(0)
      setTotalPages(0)
    } finally {
      if (!skipLoadingState) {
        setLoading(false)
        signalPageLoaded()
      }
    }
  }

  // Carregar todos os dados necessários na inicialização
  const loadAllData = async () => {
    setLoading(true)
    try {
      await Promise.all([
        fetchTiposPremiado(),
        fetchTiposCartao(),
        fetchPremiacoes(),
        fetchTiposPremiacao(),
        fetchData(true)
      ])
    } catch (error) {
      console.error("Erro ao carregar dados:", error)
    } finally {
      setLoading(false)
      signalPageLoaded()
    }
  }

  useEffect(() => {
    loadAllData().then(() => {
      isInitialLoad.current = false
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    // Só recarrega dados quando page ou filters mudarem (não na inicialização)
    if (!isInitialLoad.current) {
      fetchData()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, filters])

  // Buscar sugestões de CPF no formulário com debounce
  useEffect(() => {
    const timer = setTimeout(async () => {
      // Remove formatação para buscar na API
      const numericQuery = cpfQuery.replace(/\D/g, "")
      if (numericQuery.length >= 2) {
        try {
          const response = await fetch(`/api/bonificacoes/historico/cpf-suggestions?q=${encodeURIComponent(numericQuery)}`)
          if (response.ok) {
            const result = await response.json()
            setCpfSuggestions(result.suggestions || [])
          } else {
            setCpfSuggestions([])
          }
        } catch (error) {
          console.error("Erro ao buscar sugestões de CPF:", error)
          setCpfSuggestions([])
        }
      } else {
        setCpfSuggestions([])
      }
    }, 300)

    return () => clearTimeout(timer)
  }, [cpfQuery])

  // Buscar sugestões de CPF no filtro com debounce
  useEffect(() => {
    const timer = setTimeout(async () => {
      // Remove formatação para buscar na API
      const numericQuery = filterCpfQuery.replace(/\D/g, "")
      if (numericQuery.length >= 2) {
        try {
          const response = await fetch(`/api/bonificacoes/historico/cpf-suggestions?q=${encodeURIComponent(numericQuery)}`)
          if (response.ok) {
            const result = await response.json()
            setFilterCpfSuggestions(result.suggestions || [])
          } else {
            setFilterCpfSuggestions([])
          }
        } catch (error) {
          console.error("Erro ao buscar sugestões de CPF no filtro:", error)
          setFilterCpfSuggestions([])
        }
      } else {
        setFilterCpfSuggestions([])
      }
    }, 300)

    return () => clearTimeout(timer)
  }, [filterCpfQuery])

  // Sincronizar cpfQuery quando formData.cpf mudar externamente (ex: limpar formulário)
  useEffect(() => {
    if (!formData.cpf && cpfQuery && !cpfFocused) {
      setCpfQuery("")
    }
  }, [formData.cpf, cpfFocused])

  // Sincronizar filterCpfQuery quando filters.cpf mudar externamente (ex: limpar filtros)
  useEffect(() => {
    if (!filters.cpf && filterCpfQuery && !filterCpfFocused) {
      setFilterCpfQuery("")
    }
  }, [filters.cpf, filterCpfFocused])

  const handleFilterChange = (key: keyof HistoricoFilters, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }))
    setPage(1) // Reset para primeira página ao filtrar
  }

  const clearFilters = () => {
    setFilters(createEmptyHistoricoFilters())
    setFilterCpfQuery("")
    setPage(1)
  }
  
  // Função para formatar mês no formato MMM/yy
  const formatMonthBR = (dateString: string | null | undefined): string => {
    if (!dateString) return ""
    const parts = getDateParts(dateString)
    if (!parts) return ""
    const monthIndex = parts.month - 1
    if (monthIndex < 0 || monthIndex > 11) return ""
    const meses = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
    const year = String(parts.year).slice(-2)
    return `${meses[monthIndex]}/${year}`
  }
  
  // Função para calcular dataPagamento - 1 dia (ou -3 se for segunda-feira para pegar a sexta anterior)
  const getDataConfirmacoes = (dataPagamento: string): string => {
    if (!dataPagamento) return ""
    try {
      // Parsear a data diretamente do formato YYYY-MM-DD
      const [year, month, day] = dataPagamento.split('-').map(Number)
      
      // Criar data local para verificar o dia da semana
      const date = new Date(year, month - 1, day)
      
      // Verificar o dia da semana da data de pagamento
      // 0 = domingo, 1 = segunda, 2 = terça, 3 = quarta, 4 = quinta, 5 = sexta, 6 = sábado
      const dayOfWeek = date.getDay()
      
      // Se for segunda-feira (1), subtrai 3 dias para pegar a sexta-feira anterior
      // Nos demais dias, subtrai 1 dia para pegar o dia anterior
      const daysToSubtract = dayOfWeek === 1 ? 3 : 1
      
      // Criar nova data subtraindo os dias diretamente
      // O construtor Date ajusta automaticamente se passar dos limites do mês
      const resultDate = new Date(year, month - 1, day - daysToSubtract)
      
      // Formatar diretamente sem conversão ISO para evitar problemas de fuso
      const resultYear = resultDate.getFullYear()
      const resultMonth = String(resultDate.getMonth() + 1).padStart(2, '0')
      const resultDay = String(resultDate.getDate()).padStart(2, '0')
      
      return `${resultDay}/${resultMonth}/${resultYear}`
    } catch (error) {
      console.error("Erro ao calcular data das confirmações:", error)
      return ""
    }
  }
  
  // Helper: carregar biblioteca XLSX (com suporte a estilos) dinamicamente
  const getXLSX = async (): Promise<any> => {
    if (typeof window === "undefined") {
      throw new Error("XLSX só pode ser carregado no browser")
    }

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

      const script = document.createElement("script")
      script.src = "https://cdn.jsdelivr.net/npm/xlsx-js-style@1.2.0/dist/xlsx.min.js"
      script.async = true
      script.onload = () => {
        try {
          // @ts-ignore
          const XLSX = window.XLSX
          if (XLSX) {
            resolve(XLSX)
          } else {
            reject(new Error("XLSX não disponível após o carregamento"))
          }
        } catch (e) {
          reject(e as any)
        }
      }
      script.onerror = () => reject(new Error("Falha ao carregar XLSX do CDN"))
      document.body.appendChild(script)
    })
  }

  const onlyDigits = (value: any) => String(value ?? "").replace(/\D/g, "")
  const isEmail = (value: any) => typeof value === "string" && /.+@.+\..+/.test(value)
  const classifyPhone = (value: any): boolean => {
    const digits = onlyDigits(value)
    if (!digits) return false
    const stripped = digits.startsWith("55") ? digits.slice(2) : digits
    return stripped.length === 10 || stripped.length === 11
  }
  const isCpf = (value: any) => onlyDigits(value).length === 11
  const isCnpj = (value: any) => onlyDigits(value).length === 14
  const formatPhoneKey = (value: string): string => {
    const digits = onlyDigits(value)
    if (!digits) return ""
    if (digits.startsWith("55")) {
      return `+${digits}`
    }
    return `+55${digits}`
  }

  // Função para buscar todos os dados filtrados (PDF / Pedido E+)
  const fetchAllDataForExport = async (): Promise<HistoricoData[]> => {
    try {
      const params = new URLSearchParams()
      params.append("page", "1")
      params.append("pageSize", "100") // Máximo permitido pela API
      
      if (filters.cpf) params.append("cpf", filters.cpf)
      if (filters.nome) params.append("nome", filters.nome)
      if (filters.tipo_premiado) params.append("tipo_premiado", filters.tipo_premiado)
      if (filters.dt_pagamento_inicio) params.append("dt_pagamento_inicio", filters.dt_pagamento_inicio)
      
      const firstResponse = await fetch(`/api/bonificacoes/historico?${params}`)
      
      if (!firstResponse.ok) {
        throw new Error(`HTTP error! status: ${firstResponse.status}`)
      }
      
      const firstResult: ApiResponse = await firstResponse.json()
      
      if (firstResult.error) {
        throw new Error(firstResult.error)
      }
      
      let allData: HistoricoData[] = [...(firstResult.data || [])]
      const totalPages = firstResult.pagination?.totalPages || 1
      
      // Filtrar apenas registros com dt_pagamento igual a dt_pagamento_inicio se especificado
      if (filters.dt_pagamento_inicio) {
        allData = allData.filter(item => {
          if (!item.dt_pagamento) return false
          const itemDate = formatDateISO(item.dt_pagamento)
          return itemDate === filters.dt_pagamento_inicio
        })
      }
      
      // Buscar páginas restantes se houver
      if (totalPages > 1) {
        const remainingPages = Array.from({ length: totalPages - 1 }, (_, i) => i + 2)
        const results = await Promise.all(
          remainingPages.map(async (pageNum) => {
            const pageParams = new URLSearchParams()
            pageParams.append("page", pageNum.toString())
            pageParams.append("pageSize", "100")
            
            if (filters.cpf) pageParams.append("cpf", filters.cpf)
            if (filters.nome) pageParams.append("nome", filters.nome)
            if (filters.tipo_premiado) pageParams.append("tipo_premiado", filters.tipo_premiado)
            if (filters.dt_pagamento_inicio) pageParams.append("dt_pagamento_inicio", filters.dt_pagamento_inicio)
            
            try {
              const response = await fetch(`/api/bonificacoes/historico?${pageParams}`)
              if (!response.ok) return []
              const result = await response.json()
              let pageData = result.data || []
              
              // Filtrar apenas registros com dt_pagamento igual a dt_pagamento_inicio se especificado
              if (filters.dt_pagamento_inicio) {
                pageData = pageData.filter((item: HistoricoData) => {
                  if (!item.dt_pagamento) return false
                  const itemDate = formatDateISO(item.dt_pagamento)
                  return itemDate === filters.dt_pagamento_inicio
                })
              }
              
              return pageData
            } catch {
              return []
            }
          })
        )
        
        results.forEach((pageData) => {
          if (pageData.length) {
            allData = allData.concat(pageData)
          }
        })
      }
      
      return allData
    } catch (error) {
      console.error("Erro ao buscar dados para PDF:", error)
      throw error
    }
  }
  
  // Função para gerar PDF
  const generatePdf = async () => {
    if (!filters.dt_pagamento_inicio) {
      toast({
        title: "Erro",
        description: "Selecione a data de pagamento para gerar o PDF",
        variant: "destructive"
      })
      return
    }
    
    setGeneratingPdf(true)
    try {
      // Buscar todos os dados filtrados
      const allData = await fetchAllDataForExport()
      
      if (allData.length === 0) {
        toast({
          title: "Nenhum dado encontrado",
          description: "Não há registros para gerar o PDF com os filtros aplicados.",
          variant: "destructive"
        })
        setGeneratingPdf(false)
        return
      }
      
      // Criar novo documento PDF
      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      })
      
      // Cabeçalho
      const pageWidth = doc.internal.pageSize.getWidth()
      const marginLeft = 15
      const marginRight = 15
      const marginTop = 15
      let yPos = marginTop
      
      // Tentar adicionar logo
      try {
        // Carregar logo da pasta public/logo
        const logoWidth = 40
        const logoHeight = 15
        const logoSrc = typeof QvLogoImage === "string"
          ? QvLogoImage
          : (QvLogoImage as { src?: string }).src || "/logo/qv-beneficios.png"
        
        // Carregar imagem como base64
        const response = await fetch(logoSrc, { cache: "no-store" })
        if (!response.ok) throw new Error('Logo não encontrado')
        
        const blob = await response.blob()
        const reader = new FileReader()
        
        const imgData = await new Promise<string>((resolve, reject) => {
          reader.onload = () => resolve(reader.result as string)
          reader.onerror = reject
          reader.readAsDataURL(blob)
        })
        
        // Adicionar logo ao PDF
        doc.addImage(imgData, 'PNG', marginLeft, yPos, logoWidth, logoHeight)
      } catch (error) {
        console.error("Erro ao carregar logo, usando texto:", error)
        // Fallback: usar texto se não conseguir carregar a imagem
        doc.setFontSize(20)
        doc.setTextColor(53, 59, 95) // Cor azul escuro
        doc.text('QV', marginLeft, yPos + 5)
      }
      
      // Informações à direita
      doc.setFontSize(16)
      doc.setTextColor(33, 33, 33) // #111827
      doc.setFont('helvetica', 'bold')
      doc.text('Bonificação', pageWidth - marginRight, yPos, { align: 'right' })
      
      yPos += 8
      doc.setFontSize(11)
      doc.setFont('helvetica', 'normal')
      const dataConfirmacoes = getDataConfirmacoes(filters.dt_pagamento_inicio)
      doc.text(`Data das confirmações: ${dataConfirmacoes}`, pageWidth - marginRight, yPos, { align: 'right' })
      
      yPos += 6
      const pagamentoText = formatMonthBR(filters.dt_pagamento_inicio)
      doc.text(`Pagamento: ${pagamentoText}`, pageWidth - marginRight, yPos, { align: 'right' })
      
      yPos += 15
      
      // Preparar dados da tabela ordenados alfabeticamente pelo nome
      const sortedData = [...allData].sort((a, b) => {
        const nomeA = (a.nome || "").toString()
        const nomeB = (b.nome || "").toString()
        return nomeA.localeCompare(nomeB, "pt-BR", { sensitivity: "base" })
      })
      
      const tableData = sortedData.map(item => [
        item.nome || "",
        item.tipo_cartao || "CHAVE PIX",
        item.tipo_premiado || "",
        item.mes_apurado || ""
      ])
      
      // Cabeçalhos das colunas
      const headers = ['Nome', 'ID/Tipo Cartão', 'Tipo Premiado', 'Apuração']
      
      // Calcular largura máxima de cada coluna baseado no conteúdo
      const calculateColumnWidths = () => {
        const maxLengths = [0, 0, 0, 0]
        
        // Verificar cabeçalhos
        headers.forEach((header, index) => {
          maxLengths[index] = Math.max(maxLengths[index], header.length)
        })
        
        // Verificar dados
        tableData.forEach(row => {
          row.forEach((cell, index) => {
            const cellText = String(cell || "")
            maxLengths[index] = Math.max(maxLengths[index], cellText.length)
          })
        })
        
        // Calcular larguras proporcionais baseado no tamanho máximo
        // Usando estimativa: aproximadamente 2.5mm por caractere para fonte 6
        // e 3mm por caractere para fonte 7 (cabeçalho)
        const availableWidth = pageWidth - marginLeft - marginRight // ~180mm
        const estimatedWidths = maxLengths.map((maxLen, index) => {
          // Usar o maior entre cabeçalho (fonte 7) e corpo (fonte 6)
          const headerWidth = headers[index].length * 3
          const bodyWidth = maxLen * 2.5
          return Math.max(headerWidth, bodyWidth) + 6 // Adicionar padding
        })
        
        // Calcular soma total
        const totalEstimated = estimatedWidths.reduce((sum, w) => sum + w, 0)
        
        // Ajustar proporcionalmente para caber no espaço disponível
        const scaleFactor = availableWidth / totalEstimated
        const finalWidths = estimatedWidths.map(w => Math.floor(w * scaleFactor))
        
        return finalWidths
      }
      
      const columnWidths = calculateColumnWidths()
      
      // Criar tabela
      autoTable(doc, {
        startY: yPos,
        head: [headers],
        body: tableData,
        theme: 'striped',
        headStyles: {
          fillColor: [217, 180, 63], // Amarelo escuro/mostarda
          textColor: [17, 24, 39], // #111827
          fontStyle: 'bold',
          fontSize: 7,
          font: 'helvetica'
        },
        bodyStyles: {
          textColor: [0, 0, 0],
          fontSize: 6,
          font: 'helvetica'
        },
        alternateRowStyles: {
          fillColor: [249, 250, 251] // #F9FAFB
        },
        styles: {
          cellPadding: 1.5,
          lineColor: [229, 231, 235], // #E5E7EB
          lineWidth: 0.5,
          overflow: 'hidden', // Não quebrar linha, ocultar se necessário
          cellWidth: 'wrap' // Ajustar largura automaticamente
        },
        columnStyles: {
          0: { cellWidth: columnWidths[0], fontSize: 6 }, // Nome - ajustado dinamicamente
          1: { cellWidth: columnWidths[1], fontSize: 6 }, // ID/Tipo Cartão - ajustado dinamicamente
          2: { cellWidth: columnWidths[2], fontSize: 6 }, // Tipo Premiado - ajustado dinamicamente
          3: { cellWidth: columnWidths[3], fontSize: 6 }  // Apuração - ajustado dinamicamente
        },
        margin: { left: marginLeft, right: marginRight },
        didParseCell: function (data: any) {
          // Desabilitar quebra de linha e ajustar fonte se necessário
          data.cell.styles.overflow = 'hidden'
          if (data.section === 'head') {
            data.cell.styles.fontSize = 7
          } else {
            data.cell.styles.fontSize = 6
          }
        }
      })
      
      // Nome do arquivo
      const fileName = `premiados_${filters.dt_pagamento_inicio}_pagto.pdf`
      
      // Salvar PDF
      doc.save(fileName)
      
      toast({
        title: "PDF gerado com sucesso",
        description: `${allData.length} registro(s) incluído(s) no PDF.`
      })
    } catch (error: any) {
      console.error("Erro ao gerar PDF:", error)
      toast({
        title: "Erro ao gerar PDF",
        description: error.message || "Não foi possível gerar o PDF. Tente novamente.",
        variant: "destructive"
      })
    } finally {
      setGeneratingPdf(false)
    }
  }

  const resolvePixInfo = (item: HistoricoData): { key: string; typeCode: "01" | "02" | "03" } => {
    const doc = onlyDigits(item.cpf || "")
    const raw = String(item.chave_pix ?? "").trim()
    const tipoChave = String(item.tipo_chave ?? "").toLowerCase()

    const ensureDoc = () => (doc ? doc : raw ? onlyDigits(raw) : doc)

    const fallback = { key: ensureDoc() || "", typeCode: "03" as const }

    if (raw) {
      const digits = onlyDigits(raw)

      if (tipoChave.includes("cpf") || tipoChave.includes("cnpj") || isCpf(raw) || isCnpj(raw) || isCpf(digits) || isCnpj(digits)) {
        return { key: digits || ensureDoc() || "", typeCode: "03" as const }
      }
      if (tipoChave.includes("email") || isEmail(raw)) {
        return { key: raw, typeCode: "02" }
      }
      if (tipoChave.includes("celular") || tipoChave.includes("telefone") || classifyPhone(raw)) {
        const phone = formatPhoneKey(raw)
        return phone ? { key: phone, typeCode: "01" as const } : fallback
      }

      if (isEmail(raw)) {
        return { key: raw, typeCode: "02" }
      }
      if (classifyPhone(raw)) {
        const phone = formatPhoneKey(raw)
        return phone ? { key: phone, typeCode: "01" as const } : fallback
      }

      if (digits) {
        return { key: digits, typeCode: "03" as const }
      }

      return { key: raw, typeCode: "03" as const }
    }

    return fallback
  }

  const parseValorCarga = (valor: number | string | undefined): number => {
    if (valor === null || valor === undefined) return 0
    if (typeof valor === "number") return valor

    const str = valor.toString().trim()
    if (!str) return 0

    // Remover qualquer caractere que não seja dígito, ponto, vírgula ou sinal
    let cleaned = str.replace(/[^\d.,-]/g, "")
    if (!cleaned) return 0

    const hasComma = cleaned.includes(",")
    const hasDot = cleaned.includes(".")

    if (hasComma && hasDot) {
      // Formato PT-BR típico: 1.234,56 -> remover pontos (milhar) e trocar vírgula por ponto
      cleaned = cleaned.replace(/\./g, "").replace(",", ".")
    } else if (hasComma) {
      // Apenas vírgula: tratar como decimal
      cleaned = cleaned.replace(/\./g, "").replace(",", ".")
    } else {
      // Apenas ponto ou nenhum separador: Number interpreta corretamente
    }

    const parsed = Number(cleaned)
    return isNaN(parsed) ? 0 : parsed
  }

  const generatePedidoEPlus = async () => {
    if (!filters.dt_pagamento_inicio) {
      toast({
        title: "Erro",
        description: "Selecione a data de pagamento para gerar o pedido E+.",
        variant: "destructive"
      })
      return
    }

    setGeneratingPedidoE(true)
    try {
      const allData = await fetchAllDataForExport()

      if (allData.length === 0) {
        toast({
          title: "Nenhum dado encontrado",
          description: "Não há registros para gerar o pedido E+ com os filtros aplicados.",
          variant: "destructive"
        })
        setGeneratingPedidoE(false)
        return
      }

      const rowsData = allData.map((item) => {
        const doc = onlyDigits(item.cpf || "")
        const normalizedDoc = doc || ""
        const pixInfo = resolvePixInfo(item)
        const chavePix = pixInfo.key || normalizedDoc
        const tipo = pixInfo.typeCode
        const valorNum = parseValorCarga(item.valor_carga)
        const nome = String(item.nome ?? "")
        return {
          nome,
          doc: normalizedDoc,
          tipo,
          chavePix,
          valorNum
        }
      }).filter((row) => row.doc || row.chavePix)

      rowsData.sort((a, b) => (b.valorNum || 0) - (a.valorNum || 0))

      const rowsForSheet = rowsData.map(({ nome, doc: normalizedDoc, tipo, chavePix, valorNum }) => {
        return [nome, normalizedDoc, tipo, chavePix, valorNum]
      })

      const rowsFormatted = rowsData.map(({ nome, doc: normalizedDoc, tipo, chavePix, valorNum }) => {
        const valorStr = valorNum.toLocaleString("pt-BR", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2
        })
        return [nome, normalizedDoc, tipo, chavePix, valorStr]
      })

      if (rowsForSheet.length === 0) {
        toast({
          title: "Nenhum dado exportável",
          description: "Não foi possível montar o arquivo de pedido E+.",
          variant: "destructive"
        })
        setGeneratingPedidoE(false)
        return
      }

      const XLSX = await getXLSX()

      const headers = [
        "NOME/RAZAO DOCIAL",
        "CPF/CNPJ",
        "TIPO/CHAVE",
        "CHAVE/PIX",
        "VALOR"
      ]

      const aoa = [headers, ...rowsForSheet]
      const ws = XLSX.utils.aoa_to_sheet(aoa)

      const range = XLSX.utils.decode_range(ws["!ref"] || "A1")
      for (let c = 0; c <= 4; c++) {
        const headerAddress = XLSX.utils.encode_cell({ r: range.s.r, c })
        const headerCell = ws[headerAddress]
        if (headerCell) {
          headerCell.s = {
            font: { bold: true, color: { rgb: "000000" } },
            fill: { patternType: "solid", fgColor: { rgb: "FFCC00" } },
            alignment: { horizontal: "center", vertical: "center" }
          }
        }
      }

      for (let r = range.s.r + 1; r <= range.e.r; r++) {
        for (let c = 0; c <= 3; c++) {
          const addr = XLSX.utils.encode_cell({ r, c })
          const cell = ws[addr]
          if (cell) {
            cell.t = "s"
            cell.v = String(cell.v ?? "")
          }
        }
        const valorAddr = XLSX.utils.encode_cell({ r, c: 4 })
        const valorCell = ws[valorAddr]
        if (valorCell) {
          valorCell.t = "n"
          valorCell.z = 'R$ #,##0.00;[Red]-R$ #,##0.00'
        }
      }

      const computeLen = (value: any) => {
        if (value === null || value === undefined) return 0
        return String(value).length
      }

      const colMax: number[] = [0, 0, 0, 0, 0]
      headers.forEach((h, i) => {
        colMax[i] = Math.max(colMax[i], String(h).length)
      })
      rowsFormatted.forEach((row) => {
        row.forEach((cellValue, idx) => {
          colMax[idx] = Math.max(colMax[idx], computeLen(cellValue))
        })
      })
      ws["!cols"] = colMax.map((len) => ({ wch: Math.min(Math.max(len + 2, 10), 60) }))

      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, "pedido_E+")

      const now = new Date()
      const pad = (n: number) => String(n).padStart(2, "0")
      const fileName = `pedido_E+_${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}.xlsx`

      const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" })
      const blob = new Blob([wbout], { type: "application/octet-stream" })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement("a")
      anchor.href = url
      anchor.download = fileName
      document.body.appendChild(anchor)
      anchor.click()
      document.body.removeChild(anchor)
      URL.revokeObjectURL(url)

      toast({
        title: "Pedido E+ gerado",
        description: `${rowsForSheet.length} registro(s) incluído(s) no arquivo.`
      })
    } catch (error: any) {
      console.error("Erro ao gerar pedido E+:", error)
      toast({
        title: "Erro ao gerar pedido E+",
        description: error?.message || "Não foi possível gerar o arquivo. Tente novamente.",
        variant: "destructive"
      })
    } finally {
      setGeneratingPedidoE(false)
    }
  }

  const handleFormChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  // Atualizar mes_apurado quando o formulário for aberto e limpar estados quando fechar
  useEffect(() => {
    if (showForm) {
      setFormData(prev => ({ ...prev, mes_apurado: getCurrentMonth() }))
      // Garantir que cpfQuery está vazio quando o formulário abre
      if (!formData.cpf) {
        setCpfQuery("")
      }
    } else {
      // Limpar estados quando o formulário fecha
      setCpfQuery("")
      setCpfFocused(false)
      setCpfSuggestions([])
    }
  }, [showForm])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      if (!formData.cpf || !formData.nome) {
        toast({
          title: "Erro de validação",
          description: "CPF e Nome são obrigatórios",
          variant: "destructive"
        })
        setLoading(false)
        return
      }

      // Formatar dados para o formato aceito pelo banco
      // CPF: apenas números, máximo 11 dígitos
      // Mes apurado: sempre preencher com o mês atual (MMM/YY)
      // Data: formato YYYY-MM-DD
      // Observação: se vazio, preencher automaticamente com "Transferência realizada"
      const obsFormatted = formData.obs?.trim() || 'Transferência realizada'
      
      const formattedData = {
        ...formData,
        cpf: normalizeCpfForDb(formData.cpf),
        mes_apurado: getCurrentMonth(),
        obs: obsFormatted,
        dt_pagamento: formData.dt_pagamento 
          ? (formData.dt_pagamento.includes('T') 
              ? formatDateISO(formData.dt_pagamento)
              : formData.dt_pagamento)
          : null
      }

      const response = await fetch('/api/bonificacoes/historico', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formattedData)
      })

      if (!response.ok) {
        let errorMessage = 'Erro ao criar registro'
        try {
          const errorData = await response.json()
          errorMessage = errorData.error || errorMessage
        } catch {
          errorMessage = `Erro HTTP ${response.status}: ${response.statusText}`
        }
        throw new Error(errorMessage)
      }

      toast({
        title: "Sucesso!",
        description: "Registro criado com sucesso"
      })

      // Limpar formulário
      setFormData({
        cpf: "",
        nome: "",
        valor_carga: "",
        tipo_cartao: "",
        premiacao: "",
        tipo_premiado: "",
        mes_apurado: getCurrentMonth(), // Sempre preencher com o mês atual
        obs: "",
        dt_pagamento: ""
      })
      setCpfQuery("")
      setCpfFocused(false)
      setCpfSuggestions([])
      setShowForm(false)

      // Recarregar dados
      await fetchData()
    } catch (error) {
      console.error("Erro ao criar registro:", error)
      toast({
        title: "Erro",
        description: error instanceof Error ? error.message : "Erro ao criar registro",
        variant: "destructive"
      })
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (id: number) => {
    if (!confirm("Tem certeza que deseja excluir este registro?")) {
      return
    }

    setLoading(true)
    try {
      const response = await fetch(`/api/bonificacoes/historico/${id}`, {
        method: 'DELETE'
      })

      if (!response.ok) {
        let errorMessage = 'Erro ao excluir registro'
        try {
          const errorData = await response.json()
          errorMessage = errorData.error || errorMessage
        } catch {
          errorMessage = `Erro HTTP ${response.status}: ${response.statusText}`
        }
        throw new Error(errorMessage)
      }

      toast({
        title: "Sucesso!",
        description: "Registro excluído com sucesso"
      })

      // Recarregar dados
      await fetchData()
    } catch (error) {
      console.error("Erro ao excluir:", error)
      toast({
        title: "Erro",
        description: error instanceof Error ? error.message : "Erro ao excluir registro",
        variant: "destructive"
      })
    } finally {
      setLoading(false)
    }
  }

  const handleStartEdit = (row: HistoricoData) => {
    if (!row.id) return
    
    // Preparar dados para edição (garantir formatação correta do banco)
    const editData: any = {
      ...row,
      // CPF: remover formatação, manter apenas números
      cpf: row.cpf ? normalizeCpfForDb(row.cpf) : "",
      // Valor Carga: converter para número se for string numérica, ou manter número
      valor_carga: row.valor_carga != null ? (typeof row.valor_carga === 'string' 
        ? (row.valor_carga.trim() ? parseFloat(String(row.valor_carga).replace(/[^\d,.-]/g, '').replace(',', '.')) || null : null)
        : (typeof row.valor_carga === 'number' ? row.valor_carga : null)) : null,
      // Premiação: pode ser string (ex: "BONIFICAÇÃO") ou número (valor monetário)
      // Manter como string se for string, ou número se for número
      premiacao: row.premiacao != null ? (typeof row.premiacao === 'string' ? String(row.premiacao) : (typeof row.premiacao === 'number' ? row.premiacao : null)) : null,
      // Data: garantir formato YYYY-MM-DD para input date
      dt_pagamento: row.dt_pagamento ? formatDateISO(row.dt_pagamento) || null : null
    }
    
    setEditingRow(row.id)
    setOriginalData({ ...row })
    setEditedData(editData)
  }

  const handleCancelEdit = () => {
    setEditingRow(null)
    setEditedData({})
    setOriginalData({})
  }

  const handleSaveEdit = async () => {
    if (!editingRow || !editedData.id) {
      console.error("Missing editingRow or id:", { editingRow, id: editedData.id })
      return
    }

    setLoading(true)
    try {
      // Preparar dados para envio (garantir formato correto)
      const dataToSave = {
        cpf: editedData.cpf ? normalizeCpfForDb(editedData.cpf) : null,
        nome: editedData.nome || null,
        id_cartao: editedData.id_cartao || null,
        valor_carga: editedData.valor_carga || null,
        tipo_cartao: editedData.tipo_cartao || null,
        // Premiação: manter como está (string ou número)
        premiacao: editedData.premiacao != null ? editedData.premiacao : null,
        tipo_premiado: editedData.tipo_premiado || null,
        mes_apurado: editedData.mes_apurado || null,
        obs: editedData.obs || null,
        dt_pagamento: editedData.dt_pagamento || null
      }

      const response = await fetch(`/api/bonificacoes/historico/${editingRow}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(dataToSave)
      })

      if (!response.ok) {
        let errorMessage = 'Erro ao atualizar registro'
        try {
          const errorData = await response.json()
          errorMessage = errorData.error || errorMessage
        } catch {
          errorMessage = `Erro HTTP ${response.status}: ${response.statusText}`
        }
        throw new Error(errorMessage)
      }

      toast({
        title: "Sucesso!",
        description: "Registro atualizado com sucesso"
      })

      handleCancelEdit()
      await fetchData()
    } catch (error) {
      console.error("Erro ao atualizar:", error)
      toast({
        title: "Erro",
        description: error instanceof Error ? error.message : "Erro ao atualizar registro",
        variant: "destructive"
      })
    } finally {
      setLoading(false)
    }
  }

  const handleEditFieldChange = (field: string, value: any) => {
    setEditedData(prev => ({ ...prev, [field]: value }))
  }

  const formatDate = (date: string | Date | null | undefined) => {
    if (!date) return ""
    const formatted = formatDateBR(date)
    return formatted || (typeof date === "string" ? date : "")
  }

  const formatCurrencyDisplay = (value: number | string | null | undefined) => {
    if (value === null || value === undefined || value === "") return ""
    if (typeof value === "number") return formatCurrency(value)

    const numeric = Number(value)
    if (!Number.isNaN(numeric)) return formatCurrency(numeric)

    const normalized = Number(String(value).replace(/\./g, "").replace(",", "."))
    if (!Number.isNaN(normalized)) return formatCurrency(normalized)

    return String(value)
  }

  return (
    <div className="px-4 py-6 lg:pl-8 lg:pr-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Histórico de Bonificações</h1>
        <p className="text-muted-foreground mt-1">
          {canCreate 
            ? "Visualize e gerencie o histórico de bonificações comerciais." 
            : "Visualize o histórico de bonificações comerciais."}
        </p>
      </div>

      {/* Botão de adicionar - apenas se tiver permissão */}
      {canCreate && (
        <div className="flex justify-end">
          <Button variant={showForm ? "outline" : "default"} onClick={() => setShowForm(v => !v)}>
            {showForm ? (
              <>
                <X className="h-4 w-4 mr-2" /> Cancelar
              </>
            ) : (
              <>
                <Plus className="h-4 w-4 mr-2" /> Adicionar registro
              </>
            )}
          </Button>
        </div>
      )}

      {/* Formulário de cadastro - apenas se tiver permissão */}
      {canCreate && showForm && (
        <Card className="border shadow-sm bg-white">
          <CardHeader>
            <CardTitle>Novo registro</CardTitle>
            <CardDescription>Preencha os campos abaixo para adicionar um novo registro</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="cpf">CPF *</Label>
                  <div className="relative">
                    <Input
                      id="cpf"
                      placeholder="Digite o CPF..."
                      value={cpfFocused ? cpfQuery : (formData.cpf ? formatCpf(formData.cpf) : cpfQuery)}
                      onFocus={() => {
                        setCpfFocused(true)
                        if (formData.cpf) {
                          setCpfQuery(formatCpf(formData.cpf))
                        } else {
                          // Inicializar cpfQuery vazio se não houver CPF
                          setCpfQuery("")
                        }
                      }}
                      onBlur={() => setTimeout(() => setCpfFocused(false), 200)}
                      onChange={(e) => {
                        let value = e.target.value
                        // Garantir que o campo está focado para mostrar sugestões
                        if (!cpfFocused) {
                          setCpfFocused(true)
                        }
                        
                        // Remove tudo que não é número
                        const numericValue = value.replace(/\D/g, "")
                        
                        // Limita a 11 dígitos
                        const limitedNumeric = numericValue.slice(0, 11)
                        
                        // Formata automaticamente enquanto digita (XXX.XXX.XXX-XX)
                        let formatted = limitedNumeric
                        if (limitedNumeric.length > 9) {
                          formatted = limitedNumeric.slice(0, 3) + "." + limitedNumeric.slice(3, 6) + "." + limitedNumeric.slice(6, 9) + "-" + limitedNumeric.slice(9)
                        } else if (limitedNumeric.length > 6) {
                          formatted = limitedNumeric.slice(0, 3) + "." + limitedNumeric.slice(3, 6) + "." + limitedNumeric.slice(6)
                        } else if (limitedNumeric.length > 3) {
                          formatted = limitedNumeric.slice(0, 3) + "." + limitedNumeric.slice(3)
                        }
                        
                        // Atualiza cpfQuery para disparar a busca de sugestões
                        setCpfQuery(formatted)
                        // SEMPRE normalizar antes de salvar no formData (apenas números)
                        handleFormChange("cpf", normalizeCpfForDb(limitedNumeric) || "")
                      }}
                      required
                    />
                    {(formData.cpf || cpfQuery) && (
                      <button
                        type="button"
                        aria-label="Limpar CPF"
                        onClick={() => {
                          setCpfQuery("")
                          handleFormChange("cpf", "")
                          handleFormChange("nome", "")
                          setCpfFocused(true)
                        }}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                    {cpfFocused && cpfSuggestions.length > 0 && (
                      <div className="absolute z-50 mt-1 w-full max-h-56 overflow-auto rounded-md border bg-white shadow-lg" style={{ background: '#ffffff' }}>
                        {cpfSuggestions.map((suggestion, idx) => (
                          <button
                            key={`${suggestion.cpf}-${idx}`}
                            type="button"
                            onMouseDown={(e) => {
                              e.preventDefault() // Prevenir blur do input antes do clique
                              // Normalizar CPF antes de salvar (remover pontos e traços)
                              const normalizedCpf = normalizeCpfForDb(suggestion.cpf) || ""
                              handleFormChange("cpf", normalizedCpf)
                              if (suggestion.nome) {
                                handleFormChange("nome", suggestion.nome)
                              }
                              setCpfQuery(suggestion.formattedCpf)
                              setCpfFocused(false)
                            }}
                            className="w-full text-left px-4 py-2 hover:bg-accent hover:text-accent-foreground cursor-pointer border-b last:border-b-0"
                          >
                            <div className="font-medium">{suggestion.formattedCpf}</div>
                            {suggestion.nome && (
                              <div className="text-sm text-muted-foreground">{suggestion.nome}</div>
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="nome">Nome *</Label>
                  <Input
                    id="nome"
                    value={formData.nome}
                    onChange={(e) => handleFormChange("nome", e.target.value)}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="valor_carga">Valor Carga</Label>
                  <Input
                    id="valor_carga"
                    type="number"
                    step="0.01"
                    value={formData.valor_carga}
                    onChange={(e) => handleFormChange("valor_carga", e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="tipo_cartao">Tipo Cartão</Label>
                  <Select
                    key={`tipo_cartao-${formData.tipo_cartao || 'all'}`}
                    value={formData.tipo_cartao || undefined}
                    onValueChange={(value) => handleFormChange("tipo_cartao", value)}
                  >
                    <SelectTrigger id="tipo_cartao" className="bg-white">
                      <SelectValue placeholder={tiposCartao.length ? "Selecione" : "Carregando..."} />
                    </SelectTrigger>
                    <SelectContent>
                      {tiposCartao.map((tipo) => (
                        <SelectItem key={tipo} value={tipo}>
                          {tipo}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="premiacao">Premiação</Label>
                  <Select
                    key={`premiacao-${formData.premiacao ? String(formData.premiacao) : 'all'}`}
                    value={formData.premiacao ? String(formData.premiacao) : undefined}
                    onValueChange={(value) => handleFormChange("premiacao", value)}
                  >
                    <SelectTrigger id="premiacao" className="bg-white">
                      <SelectValue placeholder={premiacoes.length ? "Selecione" : "Carregando..."} />
                    </SelectTrigger>
                    <SelectContent>
                      {premiacoes.map((prem) => (
                        <SelectItem key={prem} value={prem}>
                          {prem}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="tipo_premiado">Tipo Premiação</Label>
                  <Select
                    key={`tipo_premiado-${formData.tipo_premiado || 'all'}`}
                    value={formData.tipo_premiado || undefined}
                    onValueChange={(value) => handleFormChange("tipo_premiado", value)}
                  >
                    <SelectTrigger id="tipo_premiado" className="bg-white">
                      <SelectValue placeholder={tiposPremiacao.length ? "Selecione" : "Carregando..."} />
                    </SelectTrigger>
                    <SelectContent>
                      {tiposPremiacao.map((tipo) => (
                        <SelectItem key={tipo} value={tipo}>
                          {tipo}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="mes_apurado">Mês Apurado</Label>
                  <Input
                    id="mes_apurado"
                    value={formData.mes_apurado}
                    readOnly
                    className="bg-gray-50 cursor-not-allowed"
                    title="Mês apurado é preenchido automaticamente com o mês atual"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="dt_pagamento">Data Pagamento</Label>
                  <Input
                    id="dt_pagamento"
                    type="date"
                    value={formData.dt_pagamento}
                    onChange={(e) => handleFormChange("dt_pagamento", e.target.value)}
                  />
                </div>

                <div className="space-y-2 md:col-span-2 lg:col-span-3">
                  <Label htmlFor="obs">Observações</Label>
                  <Input
                    id="obs"
                    value={formData.obs}
                    onChange={(e) => handleFormChange("obs", e.target.value)}
                    placeholder="Deixe em branco para preencher automaticamente com 'Transferência realizada'"
                  />
                </div>
              </div>

              <div className="flex justify-end space-x-4 pt-4 border-t">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setFormData({
                      cpf: "",
                      nome: "",
                      valor_carga: "",
                      tipo_cartao: "",
                      premiacao: "",
                      tipo_premiado: "",
                      mes_apurado: getCurrentMonth(), // Sempre preencher com o mês atual
                      obs: "",
                      dt_pagamento: ""
                    })
                    setCpfQuery("")
                    setCpfFocused(false)
                    setCpfSuggestions([])
                  }}
                  disabled={loading}
                >
                  Limpar
                </Button>
                <Button type="submit" disabled={loading}>
                  {loading ? "Salvando..." : "Salvar"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Box Principal */}
      <Card className="border shadow-sm bg-white">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-xl">Histórico de Bonificações</CardTitle>
              <CardDescription>Filtre e visualize os registros de bonificações comerciais</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              {canGeneratePedidoE && (
                <Button
                  onClick={generatePedidoEPlus}
                  disabled={generatingPedidoE || !filters.dt_pagamento_inicio}
                >
                  {generatingPedidoE ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Gerando...
                    </>
                  ) : (
                    <>
                      <Download className="h-4 w-4 mr-2" />
                      Gerar pedido E+
                    </>
                  )}
                </Button>
              )}
              <Button 
                onClick={generatePdf} 
                disabled={generatingPdf || !filters.dt_pagamento_inicio}
              >
                {generatingPdf ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Gerando PDF...
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4 mr-2" />
                    Gerar PDF
                  </>
                )}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Box de Filtros */}
          <Card className="border shadow-sm" style={{ backgroundColor: 'var(--filter-box-bg)' }}>
            <CardHeader>
              <CardTitle>Filtros</CardTitle>
              <CardDescription>Filtre os registros por critérios específicos</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="filter_cpf">CPF</Label>
                  <div className="relative">
                    <Input
                      id="filter_cpf"
                      placeholder="Buscar por CPF..."
                      value={filterCpfFocused ? filterCpfQuery : (filters.cpf ? formatCpf(filters.cpf) : filterCpfQuery)}
                      onFocus={() => {
                        setFilterCpfFocused(true)
                        if (filters.cpf) {
                          setFilterCpfQuery(formatCpf(filters.cpf))
                        }
                      }}
                      onBlur={() => setTimeout(() => setFilterCpfFocused(false), 150)}
                      onChange={(e) => {
                        const value = e.target.value
                        setFilterCpfQuery(value)
                        // Remove formatação para buscar no banco
                        const numericValue = value.replace(/\D/g, "")
                        handleFilterChange("cpf", numericValue)
                      }}
                      className="bg-white"
                    />
                    {(filters.cpf || filterCpfQuery) && (
                      <button
                        type="button"
                        aria-label="Limpar CPF"
                        onClick={() => {
                          clearFilters()
                          setFilterCpfFocused(true)
                        }}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                    {filterCpfFocused && filterCpfSuggestions.length > 0 && (
                      <div className="absolute z-10 mt-1 w-full max-h-56 overflow-auto rounded-md border bg-white text-popover-foreground shadow" style={{ background: '#ffffff' }}>
                        {filterCpfSuggestions.map((suggestion, idx) => (
                          <button
                            key={`${suggestion.cpf}-${idx}`}
                            type="button"
                            onClick={() => {
                              // Normalizar CPF antes de salvar (remover formatação)
                              const normalizedCpf = normalizeCpfForDb(suggestion.cpf) || ""
                              handleFilterChange("cpf", normalizedCpf)
                              if (suggestion.nome) {
                                handleFilterChange("nome", suggestion.nome)
                              }
                              setFilterCpfQuery(suggestion.formattedCpf)
                              setFilterCpfFocused(false)
                            }}
                            className="w-full text-left px-4 py-2 hover:bg-accent hover:text-accent-foreground cursor-pointer"
                          >
                            <div className="font-medium">{suggestion.formattedCpf}</div>
                            {suggestion.nome && (
                              <div className="text-sm text-muted-foreground">{suggestion.nome}</div>
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="filter_nome">Nome</Label>
                  <Input
                    id="filter_nome"
                    placeholder="Buscar por nome..."
                    value={filters.nome}
                    onChange={(e) => handleFilterChange("nome", e.target.value)}
                    className="bg-white"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="filter_tipo_premiado">Tipo Premiado</Label>
                  <div className="relative">
                    <Select
                      key={`tipo_premiado-${filters.tipo_premiado || 'all'}`}
                      value={filters.tipo_premiado || undefined}
                      onValueChange={(value) => handleFilterChange("tipo_premiado", value)}
                    >
                      <SelectTrigger id="filter_tipo_premiado" className="bg-white">
                        <SelectValue placeholder={tiposPremiado.length ? "Todos" : "Carregando..."} />
                      </SelectTrigger>
                      <SelectContent>
                        {tiposPremiado.map((tipo) => (
                          <SelectItem key={tipo} value={tipo}>
                            {tipo}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {filters.tipo_premiado && tiposPremiado.length > 0 && (
                      <button
                        onClick={() => handleFilterChange("tipo_premiado", "")}
                        className="absolute right-8 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="filter_dt_inicio">Data Pagamento *</Label>
                  <Input
                    id="filter_dt_inicio"
                    type="date"
                    value={filters.dt_pagamento_inicio}
                    onChange={(e) => handleFilterChange("dt_pagamento_inicio", e.target.value)}
                    className="bg-white"
                    placeholder="Selecione para filtrar e gerar PDF"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={clearFilters}>
                  Limpar
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Tabela */}
          <div className="border rounded-md overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>CPF</TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead>Valor Bruto</TableHead>
                  <TableHead>Desconto</TableHead>
                  <TableHead>Valor Carga</TableHead>
                  <TableHead>Tipo Cartão</TableHead>
                  <TableHead>Premiação</TableHead>
                  <TableHead>Tipo Premiação</TableHead>
                  <TableHead>Mês Apurado</TableHead>
                  <TableHead>Data Pagamento</TableHead>
                  <TableHead>Observações</TableHead>
                  {(canDelete || canEdit) && <TableHead className="w-[120px]">Ações</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={(canDelete || canEdit) ? 12 : 11} className="text-center py-8">
                      <p className="text-muted-foreground">Carregando...</p>
                    </TableCell>
                  </TableRow>
                ) : data.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={(canDelete || canEdit) ? 12 : 11} className="text-center py-8 text-muted-foreground">
                      {filters.cpf || filters.nome || filters.tipo_premiado || filters.dt_pagamento_inicio ? (
                        <div className="space-y-2">
                          <p className="font-medium">Nenhum resultado encontrado</p>
                          <p className="text-sm">Tente ajustar os filtros ou limpar todos os filtros para ver todos os registros.</p>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <p className="font-medium">Nenhum resultado encontrado</p>
                          <p className="text-sm">Não há registros de bonificações no banco de dados.</p>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ) : (
                  data.map((row, index) => {
                    const isEditing = editingRow === row.id
                    const rowData = isEditing ? editedData : row
                    
                    return (
                      <TableRow key={row.id}>
                        <TableCell>
                          {isEditing ? (
                            <Input
                              value={rowData.cpf || ""}
                              onChange={(e) => {
                                // Permite apenas números, máximo 11 dígitos
                                const value = e.target.value.replace(/\D/g, "").slice(0, 11)
                                handleEditFieldChange("cpf", value)
                              }}
                              className="h-8 w-full"
                              placeholder="CPF (apenas números)"
                            />
                          ) : (
                            formatCpf(row.cpf)
                          )}
                        </TableCell>
                        <TableCell>
                          {isEditing ? (
                            <Input
                              value={rowData.nome || ""}
                              onChange={(e) => handleEditFieldChange("nome", e.target.value)}
                              className="h-8 w-full"
                              placeholder="Nome"
                            />
                          ) : (
                            row.nome || ""
                          )}
                        </TableCell>
                        <TableCell>
                          {formatCurrencyDisplay(row.valor_bruto)}
                        </TableCell>
                        <TableCell>
                          <span className={
                            (() => {
                              if (rowData.desconto_realizado === null || rowData.desconto_realizado === undefined) return undefined
                              const numericValue = typeof rowData.desconto_realizado === "number"
                                ? rowData.desconto_realizado
                                : parseFloat(String(rowData.desconto_realizado).replace(/\./g, "").replace(",", "."))
                              if (Number.isNaN(numericValue) || numericValue === 0) return undefined
                              return "text-red-600"
                            })()
                          }>
                            {formatCurrencyDisplay(rowData.desconto_realizado)}
                          </span>
                        </TableCell>
                        <TableCell>
                          {isEditing ? (
                            <Input
                              type="number"
                              step="0.01"
                              value={rowData.valor_carga ?? ""}
                              onChange={(e) => {
                                const value = e.target.value
                                handleEditFieldChange("valor_carga", value ? parseFloat(value) : null)
                              }}
                              className="h-8 w-full"
                              placeholder="Valor Carga"
                            />
                          ) : (
                            row.valor_carga ? formatCurrency(row.valor_carga) : ""
                          )}
                        </TableCell>
                        <TableCell>
                          {isEditing ? (
                            <Select
                              value={rowData.tipo_cartao || ""}
                              onValueChange={(value) => handleEditFieldChange("tipo_cartao", value)}
                            >
                              <SelectTrigger className="h-8 w-full">
                                <SelectValue placeholder="Tipo Cartão" />
                              </SelectTrigger>
                              <SelectContent>
                                {tiposCartao.map((tipo) => (
                                  <SelectItem key={tipo} value={tipo}>
                                    {tipo}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            row.tipo_cartao || ""
                          )}
                        </TableCell>
                        <TableCell>
                          {isEditing ? (
                            <Select
                              value={rowData.premiacao ? String(rowData.premiacao) : ""}
                              onValueChange={(value) => handleEditFieldChange("premiacao", value)}
                            >
                              <SelectTrigger className="h-8 w-full">
                                <SelectValue placeholder="Premiação" />
                              </SelectTrigger>
                              <SelectContent>
                                {premiacoes.map((prem) => (
                                  <SelectItem key={prem} value={prem}>
                                    {prem}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            row.premiacao ? (typeof row.premiacao === 'number' ? formatCurrency(row.premiacao) : String(row.premiacao)) : ""
                          )}
                        </TableCell>
                        <TableCell>
                          {isEditing ? (
                            <Select
                              value={rowData.tipo_premiado || ""}
                              onValueChange={(value) => handleEditFieldChange("tipo_premiado", value)}
                            >
                              <SelectTrigger className="h-8 w-full">
                                <SelectValue placeholder="Tipo Premiado" />
                              </SelectTrigger>
                              <SelectContent>
                                {tiposPremiado.map((tipo) => (
                                  <SelectItem key={tipo} value={tipo}>
                                    {tipo}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            row.tipo_premiado || ""
                          )}
                        </TableCell>
                        <TableCell>
                          {isEditing ? (
                            <Input
                              value={rowData.mes_apurado || ""}
                              onChange={(e) => handleEditFieldChange("mes_apurado", e.target.value)}
                              className="h-8 w-full"
                              placeholder="Mês Apurado"
                            />
                          ) : (
                            row.mes_apurado || ""
                          )}
                        </TableCell>
                        <TableCell>
                          {isEditing ? (
                            <Input
                              type="date"
                              value={rowData.dt_pagamento || ""}
                              onChange={(e) => handleEditFieldChange("dt_pagamento", e.target.value || null)}
                              className="h-8 w-full"
                            />
                          ) : (
                            formatDate(row.dt_pagamento)
                          )}
                        </TableCell>
                        <TableCell>
                          {isEditing ? (
                            <Input
                              value={rowData.obs || ""}
                              onChange={(e) => handleEditFieldChange("obs", e.target.value)}
                              className="h-8 w-full"
                              placeholder="Observações"
                            />
                          ) : (
                            row.obs || ""
                          )}
                        </TableCell>
                        {(canDelete || canEdit) && (
                          <TableCell>
                            <div className="flex gap-1">
                              {isEditing ? (
                                <>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 w-8 p-0 text-green-600 hover:text-green-700"
                                    onClick={handleSaveEdit}
                                    disabled={loading}
                                  >
                                    <Check className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 w-8 p-0 text-red-600 hover:text-red-700"
                                    onClick={handleCancelEdit}
                                    disabled={loading}
                                  >
                                    <XCircle className="h-4 w-4" />
                                  </Button>
                                </>
                              ) : (
                                <>
                                  {canEdit && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-8 w-8 p-0"
                                      onClick={() => handleStartEdit(row)}
                                      disabled={loading}
                                      title="Editar"
                                    >
                                      <Pencil className="h-4 w-4" />
                                    </Button>
                                  )}
                                  {canDelete && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-8 w-8 p-0 text-red-600 hover:text-red-700"
                                      onClick={() => row.id && handleDelete(row.id)}
                                      disabled={loading}
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  )}
                                </>
                              )}
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </div>

          {/* Paginação */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <div className="text-sm text-muted-foreground">
                Mostrando {((page - 1) * pageSize) + 1} a {Math.min(page * pageSize, total)} de {total} registros
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1 || loading}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <div className="flex items-center gap-1">
                  <span className="text-sm">
                    Página {page} de {totalPages}
                  </span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages || loading}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

