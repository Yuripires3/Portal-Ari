"use client"

import { useEffect, useState, useCallback, useMemo, useRef, type KeyboardEvent } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { useToast } from "@/hooks/use-toast"
import { 
  DollarSign, 
  Users, 
  TrendingUp, 
  TrendingDown,
  Activity,
  Filter,
  RefreshCw,
  X
} from "lucide-react"
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  ComposedChart,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  LabelList
} from "recharts"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { formatDateISO } from "@/lib/date-utils"
import { useDashboardFilters, type DashboardPapel, type DashboardFiltersState } from "@/lib/dashboard-filters-store"

// Cores QV (paleta conforme especificado)
const COLORS_QV = {
  azulEscuro: "#002f67",
  azulClaro: "#184286",
  azulTabelaHeader: "#333b5f", // Cor do cabeçalho das tabelas
  laranja: "#f58220",
  verde: "#00a2a5"
}

// Cores específicas por operadora
const CORES_OPERADORAS: Record<string, string> = {
  "ASSIM SAÚDE": "#118DFF",
  "ASSIM SAUDE": "#118DFF", // variação sem acento
  "NOVA SAÚDE": "#D9B300",
  "NOVA SAUDE": "#D9B300", // variação sem acento
  "HAPVIDA NOTREDAME": "#E66C37",
  "HAPVIDA NOTRE DAME": "#E66C37", // variação com espaço
  "ONIX": "#808080",
  "OPLAN": "#C7D9F8",
  "HEALTH MED": "#7AA479",
  "HEALTHMED": "#7AA479" // variação sem espaço
}

// Função para normalizar nome da operadora (remove acentos, espaços extras, etc)
const normalizarNomeOperadora = (nome: string): string => {
  return nome
    .toUpperCase()
    .trim()
    .replace(/\s+/g, ' ') // múltiplos espaços vira um espaço
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove acentos
}

// Função para obter cor da operadora ou cor padrão
const getCorOperadora = (operadora: string, index: number): string => {
  if (!operadora) return "#002f67"
  
  const nomeOriginal = operadora.trim()
  const nomeNormalizado = normalizarNomeOperadora(nomeOriginal)
  
  // Tentar match exato primeiro (com e sem acento)
  if (CORES_OPERADORAS[nomeNormalizado]) {
    return CORES_OPERADORAS[nomeNormalizado]
  }
  
  // Tentar match parcial - verificar se o nome normalizado contém alguma das chaves
  const keysNormalizadas = Object.keys(CORES_OPERADORAS).map(k => normalizarNomeOperadora(k))
  
  for (let i = 0; i < keysNormalizadas.length; i++) {
    const keyNormalizada = keysNormalizadas[i]
    // Se o nome normalizado contém a chave normalizada ou vice-versa
    if (nomeNormalizado.includes(keyNormalizada) || keyNormalizada.includes(nomeNormalizado)) {
      const keyOriginal = Object.keys(CORES_OPERADORAS)[i]
      return CORES_OPERADORAS[keyOriginal]
    }
  }
  
  // Match por palavras-chave (caso o nome tenha partes conhecidas)
  if (nomeNormalizado.includes("ASSIM")) return "#118DFF"
  if (nomeNormalizado.includes("NOVA SAUDE")) return "#D9B300"
  if (nomeNormalizado.includes("HAPVIDA")) return "#E66C37"
  if (nomeNormalizado.includes("ONIX")) return "#808080"
  if (nomeNormalizado.includes("OPLAN")) return "#C7D9F8"
  if (nomeNormalizado.includes("HEALTH")) return "#7AA479"
  
  // Se não encontrar, usar cor padrão
  return "#002f67"
}

const normalizeTexto = (valor: string) => normalizarNomeOperadora(valor).toLowerCase()

const fetchNoStore = (input: string, init?: RequestInit) =>
  fetch(input, { ...init, cache: "no-store" })

const isDashboardPapel = (value: string | null): value is DashboardPapel =>
  value === "geral" || value === "corretores" || value === "supervisores"

// Tipos
type Kpis = {
  comissoesMes: number
  variacaoMesPercent: number
  parceirosAtivos: number
  vidasFaturadas: number
  vidasPagas: number
  ticketMedio: number
  comissoesCorretores?: number
  comissoesSupervisores?: number
  descontoTotal?: number
  pagamentosBruto?: number
}

type SerieMensal = { mes: string; valor: number; bruto?: number; descontos?: number }
type ItemRank = { nome: string; papel?: string; valor: number; valorBruto?: number; desconto?: number; vidas?: number; ticket?: number }
type DistribuicaoOperadora = { operadora: string; valor: number; percentual: number }
type StatusMensal = { mes: string; status: string; valor: number }
type ImpactoDescontos = { mes: string; valorDesconto: number; valorProducao: number; percentualDesconto: number }
type EvolucaoDescontos = { 
  mes: string; 
  descontosRealizados: number; 
  cancelamentos: number; 
  saldoBanco?: number;
  cancelamentosDetalhes?: Array<{ valor: number; data: string }>
}

export default function DashboardContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { toast } = useToast()

  const searchParamsString = searchParams.toString()
  const initialFiltersFromUrl = useMemo<Partial<DashboardFiltersState>>(() => {
    if (!searchParamsString) return {}
    const params = new URLSearchParams(searchParamsString)
    const entidadesParam = params.get("entidade")
    const papelParam = params.get("papel")
    const papel = isDashboardPapel(papelParam) ? papelParam : undefined

    return {
      dataInicio: params.get("inicio") || undefined,
      dataFim: params.get("fim") || undefined,
      operadora: params.get("operadora") || undefined,
      entidades: entidadesParam ? entidadesParam.split(",").map((ent) => ent.trim()).filter(Boolean) : undefined,
      papel,
    }
  }, [searchParamsString])

  const { filters, updateFilters, resetFilters } = useDashboardFilters(initialFiltersFromUrl)
  const { dataInicio, dataFim, operadora, entidades, papel } = filters

  const [operadoraQuery, setOperadoraQuery] = useState(operadora)
  useEffect(() => {
    setOperadoraQuery(operadora)
  }, [operadora])

  const [operadoraFocused, setOperadoraFocused] = useState(false)
  const [entidadeSelectKey, setEntidadeSelectKey] = useState(0)

  // Estados de dados
  const [kpis, setKpis] = useState<Kpis | null>(null)
  const [evolucao, setEvolucao] = useState<SerieMensal[]>([])
  const [topCorretores, setTopCorretores] = useState<ItemRank[]>([])
  const [topSupervisores, setTopSupervisores] = useState<ItemRank[]>([])
  const [porEntidade, setPorEntidade] = useState<ItemRank[]>([])
  const [porOperadora, setPorOperadora] = useState<DistribuicaoOperadora[]>([])
  const [statusMensal, setStatusMensal] = useState<StatusMensal[]>([])
  const [impactoDescontos, setImpactoDescontos] = useState<ImpactoDescontos[]>([])
  const [evolucaoDescontos, setEvolucaoDescontos] = useState<EvolucaoDescontos[]>([])

  // Estados de filtros disponíveis
  const [operadorasDisponiveis, setOperadorasDisponiveis] = useState<string[]>([])
  const [entidadesDisponiveis, setEntidadesDisponiveis] = useState<string[]>([])
  const [entidadesPorOperadora, setEntidadesPorOperadora] = useState<Record<string, string[]>>({})

  // Estados de loading
  const [loading, setLoading] = useState(false)
  const [loadingFiltros, setLoadingFiltros] = useState(true)

  // Formatação
  const fmtBRL = (v: number) => 
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v)

  const fmtNumber = (v: number) => 
    new Intl.NumberFormat("pt-BR").format(v)

  const fmtMes = (mes: string) => {
    const [ano, mesNum] = mes.split("-")
    const date = new Date(parseInt(ano), parseInt(mesNum) - 1, 1)
    return date.toLocaleDateString("pt-BR", { month: "short", year: "numeric" })
  }

  const operadoraInputValue = operadora || operadoraQuery

  const operadoraSuggestions = useMemo(() => {
    if (!operadorasDisponiveis.length) return [] as string[]

    if (!operadoraQuery.trim()) {
      return operadorasDisponiveis
    }

    const termo = normalizeTexto(operadoraQuery)
    return operadorasDisponiveis.filter(op => normalizeTexto(op).includes(termo))
  }, [operadoraQuery, operadorasDisponiveis])

  const entidadesBase = useMemo(() => {
    if (operadora && entidadesPorOperadora[operadora]) {
      return entidadesPorOperadora[operadora]
    }
    return entidadesDisponiveis
  }, [operadora, entidadesDisponiveis, entidadesPorOperadora])

  const entidadesDisponiveisParaSelecao = useMemo(() => {
    return entidadesBase.filter(ent => !entidades.includes(ent))
  }, [entidadesBase, entidades])

  // Carregar filtros disponíveis
  useEffect(() => {
    const loadFiltros = async () => {
      try {
        const res = await fetchNoStore("/api/dashboard/filtros")
        if (!res.ok) throw new Error("Erro ao carregar filtros")
        const data = await res.json()
        setOperadorasDisponiveis(data.operadoras || [])
        setEntidadesDisponiveis(data.entidades || [])
        setEntidadesPorOperadora(data.entidadesPorOperadora || {})
      } catch (error: any) {
        console.error("Erro ao carregar filtros:", error)
        toast({
          title: "Erro",
          description: "Não foi possível carregar filtros",
          variant: "destructive"
        })
      } finally {
        setLoadingFiltros(false)
      }
    }
    loadFiltros()
  }, [toast])

  useEffect(() => {
    if (loadingFiltros) return

    if (operadora && !operadorasDisponiveis.includes(operadora)) {
      setOperadoraQuery("")
      updateFilters({ operadora: "", entidades: [] })
      setEntidadeSelectKey(prev => prev + 1)
    }
  }, [loadingFiltros, operadora, operadorasDisponiveis, updateFilters])

  // Referência para permitir apenas um carregamento automático inicial (quando URL já vem preenchida)
  const allowInitialLoadRef = useRef(Boolean(initialFiltersFromUrl.dataInicio && initialFiltersFromUrl.dataFim))

  // Carrega todos os dados do dashboard; única função que dispara chamadas /api/dashboard/*
  const loadDashboard = useCallback(async () => {
    if (!dataInicio || !dataFim) return

    setLoading(true)
    try {
      const params = new URLSearchParams({
        inicio: dataInicio,
        fim: dataFim,
        papel: papel
      })
      if (operadora) params.append("operadora", operadora)
      if (entidades.length > 0) params.append("entidade", entidades.join(","))

      // Verificar se o range é maior que 12 meses (calcular diretamente)
      const dataInicioDate = new Date(dataInicio)
      const dataFimDate = new Date(dataFim)
      const diffTime = dataFimDate.getTime() - dataInicioDate.getTime()
      const diffMonths = diffTime / (1000 * 60 * 60 * 24 * 30.44) // Média de dias por mês
      const rangeGreaterThan12Months = diffMonths > 12

      // Carregar todos os dados em paralelo
      // As tabelas de top 10 sempre mostram corretores e supervisores separados (ignoram filtro de papel)
      const paramsTopFixos = new URLSearchParams(params)
      paramsTopFixos.delete('papel') // Remove papel para top tables - sempre mostram ambos separados
      paramsTopFixos.set('limit', '10') // Garantir que sempre retorne 10 itens
      
      // Se range > 12 meses, não carregar os 3 gráficos específicos aqui (serão carregados depois)
      const promises = [
        fetchNoStore(`/api/dashboard/kpis?${params}`),
        fetchNoStore(`/api/dashboard/top-corretores?${paramsTopFixos}`),
        fetchNoStore(`/api/dashboard/top-supervisores?${paramsTopFixos}`),
        fetchNoStore(`/api/dashboard/por-entidade?${params}`),
        fetchNoStore(`/api/dashboard/por-operadora?${params}`),
        fetchNoStore(`/api/dashboard/status-mensal?${params}`)
      ]

      if (!rangeGreaterThan12Months) {
        // Se range <= 12 meses, carregar todos os gráficos normalmente
        promises.push(
          fetchNoStore(`/api/dashboard/evolucao?${params}`),
          fetchNoStore(`/api/dashboard/impacto-descontos?${params}`),
          fetchNoStore(`/api/dashboard/evolucao-descontos?${params}`)
        )
      }

      const results = await Promise.all(promises)

      if (!results[0].ok) throw new Error("Erro ao carregar KPIs")
      if (!results[1].ok) throw new Error("Erro ao carregar top corretores")
      if (!results[2].ok) throw new Error("Erro ao carregar top supervisores")
      if (!results[3].ok) throw new Error("Erro ao carregar por entidade")
      if (!results[4].ok) throw new Error("Erro ao carregar por operadora")
      if (!results[5].ok) throw new Error("Erro ao carregar status mensal")

      const [kpisData, topCorretoresData, topSupervisoresData, porEntidadeData, porOperadoraData, statusMensalData, evolucaoData, impactoData, evolucaoDescontosData] = await Promise.all([
        results[0].json(),
        results[1].json(),
        results[2].json(),
        results[3].json(),
        results[4].json(),
        results[5].json(),
        !rangeGreaterThan12Months ? results[6].json() : Promise.resolve([]),
        !rangeGreaterThan12Months ? results[7].json() : Promise.resolve([]),
        !rangeGreaterThan12Months ? results[8].json() : Promise.resolve([])
      ])

      setKpis(kpisData)
      setTopCorretores(topCorretoresData)
      setTopSupervisores(topSupervisoresData)
      setPorEntidade(porEntidadeData)
      setPorOperadora(porOperadoraData)
      setStatusMensal(statusMensalData)
      
      if (!rangeGreaterThan12Months) {
        setEvolucao(evolucaoData)
        setImpactoDescontos(impactoData)
        setEvolucaoDescontos(evolucaoDescontosData)
      } else {
        // Se range > 12 meses, carregar os gráficos específicos imediatamente após carregar o dashboard
        // Usar setTimeout para garantir que o estado foi atualizado
        setTimeout(async () => {
          try {
            const chartParams = new URLSearchParams({
              inicio: dataInicio,
              fim: dataFim,
              papel: papel
            })
            if (operadora) chartParams.append("operadora", operadora)
            if (entidades.length > 0) chartParams.append("entidade", entidades.join(","))

            const [evolucaoRes, impactoRes, evolucaoDescontosRes] = await Promise.all([
              fetchNoStore(`/api/dashboard/evolucao?${chartParams}`),
              fetchNoStore(`/api/dashboard/impacto-descontos?${chartParams}`),
              fetchNoStore(`/api/dashboard/evolucao-descontos?${chartParams}`)
            ])

            if (!evolucaoRes.ok) throw new Error("Erro ao carregar evolução")
            if (!impactoRes.ok) throw new Error("Erro ao carregar impacto de descontos")
            if (!evolucaoDescontosRes.ok) throw new Error("Erro ao carregar evolução de descontos")

            const [evolucaoData, impactoData, evolucaoDescontosData] = await Promise.all([
              evolucaoRes.json(),
              impactoRes.json(),
              evolucaoDescontosRes.json()
            ])

            setEvolucao(evolucaoData)
            setImpactoDescontos(impactoData)
            setEvolucaoDescontos(evolucaoDescontosData)
          } catch (error: any) {
            console.error("Erro ao carregar gráficos específicos:", error)
            toast({
              title: "Erro",
              description: error.message || "Não foi possível atualizar os gráficos",
              variant: "destructive"
            })
          }
        }, 100)
      }
    } catch (error: any) {
      console.error("Erro ao carregar dashboard:", error)
      // Garantir que os estados sejam arrays vazios em caso de erro
      setTopCorretores([])
      setTopSupervisores([])
      toast({
        title: "Erro",
        description: error.message || "Não foi possível carregar dados do dashboard",
        variant: "destructive"
      })
    } finally {
      setLoading(false)
    }
  }, [dataInicio, dataFim, operadora, entidades, papel, toast])

  // Dispara apenas um carregamento inicial se os filtros já vierem na URL; não reage após interações do usuário
  useEffect(() => {
    if (!allowInitialLoadRef.current) return
    if (!dataInicio || !dataFim) return
    allowInitialLoadRef.current = false
    loadDashboard()
  }, [dataInicio, dataFim, loadDashboard])

  // Atualizar URL quando papel mudar
  const buildCanonicalQueryString = (pairs: Array<[string, string]>) =>
    pairs
      .filter(([, value]) => value !== undefined && value !== null && value !== "")
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
      .join("&")

  useEffect(() => {
    const nextPairs: Array<[string, string]> = []
    if (dataInicio) nextPairs.push(["inicio", dataInicio])
    if (dataFim) nextPairs.push(["fim", dataFim])
    if (operadora) nextPairs.push(["operadora", operadora])
    if (entidades.length > 0) nextPairs.push(["entidade", entidades.join(",")])
    if (papel) nextPairs.push(["papel", papel])

    const currentPairs: Array<[string, string]> = []
    searchParams.forEach((value, key) => {
      if (value !== null) {
        currentPairs.push([key, value])
      }
    })

    const newQuery = buildCanonicalQueryString(nextPairs)
    const currentQuery = buildCanonicalQueryString(currentPairs)

    if (newQuery === currentQuery) {
      return
    }

    const nextUrl = newQuery ? `/admin?${newQuery}` : "/admin"
    router.replace(nextUrl, { scroll: false })
  }, [dataInicio, dataFim, operadora, entidades, papel, router, searchParams])

  useEffect(() => {
    if (loadingFiltros) return
    if (!entidades.length) return

    const entidadesValidas = new Set(entidadesBase)
    const filtradas = entidades.filter(ent => entidadesValidas.has(ent))

    if (filtradas.length === entidades.length && filtradas.every((valor, index) => valor === entidades[index])) {
      return
    }

    updateFilters({ entidades: filtradas })
  }, [entidadesBase, entidades, loadingFiltros, updateFilters])


  // Toggle entidade no filtro
  const toggleEntidade = useCallback((entidade: string) => {
    const jaExiste = entidades.includes(entidade)
    const next = jaExiste
      ? entidades.filter(e => e !== entidade)
      : [...entidades, entidade]
    updateFilters({ entidades: next })
  }, [entidades, updateFilters])

  const handlePapelChange = useCallback((nextPapel: DashboardPapel) => {
    updateFilters({ papel: nextPapel })
  }, [updateFilters])

  const handleOperadoraInputChange = useCallback((value: string) => {
    setOperadoraQuery(value)

    const trimmed = value.trim()
    if (!trimmed) {
      if (operadora) {
        updateFilters({ operadora: "", entidades: [] })
        setEntidadeSelectKey(prev => prev + 1)
      }
      return
    }

    if (operadora) {
      updateFilters({ operadora: "", entidades: [] })
      setEntidadeSelectKey(prev => prev + 1)
    }
  }, [operadora, updateFilters])

  const handleSelectOperadora = useCallback((valor: string) => {
    updateFilters({ operadora: valor, entidades: [] })
    setOperadoraQuery(valor)
    setEntidadeSelectKey(prev => prev + 1)
    setOperadoraFocused(false)
  }, [updateFilters])

  const handleOperadoraKeyDown = useCallback((event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" && operadoraSuggestions.length > 0) {
      event.preventDefault()
      handleSelectOperadora(operadoraSuggestions[0])
      setOperadoraFocused(false)
    }
  }, [handleSelectOperadora, operadoraSuggestions])

  const clearFilters = useCallback(() => {
    resetFilters()
    setOperadoraQuery("")
    setOperadoraFocused(false)
    setEntidadeSelectKey(prev => prev + 1)
  }, [resetFilters])


  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-balance">Dashboard de Bonificações</h1>
        <p className="text-muted-foreground mt-1">Visão geral executiva e operacional</p>
      </div>

      {/* Filtros Globais */}
      <Card className="bg-white rounded-2xl shadow-sm border-zinc-200/70">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Filtros
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-2">
              <Label htmlFor="data-inicio">Data Início</Label>
              <Input
                id="data-inicio"
                type="date"
                value={dataInicio}
                onChange={(e) => updateFilters({ dataInicio: e.target.value })}
                className="w-full"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="data-fim">Data Fim</Label>
              <Input
                id="data-fim"
                type="date"
                value={dataFim}
                onChange={(e) => updateFilters({ dataFim: e.target.value })}
                className="w-full"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="operadora">Operadora</Label>
              <div className="relative">
                <Input
                  id="operadora"
                  placeholder="Digite para buscar"
                  value={operadoraInputValue}
                  onFocus={() => setOperadoraFocused(true)}
                  onBlur={() => setTimeout(() => setOperadoraFocused(false), 150)}
                  onChange={(e) => handleOperadoraInputChange(e.target.value)}
                  onKeyDown={handleOperadoraKeyDown}
                  autoComplete="off"
                  className="bg-white"
                />
                {operadoraInputValue && (
                  <button
                    type="button"
                    aria-label="Limpar operadora"
                    onClick={() => {
                      handleOperadoraInputChange("")
                      setOperadoraFocused(true)
                    }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
                {operadoraFocused && operadoraSuggestions.length > 0 && (
                  <div className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-md border bg-white shadow">
                    {operadoraSuggestions.map((op) => (
                      <button
                        key={op}
                        type="button"
                        onClick={() => handleSelectOperadora(op)}
                        className="block w-full px-3 py-2 text-left hover:bg-zinc-100"
                      >
                        {op}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="space-y-2">
              <Label>Entidades</Label>
              <Select
                key={entidadeSelectKey}
                onValueChange={(val) => {
                  if (val && val !== "__no-entidade" && !entidades.includes(val)) {
                    updateFilters({ entidades: [...entidades, val] })
                  }
                  setEntidadeSelectKey(prev => prev + 1)
                }}
                disabled={entidadesDisponiveisParaSelecao.length === 0}
              >
                <SelectTrigger>
                  <SelectValue placeholder={operadora ? "Selecione a entidade" : "Selecione"} />
                </SelectTrigger>
                <SelectContent>
                  {entidadesDisponiveisParaSelecao.map(ent => (
                    <SelectItem key={ent} value={ent}>
                      {ent}
                    </SelectItem>
                  ))}
                  {entidadesDisponiveisParaSelecao.length === 0 && (
                    <SelectItem value="__no-entidade" disabled>
                      {operadora ? "Sem entidades disponíveis" : "Nenhuma entidade disponível"}
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
              {entidades.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {entidades.map(ent => (
                    <span
                      key={ent}
                      className="inline-flex items-center gap-1 px-2 py-1 bg-zinc-100 dark:bg-zinc-800 rounded-md text-sm"
                    >
                      {ent}
                      <button
                        onClick={() => toggleEntidade(ent)}
                        className="hover:text-red-500"
                        aria-label={`Remover ${ent}`}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Label>Tipo de produtor</Label>
              <Select value={papel} onValueChange={(val) => handlePapelChange(val as DashboardPapel)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="geral">Todos</SelectItem>
                  <SelectItem value="corretores">Corretores</SelectItem>
                  <SelectItem value="supervisores">Supervisores</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={clearFilters}>
              Limpar
            </Button>
            <Button 
              onClick={() => loadDashboard()} 
              size="sm" 
              className="gap-2"
              disabled={loading}
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              Atualizar
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* KPIs - Cards principais conforme papel */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Card className="bg-white rounded-2xl shadow-sm border-zinc-200/70">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Bonificações do Mês</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-8 w-32" />
            ) : (
              <>
                <div className="text-2xl font-bold">{fmtBRL(kpis?.comissoesMes || 0)}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  Bruto: {fmtBRL(kpis?.pagamentosBruto || 0)} • Descontos: {fmtBRL(kpis?.descontoTotal || 0)}
                </p>
                <p className={`text-xs flex items-center gap-1 mt-1 ${
                  (kpis?.variacaoMesPercent || 0) >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"
                }`}>
                  {(kpis?.variacaoMesPercent || 0) >= 0 ? (
                    <TrendingUp className="h-3 w-3" />
                  ) : (
                    <TrendingDown className="h-3 w-3" />
                  )}
                  {Math.abs(kpis?.variacaoMesPercent || 0).toFixed(2)}% vs mês anterior
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="bg-white rounded-2xl shadow-sm border-zinc-200/70">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Parceiros Ativos</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-8 w-32" />
            ) : (
              <div className="text-2xl font-bold">{fmtNumber(kpis?.parceirosAtivos || 0)}</div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-white rounded-2xl shadow-sm border-zinc-200/70">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Vidas Faturadas</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-8 w-32" />
            ) : (
              <div className="text-2xl font-bold">{fmtNumber(kpis?.vidasFaturadas || 0)}</div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-white rounded-2xl shadow-sm border-zinc-200/70">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Vidas Pagas</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-8 w-32" />
            ) : (
              <div className="text-2xl font-bold">{fmtNumber(kpis?.vidasPagas || 0)}</div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-white rounded-2xl shadow-sm border-zinc-200/70">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Ticket Médio</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-8 w-32" />
            ) : (
              <div className="text-2xl font-bold">{fmtBRL(kpis?.ticketMedio || 0)}</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Evolução de Comissões */}
      <Card className="bg-white rounded-2xl shadow-sm border-zinc-200/70">
        <CardHeader>
          <CardTitle>Evolução de Bonificações</CardTitle>
          <CardDescription>Últimos 12 meses - Bonificações líquidas e descontos</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-64 w-full" />
          ) : evolucao.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">Nenhum dado disponível</p>
          ) : (
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={evolucao.map(item => ({ ...item, mes: fmtMes(item.mes) }))}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="mes" />
                <YAxis tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`} />
                <Tooltip 
                  content={({ active, payload }) => {
                    if (!active || !payload || payload.length === 0) return null
                    
                    // Pegar os dados do payload (pode vir de qualquer uma das barras)
                    const data = payload[0].payload as SerieMensal
                    
                    // Extrair valores do payload para garantir precisão
                    let valorBruto = data.bruto || 0
                    let valorDescontos = data.descontos || 0
                    let valorLiquido = data.valor || 0
                    
                    // Se os valores vierem dos payloads individuais, usar eles
                    payload.forEach((entry: any) => {
                      if (entry.dataKey === "descontos" && entry.value !== undefined) {
                        valorDescontos = entry.value
                      } else if (entry.dataKey === "valor" && entry.value !== undefined) {
                        valorLiquido = entry.value
                      }
                    })
                    
                    // Calcular bruto = líquido + descontos (mais preciso)
                    if (valorBruto === 0) {
                      valorBruto = valorLiquido + valorDescontos
                    }
                    
                    return (
                      <div className="bg-white dark:bg-zinc-900 p-3 border rounded-lg shadow-lg">
                        <p className="font-semibold mb-2">{data.mes}</p>
                        <p className="text-sm mb-1">
                          <span style={{ color: COLORS_QV.azulEscuro }}>Bruto:</span> {fmtBRL(valorBruto)}
                        </p>
                        {valorDescontos > 0 && (
                          <p className="text-sm mb-1">
                            <span style={{ color: "#CA8282" }}>Descontos:</span> {fmtBRL(valorDescontos)}
                          </p>
                        )}
                        <p className="text-sm font-semibold">
                          <span style={{ color: COLORS_QV.azulTabelaHeader }}>Líquido:</span> {fmtBRL(valorLiquido)}
                        </p>
                      </div>
                    )
                  }}
                />
                <Legend />
                {/* Descontos na base (vermelho) - colocado primeiro para aparecer embaixo */}
                {evolucao.length > 0 && evolucao[0].descontos !== undefined && (
                  <Bar 
                    dataKey="descontos" 
                    name="Descontos" 
                    stackId="1" 
                    fill="#CA8282"
                  />
                )}
                {/* Líquido no topo (azul do cabeçalho) - colocado depois para aparecer em cima */}
                <Bar 
                  dataKey="valor" 
                  name="Líquido" 
                  stackId="1" 
                  fill={COLORS_QV.azulTabelaHeader} 
                  radius={[6, 6, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Por Entidade e Por Operadora */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="bg-white rounded-2xl shadow-sm border-zinc-200/70">
          <CardHeader>
            <CardTitle>Distribuição por Entidade (Top 10)</CardTitle>
            <CardDescription>Comissões líquidas por entidade</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-64 w-full" />
            ) : porEntidade.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">Nenhum dado disponível</p>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={porEntidade.slice(0, 10)} layout="vertical">
                  <XAxis 
                    type="number" 
                    hide={true}
                    tickFormatter={(value) => {
                      const formatted = fmtBRL(value)
                      return formatted.replace('R$', '').trim()
                    }} 
                  />
                  <YAxis 
                    dataKey="nome" 
                    type="category" 
                    width={150}
                    tick={{ fontSize: 12 }}
                  />
                  <Tooltip 
                    formatter={(value: number) => fmtBRL(value)}
                    contentStyle={{ backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: '8px' }}
                  />
                  <Bar 
                    dataKey="valor" 
                    fill={COLORS_QV.azulTabelaHeader}
                    radius={[0, 6, 6, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="bg-white rounded-2xl shadow-sm border-zinc-200/70">
          <CardHeader>
            <CardTitle>Distribuição por Operadora</CardTitle>
            <CardDescription>Percentual de comissões líquidas</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-64 w-full" />
            ) : porOperadora.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">Nenhum dado disponível</p>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={porOperadora}
                    dataKey="valor"
                    nameKey="operadora"
                    cx="50%"
                    cy="50%"
                    outerRadius={100}
                    labelLine={false}
                    label={(entry: any) => {
                      // Recharts passa o entry completo + percent (0-1)
                      const operadora = entry.operadora || ''
                      const percent = entry.percent || 0 // percent é 0-1 no Recharts
                      const percentual = percent * 100 // converter para 0-100
                      
                      // Mostrar labels apenas para fatias maiores que 7%
                      if (!isFinite(percentual) || isNaN(percentual) || percentual < 7) return ''
                      return `${operadora}: ${percentual.toFixed(1)}%`
                    }}
                  >
                    {porOperadora.map((entry, index) => {
                      const cor = getCorOperadora(entry.operadora, index)
                      return (
                        <Cell 
                          key={`cell-${index}`} 
                          fill={cor}
                        />
                      )
                    })}
                  </Pie>
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload || payload.length === 0) return null
                      const data = payload[0].payload as DistribuicaoOperadora
                      const operadora = data.operadora || 'Não informado'
                      const valor = data.valor || 0
                      const percentual = data.percentual || 0
                      
                      return (
                        <div className="bg-white dark:bg-zinc-900 p-3 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-sm">
                          <p className="font-semibold mb-1 text-sm">Operadora: {operadora}</p>
                          <p className="text-sm mb-1">Valor líquido: {fmtBRL(valor)}</p>
                          <p className="text-sm font-medium">Participação: {percentual.toFixed(1)}%</p>
                        </div>
                      )
                    }}
                  />
                  <Legend
                    verticalAlign="middle"
                    align="right"
                    layout="vertical"
                    content={({ payload }) => {
                      if (!payload || payload.length === 0) return null
                      return (
                        <ul className="list-none space-y-2">
                          {payload.map((entry: any, index: number) => {
                            const item = porOperadora.find(item => item.operadora === entry.value)
                            if (!item || !item.valor || item.valor <= 0) return null
                            
                            const percentual = item.percentual || 0
                            if (!isFinite(percentual) || isNaN(percentual) || percentual < 0) return null
                            
                            // Obter a cor correta da operadora
                            const corOperadora = getCorOperadora(item.operadora, index)
                            
                            return (
                              <li key={`legend-${index}`} className="flex items-center gap-2 text-sm">
                                <span 
                                  className="inline-block w-3 h-3 rounded-sm flex-shrink-0"
                                  style={{ backgroundColor: corOperadora }}
                                />
                                <span className="text-black dark:text-black">
                                  {item.operadora} ({percentual.toFixed(1)}%)
                                </span>
                              </li>
                            )
                          })}
                        </ul>
                      )
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Top Corretores e Supervisores */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="bg-white rounded-2xl shadow-sm border-zinc-200/70">
          <CardHeader>
            <CardTitle>Top Corretores (Top 10)</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-2">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : topCorretores.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">Nenhum dado disponível</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Posição</TableHead>
                      <TableHead>Corretor</TableHead>
                      <TableHead className="text-right">Valor Líquido</TableHead>
                      <TableHead className="text-right">Vidas</TableHead>
                      <TableHead className="text-right">Ticket Médio</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {topCorretores.slice(0, 10).map((item, index) => (
                      <TableRow key={index}>
                        <TableCell className="font-medium">{index + 1}º</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span>{item.nome}</span>
                            {item.papel && (
                              <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                                item.papel === 'corretor' 
                                  ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
                                  : item.papel === 'supervisor'
                                  ? 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200'
                                  : 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200'
                              }`}>
                                {item.papel === 'corretor' ? 'Corretor' : item.papel === 'supervisor' ? 'Supervisor' : item.papel}
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">{fmtBRL(item.valor)}</TableCell>
                        <TableCell className="text-right">{fmtNumber(item.vidas || 0)}</TableCell>
                        <TableCell className="text-right">{fmtBRL(item.ticket || 0)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-white rounded-2xl shadow-sm border-zinc-200/70">
          <CardHeader>
            <CardTitle>Top Supervisores (Top 10)</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-2">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : topSupervisores.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">Nenhum dado disponível</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Posição</TableHead>
                      <TableHead>Supervisor</TableHead>
                      <TableHead className="text-right">Valor Líquido</TableHead>
                      <TableHead className="text-right">Vidas</TableHead>
                      <TableHead className="text-right">Ticket Médio</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {topSupervisores.slice(0, 10).map((item, index) => (
                      <TableRow key={index}>
                        <TableCell className="font-medium">{index + 1}º</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span>{item.nome}</span>
                            {item.papel && (
                              <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                                item.papel === 'corretor' 
                                  ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
                                  : item.papel === 'supervisor'
                                  ? 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200'
                                  : 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200'
                              }`}>
                                {item.papel === 'corretor' ? 'Corretor' : item.papel === 'supervisor' ? 'Supervisor' : item.papel}
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">{fmtBRL(item.valor)}</TableCell>
                        <TableCell className="text-right">{fmtNumber(item.vidas || 0)}</TableCell>
                        <TableCell className="text-right">{fmtBRL(item.ticket || 0)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Impacto de Descontos */}
      <Card className="bg-white rounded-2xl shadow-sm border-zinc-200/70">
        <CardHeader>
          <CardTitle>Impacto dos Descontos</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-64 w-full" />
          ) : impactoDescontos.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">Nenhum dado disponível</p>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={impactoDescontos.map(item => ({ ...item, mes: fmtMes(item.mes) }))}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="mes" />
                <YAxis yAxisId="left" tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`} />
                <YAxis yAxisId="right" orientation="right" tickFormatter={(value) => `${value}%`} />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload || payload.length === 0) return null
                    const data = payload[0].payload as ImpactoDescontos
                    
                    return (
                      <div className="bg-white dark:bg-zinc-900 p-3 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-sm">
                        <p className="font-semibold mb-2">{data.mes}</p>
                        {payload.map((entry: any, index: number) => {
                          if (entry.dataKey === "percentualDesconto") {
                            return (
                              <p key={index} className="text-sm mb-1">
                                <span style={{ color: entry.color }}>{entry.name}:</span> {entry.value.toFixed(2)}%
                              </p>
                            )
                          } else {
                            return (
                              <p key={index} className="text-sm mb-1">
                                <span style={{ color: entry.color }}>{entry.name}:</span> {fmtBRL(entry.value)}
                              </p>
                            )
                          }
                        })}
                      </div>
                    )
                  }}
                />
                <Legend />
                <Line 
                  yAxisId="left"
                  type="monotone" 
                  dataKey="valorDesconto" 
                  stroke={COLORS_QV.laranja} 
                  name="Valor Desconto"
                />
                <Line 
                  yAxisId="right"
                  type="monotone" 
                  dataKey="percentualDesconto" 
                  stroke={COLORS_QV.verde} 
                  name="% Desconto"
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Evolução de Descontos - Modelo Cascata */}
      <Card className="bg-white rounded-2xl shadow-sm border-zinc-200/70">
        <CardHeader>
          <CardTitle>Evolução de Descontos</CardTitle>
          <CardDescription>Últimos 12 meses - Descontos realizados, cancelamentos e saldo acumulado</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-64 w-full" />
          ) : evolucaoDescontos.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">Nenhum dado disponível</p>
          ) : (
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={(() => {
                // Usar saldoBanco retornado pela API (já calculado corretamente com saldo histórico)
                return evolucaoDescontos.map((item, index) => {
                  const mes = fmtMes(item.mes)
                  const cancelamentos = item.cancelamentos || 0
                  const descontosRealizados = item.descontosRealizados || 0
                  
                  // Usar saldoBanco da API que já contém o saldo acumulado correto
                  const saldoTotal = item.saldoBanco || 0
                  
                  // Para o gráfico cascata, precisamos calcular o saldo anterior para mostrar os componentes
                  // O saldo anterior é o saldo do mês anterior (ou calculado para o primeiro mês)
                  const saldoAnterior = index > 0 
                    ? (evolucaoDescontos[index - 1].saldoBanco || 0)
                    : (saldoTotal - descontosRealizados + cancelamentos)
                  
                  // Componentes da barra cascata:
                  // - Base: saldo anterior (já acumulado até o mês anterior)
                  // - Cancelamentos: valores que reduzem o saldo (mostrados como valores negativos no empilhamento)
                  // - Descontos: valores positivos que aumentam o saldo
                  // - Resultado final: saldoTotal = base - cancelamentos + descontos
                  
                  // Para o Recharts, precisamos calcular valores intermediários:
                  // Após cancelamentos: saldoAnterior - cancelamentos
                  // Após descontos: saldoAnterior - cancelamentos + descontos = saldoTotal
                  
                  const saldoAposCancelamentos = Math.max(0, saldoAnterior - cancelamentos)
                  
                  return {
                    mes,
                    base: Math.max(0, saldoAnterior), // Base não pode ser negativa
                    cancelamentos: saldoAnterior - saldoAposCancelamentos, // Diferença (sempre positiva para exibição)
                    descontosRealizados: descontosRealizados,
                    saldoTotal: saldoTotal, // Este é o valor final acumulado
                    cancelamentosDetalhes: item.cancelamentosDetalhes || [] // Detalhes dos cancelamentos do mês
                  }
                })
              })()}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="mes" />
                <YAxis tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`} reversed />
                <Tooltip 
                  content={({ active, payload }) => {
                    if (!active || !payload || payload.length === 0) return null
                    
                    // Pegar os dados do payload
                    const data = payload[0].payload as any
                    
                    // Extrair valores do payload para garantir precisão
                    let cancelamentos = Math.abs(data.cancelamentos || 0)
                    let descontosRealizados = data.descontosRealizados || 0
                    let saldoTotal = data.saldoTotal || 0
                    
                    // Se os valores vierem dos payloads individuais, usar eles
                    payload.forEach((entry: any) => {
                      if (entry.dataKey === "cancelamentos" && entry.value !== undefined) {
                        cancelamentos = Math.abs(entry.value)
                      } else if (entry.dataKey === "descontosRealizados" && entry.value !== undefined) {
                        descontosRealizados = entry.value
                      } else if (entry.dataKey === "saldoTotal" && entry.value !== undefined) {
                        saldoTotal = entry.value
                      }
                    })
                    
                    // Buscar detalhes dos cancelamentos do mês e calcular o total consolidado
                    const cancelamentosDetalhes = data.cancelamentosDetalhes || []
                    // Se houver detalhes, somar todos. Caso contrário, usar o valor do mês da API
                    // Para isso, precisamos buscar o item original do evolucaoDescontos
                    const mesAtual = data.mes
                    const itemOriginal = evolucaoDescontos.find((item: any) => fmtMes(item.mes) === mesAtual)
                    const cancelamentosMes = cancelamentosDetalhes.length > 0
                      ? cancelamentosDetalhes.reduce((sum: number, det: any) => sum + (det.valor || 0), 0)
                      : (itemOriginal?.cancelamentos || 0) // Se não houver detalhes, usar o valor do mês

                    return (
                      <div className="bg-white dark:bg-zinc-900 p-3 border rounded-lg shadow-lg max-w-md">
                        <p className="font-semibold mb-2">{data.mes}</p>
                        <p className="text-sm mb-1">
                          <span style={{ color: "#CA8282" }}>Cancelamentos:</span> {fmtBRL(cancelamentos)}
                        </p>
                        {cancelamentosMes > 0 && (
                          <p className="text-sm mb-1 ml-2">
                            <span className="text-gray-600 dark:text-gray-400">Cancelado no mês:</span> {fmtBRL(cancelamentosMes)}
                          </p>
                        )}
                        {descontosRealizados > 0 && (
                          <p className="text-sm mb-1">
                            <span style={{ color: "#f58220" }}>Descontos Realizados:</span> {fmtBRL(descontosRealizados)}
                          </p>
                        )}
                        <p className="text-sm font-semibold">
                          <span style={{ color: COLORS_QV.azulEscuro }}>Saldo Total (a descontar):</span> {fmtBRL(saldoTotal)}
                        </p>
                      </div>
                    )
                  }}
                />
                <Legend />
                {/* Base: saldo anterior (invisível mas necessário para o empilhamento correto) */}
                {evolucaoDescontos.length > 0 && (
                  <Bar 
                    dataKey="base" 
                    stackId="1" 
                    fill="transparent"
                    hide={true}
                    name=""
                    legendType="none"
                  />
                )}
                {/* Cancelamentos: valores negativos que reduzem o saldo */}
                {evolucaoDescontos.length > 0 && (
                  <Bar 
                    dataKey="cancelamentos" 
                    name="Cancelamentos" 
                    stackId="1" 
                    fill="#CA8282"
                  />
                )}
                {/* Descontos realizados: valores positivos que aumentam o saldo */}
                {evolucaoDescontos.length > 0 && (
                  <Bar 
                    dataKey="descontosRealizados" 
                    name="Descontos Realizados" 
                    stackId="1" 
                    fill="#f58220"
                  />
                )}
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

