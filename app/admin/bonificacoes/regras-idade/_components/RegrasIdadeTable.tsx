"use client"

import { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { OPERADORAS, TIPOS_FAIXA, PRODUTOS, PAGAMENTO_POR, TIPO_BENEFICIARIO, PARCELAS } from "./constants"
import { Download, Search, ChevronLeft, ChevronRight, X, Pencil, Check, XCircle, Trash2, Loader2, Circle } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { signalPageLoaded } from "@/components/ui/page-loading"
import { formatDateBR, formatDateISO } from "@/lib/date-utils"

// Interface dinâmica para suportar todas as colunas do banco
interface RegraData {
  [key: string]: any
}

interface ApiResponse {
  data?: RegraData[]
  pagination?: {
    page: number
    pageSize: number
    total: number
    totalPages: number
  }
  error?: string
}

export function RegrasIdadeTable({ readOnly = false, title = "Gerenciamento de Regras", description, refreshKey }: { readOnly?: boolean; title?: string; description?: string; refreshKey?: number }) {
  const { toast } = useToast()
  const [data, setData] = useState<RegraData[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [pageSize] = useState(20)
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(0)
  const [activeRules, setActiveRules] = useState<Set<string>>(new Set()) // IDs das regras ativas
  const [kpiLoaded, setKpiLoaded] = useState(false) // Indica se os KPIs foram carregados

  // Filtros - campos específicos para faixas de idade
  const [filters, setFilters] = useState({
    operadora: "",
    tipo_beneficiario: "",
    parcela: "", // Este filtro será mapeado para chave_faixa na API
    entidade: "",
    plano: "",
    vigencia_inicio: ""
  })

  // Debounce para inputs de texto
  const [debouncedEntidade, setDebouncedEntidade] = useState("")
  const [debouncedPlano, setDebouncedPlano] = useState("")
  const [operadoraQuery, setOperadoraQuery] = useState("")
  const [operadoraFocused, setOperadoraFocused] = useState(false)
  const [availablePlanos, setAvailablePlanos] = useState<string[]>([])
  const [availableTiposBeneficiario, setAvailableTiposBeneficiario] = useState<string[]>([])
  const [availableParcelas, setAvailableParcelas] = useState<string[]>([])
  const [availableEntidades, setAvailableEntidades] = useState<string[]>([])
  const [availableOperadoras, setAvailableOperadoras] = useState<string[]>([])
  const [optionsLoading, setOptionsLoading] = useState(false)

  // Estado para edição inline
  const [editingRow, setEditingRow] = useState<string | null>(null)
  const [editedData, setEditedData] = useState<{ [key: string]: any }>({})
  const [originalData, setOriginalData] = useState<{ [key: string]: any }>({})

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedEntidade(filters.entidade)
    }, 300)
    return () => clearTimeout(timer)
  }, [filters.entidade])

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedPlano(filters.plano)
    }, 300)
    return () => clearTimeout(timer)
  }, [filters.plano])

  // Carregar todas as operadoras disponíveis do banco de dados
  useEffect(() => {
    const loadOperadoras = async () => {
      try {
        const params = new URLSearchParams()
        params.set("page", "1")
        params.set("pageSize", "500")
        
        const firstRes = await fetch(`/api/bonificacoes/regras-idade?${params.toString()}`)
        if (!firstRes.ok) return
        
        const firstJson: any = await firstRes.json()
        let allRows: any[] = firstJson?.data || []
        const totalPages = firstJson?.pagination?.totalPages || 1
        
        if (totalPages > 1) {
          const remainingPages = Array.from({ length: totalPages - 1 }, (_, i) => i + 2)
          const results = await Promise.all(remainingPages.map(async (p) => {
            const pParams = new URLSearchParams(params)
            pParams.set("page", String(p))
            try {
              const r = await fetch(`/api/bonificacoes/regras-idade?${pParams.toString()}`)
              return await r.json()
            } catch {
              return { data: [] }
            }
          }))
          results.forEach((r: any) => { if (r?.data?.length) allRows = allRows.concat(r.data) })
        }
        
        // Extrair operadoras únicas
        const uniq = (arr: any[]) => Array.from(new Set(arr.filter(Boolean))) as string[]
        const sortAlpha = (list: string[]) => list.sort((a, b) => normalize(a).localeCompare(normalize(b)))
        const operadoras = sortAlpha(uniq(allRows.map(r => r.operadora)))
        setAvailableOperadoras(operadoras)
      } catch (error) {
        console.error("Erro ao carregar operadoras:", error)
        // Fallback para lista fixa em caso de erro
        setAvailableOperadoras(OPERADORAS)
      }
    }
    
    loadOperadoras()
  }, [])

  // Atualiza listas únicas para todos os filtros baseadas nos filtros atuais
  useEffect(() => {
    const fetchAllRows = async (params: URLSearchParams) => {
      params.set("page", "1")
      params.set("pageSize", "500")
      // A API aplica ordenação fixa automaticamente
      const firstRes = await fetch(`/api/bonificacoes/regras-idade?${params.toString()}`)
      if (!firstRes.ok) throw new Error(`HTTP ${firstRes.status}`)
      const firstJson: any = await firstRes.json()
      let rows: any[] = firstJson?.data || []
      const totalPages = firstJson?.pagination?.totalPages || 1
      if (totalPages > 1) {
        const remainingPages = Array.from({ length: totalPages - 1 }, (_, i) => i + 2)
        const results = await Promise.all(remainingPages.map(async (p) => {
          const pParams = new URLSearchParams(params)
          pParams.set("page", String(p))
          try {
            const r = await fetch(`/api/bonificacoes/regras-idade?${pParams.toString()}`)
            return await r.json()
          } catch {
            return { data: [] }
          }
        }))
        results.forEach((r: any) => { if (r?.data?.length) rows = rows.concat(r.data) })
      }
      return rows
    }

    const fetchOptions = async () => {
      try {
        setOptionsLoading(true)
        if (!filters.operadora) throw new Error("no-op")
        const uniq = (arr: any[]) => Array.from(new Set(arr.filter(Boolean))) as string[]
        const sortAlpha = (list: string[]) => list.sort((a, b) => normalize(a).localeCompare(normalize(b)))
        const sortAlphaDesc = (list: string[]) => list.sort((a, b) => normalize(b).localeCompare(normalize(a))) // Z-A

        // Helper to build params apenas com operadora (base para todas as opções)
        // Os outros filtros não devem limitar as opções disponíveis nos dropdowns
        const buildBaseParams = () => {
          const params = new URLSearchParams()
          params.append("operadora", filters.operadora)
          return params
        }

        // Buscar todas as opções disponíveis baseadas apenas na operadora selecionada
        const baseRows = await fetchAllRows(buildBaseParams())

        // Extrair opções únicas de cada campo dos registros filtrados apenas por operadora
        // Campos específicos para faixas de idade
        setAvailablePlanos(sortAlpha(uniq(baseRows.map(r => r.plano))))
        setAvailableTiposBeneficiario(sortAlphaDesc(uniq(baseRows.map(r => r.tipo_beneficiario)))) // Z-A
        // Parcela mapeia para chave_faixa na tabela
        setAvailableParcelas(sortAlpha(uniq(baseRows.map(r => r.chave_faixa))))
        setAvailableEntidades(sortAlpha(uniq(baseRows.map(r => r.entidade))))
      } catch {
        setAvailablePlanos([])
        setAvailableTiposBeneficiario([])
        setAvailableParcelas([])
        setAvailableEntidades([])
      } finally {
        setOptionsLoading(false)
      }
    }

    if (filters.operadora) {
      fetchOptions()
    } else {
      setAvailablePlanos([])
      setAvailableTiposBeneficiario([])
      setAvailableParcelas([])
      setAvailableEntidades([])
      setOptionsLoading(false)
    }
  }, [filters.operadora]) // Só recalcular quando a operadora mudar, pois as opções são baseadas apenas nela

  // Auto-preencher e travar filtros com opção única
  useEffect(() => {
    if (!filters.operadora) return
    const next: any = {}
    if (!filters.plano && availablePlanos.length === 1) next.plano = availablePlanos[0]
    if (!filters.tipo_beneficiario && availableTiposBeneficiario.length === 1) next.tipo_beneficiario = availableTiposBeneficiario[0]
    if (!filters.parcela && availableParcelas.length === 1) next.parcela = availableParcelas[0]
    if (!filters.entidade && availableEntidades.length === 1) next.entidade = availableEntidades[0]
    if (Object.keys(next).length > 0) setFilters((p) => ({ ...p, ...next }))
  }, [filters.operadora, availablePlanos, availableTiposBeneficiario, availableParcelas, availableEntidades])

  const normalize = (s: string) => s
    .normalize("NFD")
    .replace(/\p{Diacritic}+/gu, "")
    .toLowerCase()

  // Função para criar chave única de uma regra (campos que identificam uma regra "igual")
  // Campos específicos para faixas de idade
  const getRegraKey = (regra: RegraData): string => {
    const campos = [
      'operadora',
      'entidade', 
      'plano',
      'chave_faixa', // chave_faixa em vez de tipo_faixa
      'produto',
      'pagamento_por',
      'tipo_beneficiario',
      'parcela',
      'idade_min', // incluir idade_min e idade_max para diferenciar faixas
      'idade_max'
    ]
    return campos.map(campo => normalize(String(regra[campo] || ''))).join('|')
  }

  // Função para buscar todas as regras do banco TODO e identificar qual é a ativa
  // A análise deve ser feita em TODOS os registros do banco, independente dos filtros aplicados
  const identifyActiveRules = useCallback(async () => {
    try {
      // Buscar todas as regras sem paginação para comparação
      const params = new URLSearchParams()
      Object.entries(filters).forEach(([key, value]) => {
        if (key === "entidade") {
          if (debouncedEntidade) params.append(key, debouncedEntidade)
        } else if (key === "plano") {
          if (filters.operadora && value) params.append(key, value)
          else if (debouncedPlano) params.append(key, debouncedPlano)
        } else if (value) {
          params.append(key, value)
        }
      })
      
      params.append("page", "1")
      params.append("pageSize", "500")
      // A API aplica ordenação fixa automaticamente

      const firstRes = await fetch(`/api/bonificacoes/regras-idade?${params.toString()}`)
      if (!firstRes.ok) return
      
      const firstJson: any = await firstRes.json()
      let allRows: any[] = firstJson?.data || []
      const totalPages = firstJson?.pagination?.totalPages || 1

      // Buscar páginas restantes
      if (totalPages > 1) {
        const remainingPages = Array.from({ length: totalPages - 1 }, (_, i) => i + 2)
        const results = await Promise.all(remainingPages.map(async (p) => {
          const pParams = new URLSearchParams(params)
          pParams.set("page", String(p))
          try {
            const r = await fetch(`/api/bonificacoes/regras-idade?${pParams.toString()}`)
            return await r.json()
          } catch {
            return { data: [] }
          }
        }))
        results.forEach((r: any) => { if (r?.data?.length) allRows = allRows.concat(r.data) })
      }

      // Agrupar regras por chave única
      const grupos: { [key: string]: RegraData[] } = {}
      allRows.forEach(regra => {
        const key = getRegraKey(regra)
        if (!grupos[key]) grupos[key] = []
        grupos[key].push(regra)
      })

      // Para cada grupo, identificar a regra ativa conforme vigência praticada:
      // 1) prioriza vigências <= hoje; 2) se não houver, usa a mais recente futura.
      const activeIds = new Set<string>()
      const todayRank = Number(formatDateISO(new Date()).replace(/-/g, "")) || 0

      const dateRank = (value: any) => {
        const iso = formatDateISO(value)
        return iso ? Number(iso.replace(/-/g, "")) || 0 : 0
      }

      Object.values(grupos).forEach(grupo => {
        if (grupo.length === 0) return

        const elegiveisAteHoje = grupo.filter((r) => dateRank(r.vigencia) <= todayRank)
        const base = elegiveisAteHoje.length > 0 ? elegiveisAteHoje : grupo

        const sorted = [...base].sort((a, b) => {
          const vigA = dateRank(a.vigencia)
          const vigB = dateRank(b.vigencia)
          if (vigB !== vigA) return vigB - vigA

          const regA = dateRank(a.registro)
          const regB = dateRank(b.registro)
          return regB - regA
        })

        const ativa = sorted[0]
        if (ativa?.id) activeIds.add(String(ativa.id))
      })

      // Primeiro atualiza os KPIs
      setActiveRules(activeIds)
      
      // Função para verificar se os KPIs estão renderizados com as cores corretas
      const checkKPIsReady = () => {
        const kpiElements = document.querySelectorAll('[data-kpi-status]')
        if (kpiElements.length === 0) {
          return false
        }
        
        // Conta quantos KPIs têm as cores corretas
        let correctCount = 0
        kpiElements.forEach((el) => {
          const circle = el.querySelector('svg')
          if (circle) {
            const status = el.getAttribute('data-kpi-status')
            const classes = circle.className.baseVal || circle.className
            
            // Verifica as classes do Tailwind (text-green-500 fill-green-500 ou text-gray-400 fill-gray-400)
            if (status === 'active') {
              // Verifica se tem classes verdes
              if (classes.includes('text-green-500') || classes.includes('fill-green-500')) {
                correctCount++
              }
            } else if (status === 'inactive') {
              // Verifica se tem classes cinzas
              if (classes.includes('text-gray-400') || classes.includes('fill-gray-400')) {
                correctCount++
              }
            }
          }
        })
        
        // Requer que pelo menos 80% dos KPIs tenham as cores corretas, ou todos se houver poucos
        const threshold = kpiElements.length <= 5 ? kpiElements.length : Math.ceil(kpiElements.length * 0.8)
        return correctCount >= threshold
      }
      
      // Aguarda múltiplos frames e verifica repetidamente até os KPIs estarem prontos
      const waitForKPIs = (attempts = 0) => {
        if (attempts > 20) {
          // Timeout após 20 tentativas (aproximadamente 2 segundos)
          setKpiLoaded(true)
          return
        }
        
        requestAnimationFrame(() => {
          if (checkKPIsReady()) {
            // Aguarda mais um pouco para garantir que tudo está estável
            setTimeout(() => {
              setKpiLoaded(true)
            }, 300)
          } else {
            // Tenta novamente após um pequeno delay
            setTimeout(() => {
              waitForKPIs(attempts + 1)
            }, 100)
          }
        })
      }
      
      // Inicia a verificação após múltiplos frames
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          waitForKPIs()
        })
      })
    } catch (error) {
      console.error("Erro ao identificar regras ativas:", error)
      // Mesmo com erro, marca como carregado após um delay
      setTimeout(() => {
        setKpiLoaded(true)
      }, 300)
    }
     }, [filters, debouncedEntidade, debouncedPlano])

  const operadoraSuggestions = operadoraQuery.trim()
    ? (availableOperadoras.length > 0 ? availableOperadoras : OPERADORAS).filter(op => {
        const q = normalize(operadoraQuery)
        const n = normalize(op)
        return n.startsWith(q) || n.split(/\s+/).some(w => w.startsWith(q))
      })
    : (availableOperadoras.length > 0 ? availableOperadoras : OPERADORAS)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      
      Object.entries(filters).forEach(([key, value]) => {
        if (key === "entidade") {
          if (debouncedEntidade) params.append(key, debouncedEntidade)
        } else if (key === "plano") {
          // Quando operadora estiver selecionada, 'plano' é um Select: filtrar imediatamente por valor exato
          if (filters.operadora) {
            if (value) params.append(key, value)
          } else {
            if (debouncedPlano) params.append(key, debouncedPlano)
          }
        } else if (key === "vigencia_inicio") {
          // Garantir que vigencia_inicio seja enviado se tiver valor válido
          const dateValue = String(value || "").trim()
          if (dateValue && dateValue.length > 0) {
            params.append(key, dateValue)
          }
        } else if (value && String(value).trim()) {
          // Garantir que todos os outros filtros sejam enviados se tiverem valor
          params.append(key, String(value).trim())
        }
      })

      params.append("page", page.toString())
      params.append("pageSize", pageSize.toString())
      // Ordenação fixa: vigencia DESC, registro DESC, idade_min ASC, plano ASC, tipo_beneficiario DESC
      // Não envia sort/order, a API aplicará ordenação fixa

      const queryString = params.toString()
      const response = await fetch(`/api/bonificacoes/regras-idade?${queryString}`)
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      
      const result: ApiResponse = await response.json()

      // Verificar se há erro na resposta
      if (result.error) {
        console.error("API Error:", result.error)
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

      // Validar se a resposta tem o formato esperado
      if (result && result.data && result.pagination) {
        let rows = result.data

        // Se plano veio de um Select (operadora definida), garantir match exato no cliente
        if (filters.operadora && filters.plano) {
          rows = rows.filter(r => normalize(String(r.plano || "")) === normalize(String(filters.plano)))
        }

        // Ordenação fixa: 1) vigencia DESC, 2) registro DESC, 3) idade_min ASC, 4) plano ASC (A-Z), 5) tipo_beneficiario DESC (Z-A - Titular antes de Dependente)
        // Planos iguais agrupados com Titular antes de Dependente
        const sortedRows = [...rows].sort((a, b) => {
          // 1. Ordenar por vigência (mais recente primeiro - DESC)
          const aVigencia = a.vigencia ? new Date(a.vigencia).getTime() : 0
          const bVigencia = b.vigencia ? new Date(b.vigencia).getTime() : 0
          if (bVigencia !== aVigencia) {
            return bVigencia - aVigencia // Mais recente primeiro
          }
          
          // 2. Se vigências iguais, ordenar por registro (mais recente primeiro - DESC)
          const aRegistro = a.registro ? new Date(a.registro).getTime() : 0
          const bRegistro = b.registro ? new Date(b.registro).getTime() : 0
          if (bRegistro !== aRegistro) {
            return bRegistro - aRegistro // Mais recente primeiro
          }
          
          // 3. Se registros iguais, ordenar por idade_min (numérica - ASC)
          const aIdadeMin = Number(a.idade_min || a.idadeMin || 0)
          const bIdadeMin = Number(b.idade_min || b.idadeMin || 0)
          if (aIdadeMin !== bIdadeMin) {
            return aIdadeMin - bIdadeMin // Ascendente (menor primeiro)
          }
          
          // 4. Se idade_min iguais, ordenar por plano (alfabética - ASC = A-Z)
          const aPlano = normalize(String(a.plano || ""))
          const bPlano = normalize(String(b.plano || ""))
          if (aPlano !== bPlano) {
            return aPlano.localeCompare(bPlano) // Alfabética ascendente (A-Z)
          }
          
          // 5. Se planos iguais, ordenar por tipo_beneficiario (alfabética reversa - DESC = Z-A - Titular antes de Dependente)
          const aTipoBenef = normalize(String(a.tipo_beneficiario || ""))
          const bTipoBenef = normalize(String(b.tipo_beneficiario || ""))
          return bTipoBenef.localeCompare(aTipoBenef) // Alfabética descendente (Z-A) - Titular antes de Dependente
        })
        
        setData(sortedRows)
        // Ajustar totais visualmente quando aplicamos filtro exato no cliente
        const effectiveTotal = filters.operadora && filters.plano ? sortedRows.length : result.pagination.total
        const effectiveTotalPages = Math.max(1, Math.ceil(effectiveTotal / pageSize))
        setTotal(effectiveTotal)
        setTotalPages(effectiveTotalPages)
        setKpiLoaded(false) // Reseta KPI quando dados mudam
      } else {
        console.error("Invalid response format:", result)
        setData([])
        setTotal(0)
        setTotalPages(0)
      }
    } catch (error) {
      console.error("Error fetching data:", error)
      toast({
        title: "Erro ao carregar dados",
        description: "Ocorreu um erro ao buscar as regras de bonificação",
        variant: "destructive",
      })
      setData([])
      setTotal(0)
      setTotalPages(0)
    } finally {
      setLoading(false)
    }
  }, [filters, debouncedEntidade, debouncedPlano, page, pageSize, toast, refreshKey])

  useEffect(() => {
    fetchData()
  }, [fetchData, refreshKey])

  // Identificar regras ativas quando os dados ou filtros mudarem
  useEffect(() => {
    if (!loading) {
      identifyActiveRules()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, debouncedEntidade, debouncedPlano, loading])

  // Manter ordenação fixa: dados já vêm ordenados da API e do frontend
  // Não reordenar por status, manter ordem fixa: vigencia DESC, registro DESC, idade_min ASC, plano ASC, tipo_beneficiario DESC

  // Sinaliza que a página terminou de carregar quando dados e KPIs estiverem prontos
  useEffect(() => {
    // Só sinaliza quando:
    // 1. Não está mais carregando os dados do banco (!loading)
    // 2. E (não há dados OU os KPIs foram carregados e atualizados com cores corretas)
    if (!loading) {
      if (data.length === 0) {
        // Se não há dados, pode sinalizar imediatamente
        requestAnimationFrame(() => {
          signalPageLoaded()
        })
      } else if (kpiLoaded) {
        // Se há dados, verifica novamente se os KPIs estão com as cores corretas
        // antes de iniciar o delay de 12 segundos
        let verificationAttempts = 0
        const maxAttempts = 50 // Máximo de 5 segundos de verificação (50 * 100ms)
        
        const verifyKPIsBeforeSignal = () => {
          verificationAttempts++
          
          // Timeout de segurança: após muitas tentativas, sinaliza mesmo assim
          if (verificationAttempts > maxAttempts) {
            signalPageLoaded()
            return
          }
          
          const kpiElements = document.querySelectorAll('[data-kpi-status]')
          if (kpiElements.length === 0) {
            // Se não há KPIs ainda, aguarda um pouco mais
            setTimeout(verifyKPIsBeforeSignal, 100)
            return
          }
          
          // Verifica se todos os KPIs têm as cores corretas
          let allCorrect = true
          kpiElements.forEach((el) => {
            const circle = el.querySelector('svg')
            if (circle) {
              const status = el.getAttribute('data-kpi-status')
              const classes = circle.className.baseVal || circle.className
              
              if (status === 'active') {
                // Deve ter classes verdes
                if (!classes.includes('text-green-500') && !classes.includes('fill-green-500')) {
                  allCorrect = false
                }
              } else if (status === 'inactive') {
                // Deve ter classes cinzas
                if (!classes.includes('text-gray-400') && !classes.includes('fill-gray-400')) {
                  allCorrect = false
                }
              }
            } else {
              allCorrect = false
            }
          })
          
          if (allCorrect) {
            // Todos os KPIs estão com as cores corretas e dados do banco carregados
            // Agora inicia o delay de 12 segundos antes de sinalizar
            signalPageLoaded()
          } else {
            // Ainda não estão todos corretos, verifica novamente
            setTimeout(verifyKPIsBeforeSignal, 100)
          }
        }
        
        // Aguarda múltiplos frames antes de verificar
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            verifyKPIsBeforeSignal()
          })
        })
      }
    }
  }, [loading, data.length, kpiLoaded])

  const handleFilterChange = (key: string, value: string) => {
    if (key === "operadora") {
      setFilters(prev => ({
        ...prev,
        operadora: value,
        // limpar filtros dependentes quando trocar/limpar operadora
        tipo_beneficiario: "",
        parcela: "",
        entidade: "",
        plano: "",
      }))
      setDebouncedEntidade("")
      setDebouncedPlano("")
    } else {
      setFilters(prev => ({ ...prev, [key]: value }))
    }
    setPage(1) // Reset to first page on filter change
  }

  const clearFilters = () => {
    setFilters({
      operadora: "",
      tipo_beneficiario: "",
      parcela: "",
      entidade: "",
      plano: "",
      vigencia_inicio: ""
    })
    // Limpar também os valores de debounce
    setDebouncedEntidade("")
    setDebouncedPlano("")
    // Limpar queries e listas dinâmicas
    setOperadoraQuery("")
    setAvailablePlanos([])
    setAvailableTiposBeneficiario([])
    setAvailableParcelas([])
    setAvailableEntidades([])
    setPage(1)
  }

  const startEditing = (rowId: string, rowData: RegraData) => {
    setEditingRow(rowId)
    setEditedData(rowData)
    setOriginalData({ ...rowData }) // Guardar cópia dos dados originais
  }

  const cancelEditing = () => {
    setEditingRow(null)
    setEditedData({})
    setOriginalData({})
  }

  const deleteRow = async (id: any) => {
    // Garantir que o ID seja um número válido
    const numericId = Number(id)
    if (!numericId || Number.isNaN(numericId)) {
      console.error("Invalid ID:", id)
      toast({
        title: "Erro",
        description: "ID inválido para exclusão",
        variant: "destructive"
      })
      return
    }
    
    if (!confirm('Tem certeza que deseja excluir esta regra?')) {
      return
    }

    try {
      const response = await fetch(`/api/bonificacoes/regras-idade/${numericId}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        let errorMessage = 'Erro ao excluir regra'
        try {
          const errorData = await response.json()
          errorMessage = errorData.error || errorMessage
        } catch {
          errorMessage = `Erro HTTP ${response.status}: ${response.statusText}`
        }
        throw new Error(errorMessage)
      }

      // Recarregar dados após exclusão
      await fetchData()
      
      toast({
        title: "Sucesso!",
        description: "Regra excluída com sucesso"
      })
    } catch (error) {
      console.error("Erro ao excluir:", error)
      toast({
        title: "Erro",
        description: error instanceof Error ? error.message : "Erro ao excluir regra",
        variant: "destructive"
      })
    }
  }

  const handleCellChange = (key: string, value: any) => {
    setEditedData(prev => ({ ...prev, [key]: value }))
  }

  const saveEditing = async () => {
    if (!editingRow || !editedData.id) {
      console.error("Missing editingRow or id:", { editingRow, id: editedData.id })
      return
    }

    // Campos que não devem ser enviados (são calculados ou não editáveis)
    const excludedFields = ['id', 'chave', 'registro']
    
    // Mapeamento de campos camelCase para snake_case
    const fieldMapping: { [key: string]: string } = {
      'idadeMin': 'idade_min',
      'idadeMax': 'idade_max',
      'tipoBeneficiario': 'tipo_beneficiario',
      'chaveFaixa': 'chave_faixa',
      'pagamentoPor': 'pagamento_por'
    }

    // Campos permitidos na tabela
    const allowedFields = [
      'vigencia',
      'operadora',
      'entidade',
      'plano',
      'tipo_beneficiario',
      'idade_min',
      'idade_max',
      'chave_faixa',
      'produto',
      'pagamento_por',
      'parcela'
    ]

    // Comparar dados editados com originais e normalizar
    const changedFields: { [key: string]: any } = {}
    
    Object.keys(editedData).forEach((key) => {
      // Ignorar campos excluídos
      if (excludedFields.includes(key)) {
        return
      }

      // Mapear campo para nome do banco se necessário
      const dbField = fieldMapping[key] || key

      // Verificar se o campo é permitido
      if (!allowedFields.includes(dbField)) {
        console.warn(`Campo "${key}" ignorado - não permitido no banco`)
        return
      }

      const oldValue = originalData[key] ?? originalData[dbField]
      const newValue = editedData[key]
      
      // Converter para string para comparação segura
      const oldStr = oldValue === null || oldValue === undefined ? '' : String(oldValue)
      const newStr = newValue === null || newValue === undefined ? '' : String(newValue)
      
      // Se os valores são diferentes, adicionar ao objeto de mudanças
      if (oldStr !== newStr) {
        let normalizedValue = newValue
        
        // Normalizar data para YYYY-MM-DD
        if (dbField === 'vigencia' && newValue) {
          try {
            const date = new Date(newValue)
            if (!isNaN(date.getTime())) {
              normalizedValue = formatDateISO(date)
            }
          } catch (e) {
            console.error("Error normalizing date:", e)
          }
        }
        
        // Normalizar campos numéricos de idade
        if ((dbField === 'idade_min' || dbField === 'idade_max') && newValue !== null && newValue !== undefined && newValue !== '') {
          if (typeof newValue === 'string') {
            normalizedValue = Number(newValue.replace(/[^\d]/g, '')) || 0
          } else if (typeof newValue === 'number') {
            normalizedValue = newValue
          }
        }
        
        // Normalizar strings - trim e converter vazio para null
        if (typeof normalizedValue === 'string' && dbField !== 'vigencia') {
          normalizedValue = normalizedValue.trim() || null
        }
        
        // Usar o nome do campo do banco (snake_case)
        changedFields[dbField] = normalizedValue
      }
    })

    // Se não houve mudanças, não fazer nada
    if (Object.keys(changedFields).length === 0) {
      toast({
        title: "Nenhuma alteração",
        description: "Não foram detectadas alterações",
      })
      setEditingRow(null)
      setEditedData({})
      setOriginalData({})
      return
    }

    // Filtrar qualquer undefined que possa ter sido incluído
    const cleanFields: { [key: string]: any } = {}
    Object.entries(changedFields).forEach(([key, value]) => {
      if (value !== undefined) {
        cleanFields[key] = value
      } else {
        console.warn(`Undefined value filtered out for key "${key}"`)
      }
    })
    
    // Adicionar o id no início
    const finalPayload = { id: editedData.id, ...cleanFields }
    
    setLoading(true)
    try {
      const response = await fetch(`/api/bonificacoes/regras-idade/${editedData.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(finalPayload)
      })

      if (!response.ok) {
        let errorMessage = 'Erro ao salvar alterações'
        try {
          const errorData = await response.json()
          console.error("Error response:", errorData)
          errorMessage = errorData.error || errorMessage
        } catch {
          // Se não conseguir parsear o JSON, usar a mensagem padrão
          errorMessage = `Erro HTTP ${response.status}: ${response.statusText}`
        }
        throw new Error(errorMessage)
      }

      const result = await response.json()

      toast({
        title: "Sucesso",
        description: "Regra atualizada com sucesso",
      })

      setEditingRow(null)
      setEditedData({})
      setOriginalData({})
      
      // Recarregar dados
      await fetchData()
    } catch (error) {
      console.error("Error saving data:", error)
      toast({
        title: "Erro",
        description: error instanceof Error ? error.message : "Não foi possível salvar as alterações",
        variant: "destructive",
      })
      setLoading(false)
    }
  }

  // Função helper para formatar valores monetários em Real brasileiro
  const formatCurrency = (value: any): string => {
    if (value === null || value === undefined || value === '') return ''
    
    let numValue: number
    
    if (typeof value === 'number') {
      numValue = value
    } else if (typeof value === 'string') {
      // Remove espaços e símbolos de moeda
      let cleaned = value.trim().replace(/R\$\s*/gi, '').replace(/\s/g, '')
      
      // Se tem vírgula, assume formato brasileiro (X.XXX,XX ou XXX,XX)
      // SEMPRE remove pontos quando há vírgula (são separadores de milhar)
      if (cleaned.includes(',')) {
        // Remove todos os pontos antes de converter vírgula para ponto decimal
        cleaned = cleaned.replace(/\./g, '').replace(',', '.')
      } else if (cleaned.includes('.')) {
        // Se só tem ponto, verifica se é separador decimal ou milhar
        const parts = cleaned.split('.')
        if (parts.length > 2) {
          // Múltiplos pontos = separadores de milhar, remove todos
          cleaned = cleaned.replace(/\./g, '')
        } else if (parts.length === 2 && parts[1].length > 2) {
          // Um ponto mas mais de 2 dígitos após = separador de milhar
          cleaned = cleaned.replace(/\./g, '')
        }
        // Caso contrário, mantém o ponto como decimal
      }
      
      numValue = parseFloat(cleaned)
    } else {
      numValue = Number(value)
    }
    
    if (isNaN(numValue)) return String(value || '')
    
    // Formatar como Real brasileiro: R$ X.XXX,XX
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(numValue)
  }

  const exportToCSV = () => {
    if (data.length === 0) return

    // Obter todas as colunas dinamicamente, exceto 'id' e 'chave'
    const columns = Object.keys(data[0]).filter(col => col !== 'id' && col !== 'chave')
    
    // Criar headers com nomes formatados
    const headers = columns.map(col => 
      col.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
    )

    // Criar linhas de dados
    const csvData = [
      headers.join(","),
      ...data.map(row => 
        columns.map(col => {
          const value = row[col]
          // Formatar valores especiais
          if (col === 'vigencia' && value) return formatDateBR(value as any)
          if (typeof value === 'number' && (col.includes('idade') || col.includes('idade_min') || col.includes('idade_max'))) {
            return String(value)
          }
          // Escapar vírgulas em strings
          if (typeof value === 'string' && value.includes(',')) {
            return `"${value}"`
          }
          return value || ''
        }).join(",")
      )
    ].join("\n")

    const blob = new Blob([csvData], { type: "text/csv;charset=utf-8;" })
    const link = document.createElement("a")
    const url = URL.createObjectURL(blob)
    link.setAttribute("href", url)
    link.setAttribute("download", `regras_idade_${formatDateISO(new Date())}.csv`)
    link.style.visibility = "hidden"
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  return (
    <>
      {(loading || optionsLoading) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/60 backdrop-blur-sm">
          <div className="flex items-center gap-3 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin" />
            <span>Carregando...</span>
          </div>
        </div>
      )}
      {/* Box Principal - Painel de Gerenciamento */}
      <Card className="border shadow-sm bg-white">
        <CardHeader>
        <CardTitle className="text-xl">{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Box de Filtros */}
          <Card className="border shadow-sm" style={{ backgroundColor: 'var(--filter-box-bg)' }}>
        <CardHeader>
          <CardTitle>Filtros</CardTitle>
          <CardDescription>Filtre as regras de bonificação por critérios específicos</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
        {/* Grid de Filtros */}
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {/* Operadora (autocomplete) */}
          <div className="space-y-2">
            <Label htmlFor="operadora">Operadora</Label>
            <div className="relative">
              <Input
                id="operadora"
                placeholder="Digite para buscar"
                value={filters.operadora || operadoraQuery}
                onFocus={() => setOperadoraFocused(true)}
                onBlur={() => setTimeout(() => setOperadoraFocused(false), 150)}
                onChange={(e) => {
                  setOperadoraQuery(e.target.value)
                }}
                className="bg-white"
              />
              {(filters.operadora || operadoraQuery) && (
                <button
                  type="button"
                  aria-label="Limpar operadora"
                  onClick={() => {
                    setOperadoraQuery("")
                    handleFilterChange("operadora", "")
                    setOperadoraFocused(true)
                  }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
              {operadoraFocused && operadoraSuggestions.length > 0 && (
                <div className="absolute z-10 mt-1 w-full max-h-56 overflow-auto rounded-md border bg-white text-popover-foreground shadow" style={{ background: '#ffffff' }}>
                  {operadoraSuggestions.map(op => (
                    <button
                      key={op}
                      type="button"
                      onClick={() => {
                        handleFilterChange("operadora", op)
                        setOperadoraQuery(op)
                        setOperadoraFocused(false)
                      }}
                      className="block w-full text-left px-3 py-2 hover:bg-gray-100 hover:text-foreground"
                      style={{ 
                        backgroundColor: 'transparent',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = '#f5f5f5'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = 'transparent'
                      }}
                    >
                      {op}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Tipo de Beneficiário - dinâmico */}
          <div className="space-y-2">
            <Label htmlFor="tipo_beneficiario">Tipo de Beneficiário</Label>
            <div className="relative">
              <Select key={`tipo_beneficiario-${filters.tipo_beneficiario}`} value={filters.tipo_beneficiario || undefined} onValueChange={(v) => handleFilterChange("tipo_beneficiario", v)} disabled={!filters.operadora || availableTiposBeneficiario.length <= 1}>
                <SelectTrigger id="tipo_beneficiario" className="bg-white">
                  <SelectValue placeholder={availableTiposBeneficiario.length ? "Todos" : (filters.operadora ? "Sem opções" : "Todos")} />
                </SelectTrigger>
                <SelectContent>
                  {(availableTiposBeneficiario.length ? availableTiposBeneficiario : [...TIPO_BENEFICIARIO].sort((a, b) => normalize(b).localeCompare(normalize(a)))).map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {filters.tipo_beneficiario && filters.operadora && availableTiposBeneficiario.length > 1 && (
                <button
                  onClick={() => handleFilterChange("tipo_beneficiario", "")}
                  className="absolute right-8 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>

          {/* Parcela - dinâmica (mapeada para chave_faixa) */}
          <div className="space-y-2">
            <Label htmlFor="parcela">Chave Faixa</Label>
            <div className="relative">
              <Select key={`parcela-${filters.parcela}`} value={filters.parcela || undefined} onValueChange={(v) => handleFilterChange("parcela", v)} disabled={!filters.operadora || availableParcelas.length <= 1}>
                <SelectTrigger id="parcela" className="bg-white">
                  <SelectValue placeholder={availableParcelas.length ? "Todas" : (filters.operadora ? "Sem opções" : "Todas")} />
                </SelectTrigger>
                <SelectContent>
                  {availableParcelas.map((p) => (
                    <SelectItem key={p} value={p}>{p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {filters.parcela && filters.operadora && availableParcelas.length > 1 && (
                <button
                  onClick={() => handleFilterChange("parcela", "")}
                  className="absolute right-8 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>

          {/* Entidade - lista quando operadora selecionada */}
          <div className="space-y-2">
            <Label htmlFor="entidade">Entidade</Label>
            {filters.operadora ? (
              <div className="relative">
                <Select key={`entidade-${filters.entidade}`} value={filters.entidade || undefined} onValueChange={(v) => handleFilterChange("entidade", v)} disabled={availableEntidades.length <= 1}>
                  <SelectTrigger id="entidade" className="bg-white">
                    <SelectValue placeholder={availableEntidades.length ? "Todas" : "Sem entidades"} />
                  </SelectTrigger>
                  <SelectContent>
                    {availableEntidades.map((e) => (
                      <SelectItem key={e} value={e}>{e}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {filters.entidade && availableEntidades.length > 1 && (
                  <button
                    onClick={() => handleFilterChange("entidade", "")}
                    className="absolute right-8 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            ) : (
              <Input
                id="entidade"
                placeholder="Buscar entidade..."
                value={filters.entidade}
                onChange={(e) => handleFilterChange("entidade", e.target.value)}
                className="bg-white"
              />
            )}
          </div>

          {/* Plano - lista quando operadora selecionada */}
          <div className="space-y-2">
            <Label htmlFor="plano">Plano</Label>
            {filters.operadora ? (
              <div className="relative">
                <Select key={`plano-${filters.plano}`} value={filters.plano || undefined} onValueChange={(v) => handleFilterChange("plano", v)} disabled={availablePlanos.length <= 1}>
                  <SelectTrigger id="plano" className="bg-white">
                    <SelectValue placeholder={availablePlanos.length ? "Todos" : "Sem planos"} />
                  </SelectTrigger>
                  <SelectContent>
                    {availablePlanos.map((p) => (
                      <SelectItem key={p} value={p}>{p}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {filters.plano && availablePlanos.length > 1 && (
                  <button
                    onClick={() => handleFilterChange("plano", "")}
                    className="absolute right-8 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            ) : (
              <Input
                id="plano"
                placeholder="Buscar plano..."
                value={filters.plano}
                onChange={(e) => handleFilterChange("plano", e.target.value)}
                className="bg-white"
              />
            )}
          </div>

          {/* Vigência */}
          <div className="space-y-2">
            <Label htmlFor="vigencia_inicio">Data de Vigência</Label>
            <Input
              id="vigencia_inicio"
              type="date"
              value={filters.vigencia_inicio || ""}
              onChange={(e) => handleFilterChange("vigencia_inicio", e.target.value)}
              className="bg-white"
              placeholder="Selecione a data"
            />
          </div>

        </div>

        {/* Botões de Ação */}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={clearFilters}>
            Limpar
          </Button>
          <Button onClick={exportToCSV} disabled={data.length === 0}>
            <Download className="h-4 w-4 mr-2" />
            Exportar CSV
          </Button>
        </div>
        </CardContent>
      </Card>

      {/* Tabela */}
      <div className="border rounded-md overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[50px]">Status</TableHead>
              {data.length > 0 && Object.keys(data[0]).filter(col => col !== 'id' && col !== 'chave').map((column) => (
                <TableHead key={column}>
                  {column.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                </TableHead>
              ))}
              {!readOnly && <TableHead className="w-[80px]">Ações</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={data.length > 0 ? Object.keys(data[0]).filter(col => col !== 'id' && col !== 'chave').length + (readOnly ? 0 : 1) + 1 : 1} className="text-center py-8">
                  <Search className="h-8 w-8 mx-auto animate-spin text-muted-foreground" />
                  <p className="mt-2 text-muted-foreground">Carregando...</p>
                </TableCell>
              </TableRow>
            ) : data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={data.length > 0 ? Object.keys(data[0]).filter(col => col !== 'id' && col !== 'chave').length + (readOnly ? 0 : 1) + 1 : 13} className="text-center py-8 text-muted-foreground">
                  {filters.operadora || filters.tipo_beneficiario || filters.parcela || filters.entidade || filters.plano || filters.vigencia_inicio ? (
                    <div className="space-y-2">
                      <p className="font-medium">Nenhum resultado encontrado</p>
                      <p className="text-sm">Tente ajustar os filtros ou limpar todos os filtros para ver todos os registros.</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <p className="font-medium">Nenhum resultado encontrado</p>
                      <p className="text-sm">Não há regras de bonificação cadastradas no banco de dados.</p>
                    </div>
                  )}
                </TableCell>
              </TableRow>
            ) : (
              data.map((row, idx) => {
                const rowId = row.id?.toString() || idx.toString()
                const isEditing = !readOnly && (editingRow === rowId)
                
                const isActive = row.id ? activeRules.has(String(row.id)) : false
                
                return (
                  <TableRow key={rowId}>
                    {/* Coluna Status (KPI) */}
                    <TableCell className="text-center">
                      {!kpiLoaded ? (
                        <div title="Carregando status...">
                          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                        </div>
                      ) : (
                        <div title={isActive ? 'Ativa' : 'Inativa'} data-kpi-status={isActive ? 'active' : 'inactive'}>
                          <Circle 
                            className={`h-4 w-4 ${isActive ? 'text-green-500 fill-green-500' : 'text-gray-400 fill-gray-400'}`}
                          />
                        </div>
                      )}
                    </TableCell>
                    {Object.entries(row).filter(([key]) => key !== 'id' && key !== 'chave').map(([key, value]) => (
                      <TableCell key={key}>
                        {isEditing ? (
                          key === 'vigencia' ? (
                            <Input
                                  type="date"
                                  value={editedData[key] ? formatDateISO(editedData[key]) : ''}
                                  onChange={(e) => {
                                    const value = e.target.value
                                    handleCellChange(key, value || '')
                                  }}
                                  className="w-32"
                                />
                              ) : (key === 'idade_min' || key === 'idadeMin' || key === 'idade_max' || key === 'idadeMax') ? (
                                <Input
                                  type="number"
                                  step="1"
                                  min="0"
                                  max="150"
                                  value={editedData[key] !== undefined ? editedData[key] : (value !== null && value !== undefined ? value : 0)}
                                  onChange={(e) => {
                                    const numValue = e.target.value === '' ? 0 : Number(e.target.value)
                                    handleCellChange(key, isNaN(numValue) ? 0 : numValue)
                                  }}
                                  className="w-24"
                                />
                              ) : key === 'operadora' ? (
                                <Select 
                                  value={editedData[key] || value} 
                                  onValueChange={(v) => handleCellChange(key, v)}
                                >
                                  <SelectTrigger className="w-40">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {OPERADORAS.map((op) => (
                                      <SelectItem key={op} value={op}>{op}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              ) : key === 'chave_faixa' || key === 'chaveFaixa' ? (
                                <Input
                                  value={editedData[key] || value || ""}
                                  onChange={(e) => handleCellChange(key, e.target.value)}
                                  className="w-32"
                                  placeholder="Ex: Faixa 01"
                                />
                              ) : key === 'produto' ? (
                                <Select 
                                  value={editedData[key] || value} 
                                  onValueChange={(v) => handleCellChange(key, v)}
                                >
                                  <SelectTrigger className="w-32">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {PRODUTOS.map((p) => (
                                      <SelectItem key={p} value={p}>{p}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              ) : key === 'pagamento_por' ? (
                                <Select 
                                  value={editedData[key] || value} 
                                  onValueChange={(v) => handleCellChange(key, v)}
                                >
                                  <SelectTrigger className="w-32">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {PAGAMENTO_POR.map((p) => (
                                      <SelectItem key={p} value={p}>{p}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              ) : key === 'tipo_beneficiario' ? (
                                <Select 
                                  value={editedData[key] || value} 
                                  onValueChange={(v) => handleCellChange(key, v)}
                                >
                                  <SelectTrigger className="w-32">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {[...TIPO_BENEFICIARIO].sort((a, b) => normalize(b).localeCompare(normalize(a))).map((t) => (
                                      <SelectItem key={t} value={t}>{t}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              ) : key === 'parcela' ? (
                                <Select 
                                  value={editedData[key] || value} 
                                  onValueChange={(v) => handleCellChange(key, v)}
                                >
                                  <SelectTrigger className="w-32">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {PARCELAS.map((p) => (
                                      <SelectItem key={p} value={p}>{p}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              ) : (
                                <Input
                                  value={editedData[key] || value}
                                  onChange={(e) => handleCellChange(key, e.target.value)}
                                  className="min-w-[150px]"
                                />
                              )
                            ) : (
                              <>
                                {(key === 'vigencia' || key === 'registro') && value ?
                                  formatDateBR(value as any) : 
                                  (key === 'idade_min' || key === 'idadeMin' || key === 'idade_max' || key === 'idadeMax') ? 
                                    (value !== null && value !== undefined ? String(value) : '') : 
                                    String(value || '')
                                }
                              </>
                            )}
                          </TableCell>
                        ))}
                    {!readOnly && (
                      <TableCell>
                        {!isEditing ? (
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => startEditing(rowId, row)}
                              className="h-8 w-8 p-0"
                              title="Editar"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => deleteRow(row.id)}
                              className="h-8 w-8 p-0 text-red-600 hover:text-red-700"
                              title="Excluir"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        ) : (
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={saveEditing}
                              className="h-8 w-8 p-0 text-green-600 hover:text-green-700"
                              title="Salvar"
                            >
                              <Check className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={cancelEditing}
                              className="h-8 w-8 p-0 text-red-600 hover:text-red-700"
                              title="Cancelar"
                            >
                              <XCircle className="h-4 w-4" />
                            </Button>
                          </div>
                        )}
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
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          Mostrando {data.length > 0 ? (page - 1) * pageSize + 1 : 0} a {Math.min(page * pageSize, total)} de {total} resultados
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
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              let pageNum;
              if (totalPages <= 5) {
                pageNum = i + 1;
              } else if (page <= 3) {
                pageNum = i + 1;
              } else if (page >= totalPages - 2) {
                pageNum = totalPages - 4 + i;
              } else {
                pageNum = page - 2 + i;
              }
              return (
                <Button
                  key={pageNum}
                  variant={page === pageNum ? "default" : "outline"}
                  size="sm"
                  onClick={() => setPage(pageNum)}
                  disabled={loading}
                >
                  {pageNum}
                </Button>
              );
            })}
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
        </CardContent>
      </Card>
    </>
  )
}
