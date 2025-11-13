"use client"

import { useEffect, useState, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useToast } from "@/hooks/use-toast"
import { ChevronLeft, ChevronRight, X, Download, Plus } from "lucide-react"
import { useAuth } from "@/components/auth/auth-provider"
import { canCreateRules, canDeleteRules } from "@/lib/permissions"
import { signalPageLoaded } from "@/components/ui/page-loading"
import { formatCurrency } from "@/utils/bonificacao"
import { formatDateBR, formatDateISO } from "@/lib/date-utils"
import { usePersistentState } from "@/hooks/usePersistentState"

interface ExtratoDescontosData {
  dt_apuracao?: string
  dt_movimentacao?: string
  dt_exclusao_proposta?: string
  tipo_movimentacao?: string
  valor?: number | string
  cpf?: string
  nome?: string
  proposta?: string
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

interface ApiResponse {
  data?: ExtratoDescontosData[]
  pagination?: {
    page: number
    pageSize: number
    total: number
    totalPages: number
  }
  saldoTotal?: number
  error?: string
}

type ExtratoFilters = {
  cpf: string
  nome: string
}

const FILTER_STORAGE_KEY = "admin-extrato-descontos"
const createEmptyFilters = (): ExtratoFilters => ({
  cpf: "",
  nome: "",
})

export default function ExtratoDescontosPage() {
  const { toast } = useToast()
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<ExtratoDescontosData[]>([])
  const [page, setPage] = useState(1)
  const [pageSize] = useState(20)
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(0)
  const [saldoTotal, setSaldoTotal] = useState<number>(0)
  const [exporting, setExporting] = useState(false)

  // Modal de inserção
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [formData, setFormData] = useState({
    dt_movimentacao: "",
    cpf: "",
    nome: "",
    valor: "",
    dt_apuracao: "",
    tipo_movimentacao: "desconto realizado",
    proposta: "",
    dt_exclusao_proposta: ""
  })

  // Permissões
  const canCreate = canCreateRules(user)
  const canDelete = canDeleteRules(user)
  const isInitialLoad = useRef(true)

  // Filtros
  const [pendingFilters, setPendingFilters] = usePersistentState<ExtratoFilters>(
    `${FILTER_STORAGE_KEY}:pending`,
    createEmptyFilters
  )
  const [appliedFilters, setAppliedFilters] = usePersistentState<ExtratoFilters>(
    `${FILTER_STORAGE_KEY}:applied`,
    createEmptyFilters
  )

  // Estados para autocomplete de CPF
  const [cpfQuery, setCpfQuery] = useState("")
  const [cpfFocused, setCpfFocused] = useState(false)
  const [cpfSuggestions, setCpfSuggestions] = useState<Array<{ cpf: string; nome: string; formattedCpf: string }>>([])

  // Carregar dados
  const fetchData = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.append("page", page.toString())
      params.append("pageSize", pageSize.toString())

      if (appliedFilters.cpf) params.append("cpf", appliedFilters.cpf)
      if (appliedFilters.nome) params.append("nome", appliedFilters.nome)

      const response = await fetch(`/api/bonificacoes/extrato-descontos?${params}`)
      
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

      setData(result.data || [])
      setTotal(result.pagination?.total || 0)
      setTotalPages(result.pagination?.totalPages || 0)
      setSaldoTotal(result.saldoTotal || 0)
    } catch (error) {
      console.error("Erro ao carregar extrato de descontos:", error)
      toast({
        title: "Erro",
        description: "Erro ao carregar extrato de descontos",
        variant: "destructive",
      })
      setData([])
      setTotal(0)
      setTotalPages(0)
      setSaldoTotal(0)
    } finally {
      setLoading(false)
      signalPageLoaded()
    }
  }

  useEffect(() => {
    fetchData().then(() => {
      isInitialLoad.current = false
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!isInitialLoad.current) {
      fetchData()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, appliedFilters.cpf, appliedFilters.nome])

  // Buscar sugestões de CPF com debounce
  useEffect(() => {
    const timer = setTimeout(async () => {
      // Remove formatação para buscar na API
      const numericQuery = cpfQuery.replace(/\D/g, "")
      if (numericQuery.length >= 2) {
        try {
          const response = await fetch(`/api/bonificacoes/extrato-descontos/cpf-suggestions?q=${encodeURIComponent(numericQuery)}`)
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

  // Sincronizar cpfQuery quando os filtros são limpos externamente
  useEffect(() => {
    if (!pendingFilters.cpf && !appliedFilters.cpf && cpfQuery && !cpfFocused) {
      setCpfQuery("")
    }
  }, [pendingFilters.cpf, appliedFilters.cpf, cpfQuery, cpfFocused])

  const handleFilterChange = (key: keyof ExtratoFilters, value: string) => {
    setPendingFilters(prev => ({
      ...prev,
      [key]: value,
    }))
  }

  const applyFilters = (override?: Partial<ExtratoFilters>) => {
    const nextCpf = (override?.cpf ?? pendingFilters.cpf)?.replace(/\D/g, "") || ""
    const nextNome = (override?.nome ?? pendingFilters.nome)?.trim() || ""
    const changed = nextCpf !== appliedFilters.cpf || nextNome !== appliedFilters.nome

    setPendingFilters(prev => ({
      cpf: override?.cpf ?? prev.cpf,
      nome: override?.nome ?? prev.nome,
    }))

    if (!changed) {
      return
    }

    setAppliedFilters({ cpf: nextCpf, nome: nextNome })
    setPage(1)
  }

  const clearFilters = () => {
    setPendingFilters(createEmptyFilters())
    setAppliedFilters(createEmptyFilters())
    setCpfQuery("")
    setPage(1)
  }

  const parseValorToNumber = (input: string | number): number => {
    if (typeof input === "number") return input
    const normalized = input
      .trim()
      .replace(/\./g, "")
      .replace(/[^0-9,-]/g, "")
    const isNegative = normalized.startsWith("-")
    const numericPart = normalized.replace(/-/g, "").replace(",", ".")
    const cleaned = (isNegative ? "-" : "") + numericPart
    return parseFloat(cleaned)
  }

  // Função para inserir movimentação
  const handleInsertMovimentacao = async () => {
    // Validações
    if (!formData.dt_movimentacao || !formData.cpf || !formData.nome || !formData.valor || !formData.dt_apuracao || !formData.tipo_movimentacao) {
      toast({
        title: "Erro de validação",
        description: "Preencha todos os campos obrigatórios",
        variant: "destructive",
      })
      return
    }

    // Validar valor
    const valorNumero = parseValorToNumber(formData.valor || "")
    if (isNaN(valorNumero) || valorNumero === 0) {
      toast({
        title: "Erro de validação",
        description: "Valor inválido",
        variant: "destructive",
      })
      return
    }

    const valorFinal = valorNumero

    setSubmitting(true)
    try {
      const response = await fetch("/api/bonificacoes/extrato-descontos", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          dt_movimentacao: formData.dt_movimentacao,
          cpf: formData.cpf,
          nome: formData.nome,
          valor: valorFinal,
          dt_apuracao: formData.dt_apuracao,
          tipo_movimentacao: formData.tipo_movimentacao,
          proposta: formData.proposta || null,
          dt_exclusao_proposta: formData.dt_exclusao_proposta || null,
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || "Erro ao inserir movimentação")
      }

      toast({
        title: "Sucesso",
        description: result.message || "Movimentação inserida com sucesso",
      })

      // Limpar formulário
      setFormData({
        dt_movimentacao: "",
        cpf: "",
        nome: "",
        valor: "",
        dt_apuracao: "",
        tipo_movimentacao: "desconto realizado",
        proposta: "",
        dt_exclusao_proposta: ""
      })
      setIsDialogOpen(false)

      // Se houver CPF no formulário e não houver filtros aplicados, aplicar o filtro automaticamente
      const cpfForm = formData.cpf.replace(/\D/g, "")
      if (cpfForm && !pendingFilters.cpf) {
        setPendingFilters(prev => ({ ...prev, cpf: cpfForm }))
        setCpfQuery(formatCpf(cpfForm))
        if (formData.nome && !pendingFilters.nome) {
          setPendingFilters(prev => ({ ...prev, nome: formData.nome }))
        }
        applyFilters({ cpf: cpfForm, nome: formData.nome || pendingFilters.nome })
      }
      
      // Resetar página para 1 e forçar atualização
      setPage(1)
      isInitialLoad.current = false
      
      // Aguardar um pequeno delay para garantir que os estados sejam atualizados
      await new Promise(resolve => setTimeout(resolve, 100))
      
      // Recarregar dados
      await fetchData()
    } catch (error: any) {
      console.error("Erro ao inserir movimentação:", error)
      toast({
        title: "Erro",
        description: error.message || "Erro ao inserir movimentação",
        variant: "destructive",
      })
    } finally {
      setSubmitting(false)
    }
  }

  const formatDate = (date: string | Date | null | undefined) => {
    if (!date) return ""
    const formatted = formatDateBR(date)
    return formatted || (typeof date === "string" ? date : "")
  }

  // Carrega a lib XLSX via CDN (evita problemas de módulo não encontrado no Next.js)
  const getXLSX = async (): Promise<any> => {
    if (typeof window === 'undefined') {
      throw new Error('XLSX can only be loaded in browser')
    }
    
    // Verificar se já está carregado
    // @ts-ignore
    if (window.XLSX) {
      // @ts-ignore
      return window.XLSX
    }
    
    // Carregar via CDN
    return await new Promise((resolve, reject) => {
      // Verificar novamente antes de criar o script (pode ter sido carregado entre as verificações)
      // @ts-ignore
      if (window.XLSX) {
        // @ts-ignore
        return resolve(window.XLSX)
      }
      
      const script = document.createElement('script')
      script.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js'
      script.async = true
      script.onload = () => {
        try {
          // @ts-ignore
          const XLSX = window.XLSX
          if (XLSX) {
            resolve(XLSX)
          } else {
            reject(new Error('XLSX not available after loading'))
          }
        } catch (e) { 
          reject(e as any) 
        }
      }
      script.onerror = () => reject(new Error('Failed to load XLSX from CDN'))
      document.body.appendChild(script)
    })
  }

  // Buscar todos os dados filtrados para exportação
  const fetchAllDataForExport = async (): Promise<ExtratoDescontosData[]> => {
    try {
      // Primeira requisição para obter o total de páginas
      const params = new URLSearchParams()
      params.append("page", "1")
      params.append("pageSize", "100") // Máximo permitido pela API

      if (appliedFilters.cpf) params.append("cpf", appliedFilters.cpf)
      if (appliedFilters.nome) params.append("nome", appliedFilters.nome)

      const firstResponse = await fetch(`/api/bonificacoes/extrato-descontos?${params}`)
      
      if (!firstResponse.ok) {
        throw new Error(`HTTP error! status: ${firstResponse.status}`)
      }

      const firstResult: ApiResponse = await firstResponse.json()

      if (firstResult.error) {
        throw new Error(firstResult.error)
      }

      let allData: ExtratoDescontosData[] = [...(firstResult.data || [])]
      const totalPages = firstResult.pagination?.totalPages || 1

      // Buscar páginas restantes se houver
      if (totalPages > 1) {
        const remainingPages = Array.from({ length: totalPages - 1 }, (_, i) => i + 2)
        const results = await Promise.all(
          remainingPages.map(async (pageNum) => {
            const pageParams = new URLSearchParams()
            pageParams.append("page", pageNum.toString())
            pageParams.append("pageSize", "100")

            if (appliedFilters.cpf) pageParams.append("cpf", appliedFilters.cpf)
            if (appliedFilters.nome) pageParams.append("nome", appliedFilters.nome)

            try {
              const response = await fetch(`/api/bonificacoes/extrato-descontos?${pageParams}`)
              if (!response.ok) return []
              const result = await response.json()
              return result.data || []
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
      console.error("Erro ao buscar dados para exportação:", error)
      throw error
    }
  }

  // Exportar para XLSX
  const exportToXLSX = async () => {
    if (exporting) return
    
    // Verificar se há filtros aplicados
    if (!appliedFilters.cpf && !appliedFilters.nome) {
      toast({
        title: "Filtros necessários",
        description: "É necessário aplicar pelo menos um filtro (CPF ou Nome) para exportar.",
        variant: "destructive",
      })
      return
    }

    setExporting(true)
    try {
      // Buscar todos os dados filtrados
      const allData = await fetchAllDataForExport()

      if (allData.length === 0) {
        toast({
          title: "Nenhum dado para exportar",
          description: "Não há registros para exportar com os filtros aplicados.",
          variant: "destructive",
        })
        setExporting(false)
        return
      }

      // Carregar biblioteca XLSX
      const XLSX = await getXLSX()

      // Preparar dados para o Excel
      const excelData: any[] = []

      // Título
      excelData.push(["EXTRATO DE DESCONTO"])
      excelData.push([]) // Linha em branco

      // Linha 1: CPF
      const row1: any[] = []
      const cpfValue = appliedFilters.cpf ? formatCpf(appliedFilters.cpf) : ""
      row1.push(`CPF: ${cpfValue}`)
      excelData.push(row1)

      // Linha 2: Nome
      const row2: any[] = []
      const nomeValue = appliedFilters.nome || ""
      row2.push(`NOME: ${nomeValue}`)
      excelData.push(row2)
      excelData.push([]) // Linha em branco

      // Cabeçalhos da tabela (sem CPF e Nome)
      const headers = [
        "Tipo Movimentação",
        "Valor",
        "Proposta",
        "Data Exclusão",
        "Apuração"
      ]
      excelData.push(headers)

      // Dados da tabela formatados (sem CPF e Nome)
      const formattedData = allData.map(row => [
        row.tipo_movimentacao || "",
        row.valor ? formatCurrency(row.valor) : "",
        row.proposta || "",
        formatDate(row.dt_exclusao_proposta),
        formatDate(row.dt_apuracao)
      ])
      excelData.push(...formattedData)
      
      // Adicionar primeira linha vazia após os dados
      excelData.push([])
      
      // Adicionar segunda linha vazia (onde vai o SALDO TOTAL na coluna A)
      const saldoRow: any[] = []
      saldoRow.push(`SALDO TOTAL: ${formatCurrency(saldoTotal)}`)
      excelData.push(saldoRow)

      // Criar worksheet
      const ws = XLSX.utils.aoa_to_sheet(excelData)

      // Ajustar largura das colunas
      const colWidths = [
        { wch: 25 }, // Tipo Movimentação
        { wch: 15 }, // Valor
        { wch: 15 }, // Proposta
        { wch: 18 }, // Data Exclusão
        { wch: 15 }  // Apuração
      ]
      ws['!cols'] = colWidths

      // Encontrar linha do cabeçalho da tabela (depois dos filtros e saldo)
      let headerRowIndex = 0
      for (let i = 0; i < excelData.length; i++) {
        if (excelData[i][0] === "Tipo Movimentação") {
          headerRowIndex = i
          break
        }
      }

      // Estilizar título
      const titleCell = XLSX.utils.encode_cell({ r: 0, c: 0 })
      if (ws[titleCell]) {
        ws[titleCell].s = {
          font: { bold: true, sz: 16, color: { rgb: "000000" } },
          fill: { fgColor: { rgb: "FFFFFF" } },
          alignment: { horizontal: "left", vertical: "center" }
        }
      }

      // Estilizar linha 1: CPF (linha 2)
      const row1Index = 2
      const row1Data = excelData[row1Index] || []
      
      // Estilizar célula CPF
      if (row1Data.length > 0) {
        const cpfCellAddress = XLSX.utils.encode_cell({ r: row1Index, c: 0 })
        if (ws[cpfCellAddress]) {
          ws[cpfCellAddress].s = {
            font: { bold: true, color: { rgb: "000000" } },
            fill: { fgColor: { rgb: "F5F5F5" } },
            alignment: { horizontal: "left", vertical: "center" }
          }
        }
      }

      // Estilizar linha 2: Nome (linha 3)
      const row2Index = 3
      const row2Data = excelData[row2Index] || []
      
      // Estilizar célula NOME
      if (row2Data.length > 0) {
        const nomeCellAddress = XLSX.utils.encode_cell({ r: row2Index, c: 0 })
        if (ws[nomeCellAddress]) {
          ws[nomeCellAddress].s = {
            font: { bold: true, color: { rgb: "000000" } },
            fill: { fgColor: { rgb: "F5F5F5" } },
            alignment: { horizontal: "left", vertical: "center" }
          }
        }
      }
      
      // Encontrar linha do SALDO TOTAL (após os dados da tabela)
      let saldoRowIndex = -1
      for (let i = excelData.length - 1; i >= 0; i--) {
        const row = excelData[i]
        if (row && row.length > 0 && typeof row[0] === 'string' && row[0].startsWith('SALDO TOTAL:')) {
          saldoRowIndex = i
          break
        }
      }
      
      // Estilizar SALDO TOTAL
      if (saldoRowIndex >= 0) {
        const saldoCellAddress = XLSX.utils.encode_cell({ r: saldoRowIndex, c: 0 })
        if (ws[saldoCellAddress]) {
          const saldoColor = saldoTotal < 0 ? "B91C1C" : "15803D"
          ws[saldoCellAddress].s = {
            font: { bold: true, sz: 14, color: { rgb: saldoColor } },
            fill: { fgColor: { rgb: "FFFFFF" } },
            alignment: { horizontal: "left", vertical: "center" }
          }
        }
      }

      // Estilizar cabeçalho da tabela (negrito e fundo cinza claro)
      const headerRange = XLSX.utils.decode_range(ws['!ref'] || 'A1')
      for (let col = headerRange.s.c; col <= headerRange.e.c; col++) {
        const cellAddress = XLSX.utils.encode_cell({ r: headerRowIndex, c: col })
        if (!ws[cellAddress]) continue
        ws[cellAddress].s = {
          font: { bold: true, color: { rgb: "000000" } },
          fill: { fgColor: { rgb: "F3F4F6" } }, // gray-100
          alignment: { horizontal: "center", vertical: "center" },
          border: {
            top: { style: "thin", color: { rgb: "D1D5DB" } },
            bottom: { style: "thin", color: { rgb: "D1D5DB" } },
            left: { style: "thin", color: { rgb: "D1D5DB" } },
            right: { style: "thin", color: { rgb: "D1D5DB" } }
          }
        }
      }
      
      // Estilizar linhas de dados da tabela (alternando cores e bordas)
      for (let row = headerRowIndex + 1; row <= headerRowIndex + formattedData.length; row++) {
        const isEvenRow = (row - headerRowIndex) % 2 === 0
        const rowBgColor = isEvenRow ? "FFFFFF" : "F9FAFB" // Branco e gray-50
        
        for (let col = headerRange.s.c; col <= headerRange.e.c; col++) {
          const cellAddress = XLSX.utils.encode_cell({ r: row, c: col })
          if (!ws[cellAddress]) continue
          
          // Se for coluna de Valor, manter alinhamento à direita
          const isValueCol = col === 1 // Valor é a segunda coluna agora (índice 1)
          
          ws[cellAddress].s = {
            font: { color: { rgb: "000000" } },
            fill: { fgColor: { rgb: rowBgColor } },
            alignment: { 
              horizontal: isValueCol ? "right" : "left", 
              vertical: "center" 
            },
            border: {
              top: { style: "thin", color: { rgb: "E5E7EB" } },
              bottom: { style: "thin", color: { rgb: "E5E7EB" } },
              left: { style: "thin", color: { rgb: "E5E7EB" } },
              right: { style: "thin", color: { rgb: "E5E7EB" } }
            }
          }
        }
      }

      // Criar workbook
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, "Extrato Descontos")

      // Gerar arquivo
      const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" })
      
      // Download
      const blob = new Blob([wbout], { type: "application/octet-stream" })
      const url = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      const dateStr = formatDateISO(new Date())
      link.download = `extrato_descontos_${dateStr}.xlsx`
      link.style.visibility = "hidden"
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)

      toast({
        title: "Exportação concluída",
        description: `${allData.length} registro(s) exportado(s) com sucesso.`,
      })
    } catch (error: any) {
      console.error("Erro ao exportar:", error)
      toast({
        title: "Erro ao exportar",
        description: error.message || "Não foi possível exportar o arquivo. Tente novamente.",
        variant: "destructive",
      })
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="px-4 py-6 lg:pl-8 lg:pr-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Extrato Descontos</h1>
        <p className="text-muted-foreground mt-1">
          Visualize o extrato de descontos de bonificações.
        </p>
      </div>

      {/* Box Principal */}
      <Card className="border shadow-sm bg-white">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-xl">Extrato Descontos</CardTitle>
              <CardDescription>Filtre e visualize os registros de descontos de bonificações</CardDescription>
            </div>
            <div className="flex gap-2">
              {canCreate && (
                <Button 
                  onClick={() => setIsDialogOpen(true)}
                  variant="default"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Nova Movimentação
                </Button>
              )}
                  <Button 
                onClick={exportToXLSX} 
                disabled={exporting || total === 0 || (!appliedFilters.cpf && !appliedFilters.nome)}
                variant="outline"
              >
                <Download className="h-4 w-4 mr-2" />
                {exporting ? "Exportando..." : "Exportar"}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Box de Filtros e Saldo lado a lado */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Box de Filtros */}
            <Card className="border shadow-sm lg:col-span-2" style={{ backgroundColor: 'var(--filter-box-bg)' }}>
              <CardHeader>
                <CardTitle>Filtros</CardTitle>
                <CardDescription>Filtre os registros por critérios específicos</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="filter_cpf">CPF</Label>
                    <div className="relative">
                      <Input
                        id="filter_cpf"
                        placeholder="Buscar por CPF..."
                        value={
                          cpfFocused
                            ? cpfQuery
                            : (pendingFilters.cpf ? formatCpf(pendingFilters.cpf) : cpfQuery)
                        }
                        onFocus={() => {
                          setCpfFocused(true)
                          if (pendingFilters.cpf) {
                            setCpfQuery(formatCpf(pendingFilters.cpf))
                          }
                        }}
                        onBlur={() => setTimeout(() => setCpfFocused(false), 150)}
                        onChange={(e) => {
                          const value = e.target.value
                          setCpfQuery(value)
                          // Remove formatação para buscar no banco
                          const numericValue = value.replace(/\D/g, "")
                          handleFilterChange("cpf", numericValue)
                        }}
                        className="bg-white"
                      />
                      {(pendingFilters.cpf || cpfQuery) && (
                        <button
                          type="button"
                          aria-label="Limpar CPF"
                          onClick={() => {
                            setCpfQuery("")
                            handleFilterChange("cpf", "")
                            setCpfFocused(true)
                          }}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      )}
                      {cpfFocused && cpfSuggestions.length > 0 && (
                        <div className="absolute z-10 mt-1 w-full max-h-56 overflow-auto rounded-md border bg-white text-popover-foreground shadow" style={{ background: '#ffffff' }}>
                          {cpfSuggestions.map((suggestion, idx) => (
                            <button
                              key={`${suggestion.cpf}-${idx}`}
                              type="button"
                              onClick={() => {
                                setPendingFilters(prev => ({
                                  ...prev,
                                  cpf: suggestion.cpf,
                                  nome: suggestion.nome || prev.nome
                                }))
                                setCpfQuery(suggestion.formattedCpf)
                                setCpfFocused(false)
                                applyFilters({
                                  cpf: suggestion.cpf,
                                  nome: suggestion.nome || pendingFilters.nome
                                })
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
                      value={pendingFilters.nome}
                      onChange={(e) => handleFilterChange("nome", e.target.value)}
                      className="bg-white"
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

            {/* Card de Saldo */}
            <Card className="border shadow-sm bg-white">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Saldo Total</p>
                    <p className={`text-3xl font-bold ${saldoTotal < 0 ? 'text-red-700' : 'text-green-700'}`}>
                      {formatCurrency(saldoTotal)}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Baseado nos filtros aplicados
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Tabela */}
          <div className="border rounded-md overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>CPF</TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead>Data da Movimentação</TableHead>
                  <TableHead>Tipo Movimentação</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead>Proposta</TableHead>
                  <TableHead>Data Exclusão</TableHead>
                  <TableHead>Apuração</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8">
                      <p className="text-muted-foreground">Carregando...</p>
                    </TableCell>
                  </TableRow>
                ) : data.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                      Nenhum resultado encontrado
                    </TableCell>
                  </TableRow>
                ) : (
                  data.map((row, index) => (
                    <TableRow key={index}>
                      <TableCell>{formatCpf(row.cpf)}</TableCell>
                      <TableCell>{row.nome || ""}</TableCell>
                      <TableCell>{formatDate(row.dt_movimentacao)}</TableCell>
                      <TableCell>{row.tipo_movimentacao || ""}</TableCell>
                      <TableCell className="text-right">{row.valor ? formatCurrency(row.valor) : ""}</TableCell>
                      <TableCell>{row.proposta || ""}</TableCell>
                      <TableCell>{formatDate(row.dt_exclusao_proposta)}</TableCell>
                      <TableCell>{formatDate(row.dt_apuracao)}</TableCell>
                    </TableRow>
                  ))
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

      {/* Modal de Inserção de Movimentação */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nova Movimentação</DialogTitle>
            <DialogDescription>
              Preencha os dados para inserir uma nova movimentação no extrato de descontos.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="dt_movimentacao">
                  Data da Movimentação <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="dt_movimentacao"
                  type="date"
                  value={formData.dt_movimentacao}
                  onChange={(e) => setFormData({ ...formData, dt_movimentacao: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="dt_apuracao">
                  Data de Apuração <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="dt_apuracao"
                  type="date"
                  value={formData.dt_apuracao}
                  onChange={(e) => setFormData({ ...formData, dt_apuracao: e.target.value })}
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="cpf">
                  CPF <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="cpf"
                  placeholder="000.000.000-00"
                  value={formData.cpf}
                  onChange={(e) => {
                    const value = e.target.value
                    setFormData({ ...formData, cpf: value })
                  }}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="nome">
                  Nome <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="nome"
                  placeholder="Nome completo"
                  value={formData.nome}
                  onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="valor">
                  Valor <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="valor"
                  type="text"
                  placeholder="0,00"
                  value={formData.valor}
                  onChange={(e) => {
                    let raw = e.target.value.replace(/[^0-9,-]/g, "")
                    const isNegative = raw.startsWith("-")
                    raw = raw.replace(/-/g, "")

                    if (raw.startsWith(",")) {
                      raw = "0" + raw
                    }

                    let beforeComma = raw
                    let afterComma = ""

                    const commaIndex = raw.indexOf(",")
                    if (commaIndex !== -1) {
                      beforeComma = raw.slice(0, commaIndex)
                      afterComma = raw
                        .slice(commaIndex + 1)
                        .replace(/,/g, "")
                        .replace(/[^0-9]/g, "")
                        .slice(0, 2)
                    }

                    let formatted = beforeComma
                    if (commaIndex !== -1) {
                      formatted += "," + afterComma
                    }

                    if (isNegative) {
                      formatted = "-" + formatted
                    }

                    // Permitir apenas "-" temporariamente enquanto o usuário digita
                    if (formatted === "-") {
                      setFormData({ ...formData, valor: "-" })
                      return
                    }

                    setFormData({ ...formData, valor: formatted })
                  }}
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Digite o valor (positivo ou negativo). Ex: 100,50 ou -50,00
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="tipo_movimentacao">
                  Tipo de Movimentação <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="tipo_movimentacao"
                  placeholder="Ex: desconto realizado"
                  value={formData.tipo_movimentacao}
                  onChange={(e) => setFormData({ ...formData, tipo_movimentacao: e.target.value })}
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="proposta">Proposta</Label>
                <Input
                  id="proposta"
                  placeholder="Número da proposta (opcional)"
                  value={formData.proposta}
                  onChange={(e) => setFormData({ ...formData, proposta: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="dt_exclusao_proposta">Data de Exclusão da Proposta</Label>
                <Input
                  id="dt_exclusao_proposta"
                  type="date"
                  value={formData.dt_exclusao_proposta}
                  onChange={(e) => setFormData({ ...formData, dt_exclusao_proposta: e.target.value })}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsDialogOpen(false)
                setFormData({
                  dt_movimentacao: "",
                  cpf: "",
                  nome: "",
                  valor: "",
                  dt_apuracao: "",
                  tipo_movimentacao: "desconto realizado",
                  proposta: "",
                  dt_exclusao_proposta: ""
                })
              }}
              disabled={submitting}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleInsertMovimentacao}
              disabled={submitting}
            >
              {submitting ? "Inserindo..." : "Inserir Movimentação"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

