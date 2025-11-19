"use client"

import { useEffect, useState, useMemo, useCallback, Fragment, useRef } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useAuth } from "@/components/auth/auth-provider"
import { useBeneficiariosFilters } from "@/lib/beneficiarios-filters-store"
import { useToast } from "@/hooks/use-toast"
import { Filter, RefreshCw, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react"
import { signalPageLoaded } from "@/components/ui/page-loading"
import { Skeleton } from "@/components/ui/skeleton"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Checkbox } from "@/components/ui/checkbox"

const fetchNoStore = (input: string, init?: RequestInit) =>
  fetch(input, { ...init, cache: "no-store" })

// Removido: Guards complexos - usando abordagem simples como Histórico de Bonificações

type VidasAtivasPorMes = {
  mes_referencia: string
  vidas_ativas: number
}

type AppliedFiltersSnapshot = {
  mesesReferencia: string[]
  dataInicioSelecionado: string
  dataFimSelecionado: string
  operadoras: string[]
  entidades: string[]
  tipo: string
}

type DashboardRequestContext = AppliedFiltersSnapshot & {
  dataInicioGrafico: string
  dataFimGrafico: string
  mesesParaGrafico: string[]
}

export default function SinistralidadeDashboardPage() {
  const { user, isLoading: authLoading } = useAuth()
  const router = useRouter()
  const { toast } = useToast()
  const { filters, updateFilters } = useBeneficiariosFilters()
  
  const [entidadeSelectKey, setEntidadeSelectKey] = useState(0)
  const [mesesDropdownOpen, setMesesDropdownOpen] = useState(false)
  const [operadorasDisponiveis, setOperadorasDisponiveis] = useState<string[]>([])
  const [entidadesDisponiveis, setEntidadesDisponiveis] = useState<string[]>([])
  const [entidadesPorOperadora, setEntidadesPorOperadora] = useState<Record<string, string[]>>({})
  const [tiposDisponiveis, setTiposDisponiveis] = useState<string[]>([])
  const [loadingFiltros, setLoadingFiltros] = useState(true)
  const [vidasAtivas, setVidasAtivas] = useState<VidasAtivasPorMes[]>([])
  const [dadosDetalhados, setDadosDetalhados] = useState<any[]>([])
  const [totalRegistros, setTotalRegistros] = useState(0)
  const [totalPaginas, setTotalPaginas] = useState(1)
  const [loading, setLoading] = useState(false)
  const [loadingDetalhados, setLoadingDetalhados] = useState(false)
  const [paginaAtual, setPaginaAtual] = useState(1)
  const [expandedRowKeys, setExpandedRowKeys] = useState<Set<string>>(() => new Set())
  // Ref para preservar linhas expandidas entre re-renders e evitar que sejam fechadas automaticamente
  const expandedRowKeysRef = useRef<Set<string>>(new Set())
  
  // Sincronizar ref com state
  useEffect(() => {
    expandedRowKeysRef.current = expandedRowKeys
  }, [expandedRowKeys])
  
  // Ref para rastrear se é o carregamento inicial (mesma abordagem da página de Histórico de Bonificações)
  const isInitialLoad = useRef(true)
  const loadAllDataCalledRef = useRef(false)
  const loadDashboardInProgressRef = useRef(false)
  const linhasPorPagina = 20

  const buildFiltersSignature = useCallback((input: { mesesReferencia: string[]; operadoras: string[]; entidades: string[]; tipo: string }) => {
    const sanitize = (list: string[]) =>
      Array.from(new Set(list)).filter(Boolean).sort((a, b) => a.localeCompare(b))

    return JSON.stringify({
      mesesReferencia: sanitize(input.mesesReferencia),
      operadoras: sanitize(input.operadoras),
      entidades: sanitize(input.entidades),
      tipo: input.tipo || "Todos",
    })
  }, [])

  // Ler filtros diretamente do store - seguindo padrão do DashboardContent
  const mesesReferencia = Array.isArray(filters?.mesesReferencia) && filters.mesesReferencia.length > 0
    ? filters.mesesReferencia
    : filters?.mesReferencia
    ? [filters.mesReferencia]
    : []
  const operadoras = Array.isArray(filters?.operadoras) ? filters.operadoras : []
  const entidades = Array.isArray(filters?.entidades) ? filters.entidades : []
  const tipo = filters?.tipo || "Todos"

  // Gerar lista de anos (últimos 5 anos até o ano atual)
  const anosDisponiveis = useMemo(() => {
    const hoje = new Date()
    const anoAtual = hoje.getFullYear()
    const anos: number[] = []
    for (let i = 0; i < 5; i++) {
      anos.push(anoAtual - i)
    }
    return anos
  }, [])

  // Gerar lista de meses
  const mesesDisponiveis = useMemo(() => {
    return [
      { valor: "01", nome: "Janeiro" },
      { valor: "02", nome: "Fevereiro" },
      { valor: "03", nome: "Março" },
      { valor: "04", nome: "Abril" },
      { valor: "05", nome: "Maio" },
      { valor: "06", nome: "Junho" },
      { valor: "07", nome: "Julho" },
      { valor: "08", nome: "Agosto" },
      { valor: "09", nome: "Setembro" },
      { valor: "10", nome: "Outubro" },
      { valor: "11", nome: "Novembro" },
      { valor: "12", nome: "Dezembro" },
    ]
  }, [])

  const redirectCheckedRef = useRef(false)
  useEffect(() => {
    // Evitar múltiplos redirects
    if (redirectCheckedRef.current) return
    if (!authLoading && user && user.role !== "admin") {
      redirectCheckedRef.current = true
      router.push("/admin")
    }
  }, [authLoading, user, router])

  // Filtrar operadoras válidas (que estão na lista disponível)
  const operadorasValidas = useMemo(() => {
    return operadoras.filter(op => operadorasDisponiveis.includes(op))
  }, [operadoras, operadorasDisponiveis])

  // Operadoras disponíveis para seleção (excluindo as já selecionadas)
  const operadorasDisponiveisParaSelecao = useMemo(() => {
    return operadorasDisponiveis.filter(op => !operadoras.includes(op))
  }, [operadorasDisponiveis, operadoras])

  // Texto do placeholder baseado nas operadoras selecionadas
  const operadorasPlaceholder = useMemo(() => {
    if (loadingFiltros) return "Carregando..."
    if (operadorasValidas.length === 0) return "Todas"
    if (operadorasValidas.length === 1) return operadorasValidas[0]
    // Se houver múltiplas, mostrar os nomes separados por vírgula (máximo 2 para não ficar muito longo)
    if (operadorasValidas.length <= 2) {
      return operadorasValidas.join(", ")
    }
    // Se houver mais de 2, mostrar as primeiras 2 + contador
    return `${operadorasValidas.slice(0, 2).join(", ")} +${operadorasValidas.length - 2}`
  }, [loadingFiltros, operadorasValidas])

  // Garantir que o valor do tipo está na lista disponível
  const tipoValido = useMemo(() => {
    if (!tipo || tipo === "Todos") {
      return "Todos"
    }
    return tiposDisponiveis.includes(tipo) ? tipo : "Todos"
  }, [tipo, tiposDisponiveis])

  // Filtrar operadoras válidas (que estão na lista disponível)

  const entidadesBase = useMemo(() => {
    // Se houver operadoras selecionadas, mostrar entidades dessas operadoras
    if (operadorasValidas.length > 0) {
      const entidadesFiltradas = new Set<string>()
      operadorasValidas.forEach(op => {
        if (entidadesPorOperadora[op]) {
          entidadesPorOperadora[op].forEach(ent => entidadesFiltradas.add(ent))
        }
      })
      return Array.from(entidadesFiltradas)
    }
    return entidadesDisponiveis
  }, [operadorasValidas, entidadesDisponiveis, entidadesPorOperadora])

  const entidadesDisponiveisParaSelecao = useMemo(() => {
    return entidadesBase.filter(ent => !entidades.includes(ent))
  }, [entidadesBase, entidades])

  const toggleOperadora = (op: string) => {
    updateFilters({
      operadoras: operadoras.includes(op)
        ? operadoras.filter(o => o !== op)
        : [...operadoras, op],
      entidades: [] // Resetar entidades quando mudar operadoras
    })
    setEntidadeSelectKey(prev => prev + 1)
  }

  const toggleEntidade = (ent: string) => {
    updateFilters({
      entidades: entidades.includes(ent)
        ? entidades.filter(e => e !== ent)
        : [...entidades, ent]
    })
  }

  const toggleMes = (mesValue: string) => {
    const novosMeses = mesesReferencia.includes(mesValue)
      ? mesesReferencia.filter(m => m !== mesValue)
      : [...mesesReferencia, mesValue]
    
    // Garantir que nunca fique vazio - se tentar remover o último, não permite
    if (novosMeses.length === 0) {
      toast({
        title: "Atenção",
        description: "Pelo menos um mês deve estar selecionado",
        variant: "destructive"
      })
      return
    }

    // Ordenar os meses
    const mesesOrdenados = novosMeses.sort()
    updateFilters({ mesesReferencia: mesesOrdenados })
  }

  const getTextoMesesSelecionados = () => {
    if (mesesReferencia.length === 0) return "Selecione os meses"
    if (mesesReferencia.length === 1) {
      const [ano, mes] = mesesReferencia[0].split("-")
      const mesObj = mesesDisponiveis.find(m => m.valor === mes)
      return `${mesObj?.nome || mes} ${ano}`
    }
    return `${mesesReferencia.length} meses selecionados`
  }

  const clearFilters = () => {
    // Usar o mês atual como padrão
    const hoje = new Date()
    const ano = hoje.getFullYear()
    const mes = String(hoje.getMonth() + 1).padStart(2, "0")
    const mesAtual = `${ano}-${mes}`
    updateFilters({ 
      mesesReferencia: [mesAtual],
      operadoras: [],
      entidades: [],
      tipo: "Todos"
    })
    setEntidadeSelectKey(prev => prev + 1)
  }

  // Correção de filtros inválidos - apenas uma vez após filtros carregarem
  const filtrosInvalidosCorrigidosRef = useRef(false)
  const correcaoEmAndamentoRef = useRef(false)
  useEffect(() => {
    // Evitar execução se já estiver corrigindo ou se já foi corrigido
    if (loadingFiltros || filtrosInvalidosCorrigidosRef.current || correcaoEmAndamentoRef.current) {
      return
    }
    
    const operadorasInvalidas = operadoras.filter(op => !operadorasDisponiveis.includes(op))
    const tipoInvalido = tipo && tipo !== "Todos" && !tiposDisponiveis.includes(tipo)
    
    // Só corrigir se realmente houver algo inválido
    if (operadorasInvalidas.length > 0 || tipoInvalido) {
      correcaoEmAndamentoRef.current = true
      filtrosInvalidosCorrigidosRef.current = true
      
      // Fazer todas as correções de uma vez para evitar múltiplos updates
      const updates: Partial<{ operadoras: string[]; entidades: string[]; tipo: string }> = {}
      if (operadorasInvalidas.length > 0) {
        updates.operadoras = operadoras.filter(op => operadorasDisponiveis.includes(op))
        updates.entidades = []
      }
      if (tipoInvalido) {
        updates.tipo = "Todos"
      }
      
      if (Object.keys(updates).length > 0) {
        updateFilters(updates)
        if (updates.entidades !== undefined) {
          setEntidadeSelectKey(prev => prev + 1)
        }
      }
      
      // Resetar flag após um pequeno delay para permitir que o update seja processado
      setTimeout(() => {
        correcaoEmAndamentoRef.current = false
      }, 100)
    } else {
      filtrosInvalidosCorrigidosRef.current = true
    }
  }, [loadingFiltros, operadoras, operadorasDisponiveis, tipo, tiposDisponiveis, updateFilters])

  // Função auxiliar para calcular os 12 meses: o mês mais recente filtrado + 11 meses anteriores
  const calcular12MesesParaGrafico = (mesMaisRecente: string): string[] => {
    const [anoFim, mesFim] = mesMaisRecente.split("-")
    const meses: string[] = []
    
    // Converter para número para facilitar cálculos
    let ano = parseInt(anoFim)
    let mes = parseInt(mesFim) // mes está em formato 1-12 (novembro = 11)
    
    // Gerar os 12 meses: o mês mais recente filtrado + os 11 meses anteriores
    // Começamos pelo mês mais recente e vamos retrocedendo
    for (let i = 0; i < 12; i++) {
      // Adicionar o mês atual no início do array (para manter ordem cronológica crescente)
      meses.unshift(`${ano}-${String(mes).padStart(2, "0")}`)
      
      // Retroceder um mês para a próxima iteração
      mes--
      if (mes < 1) {
        mes = 12
        ano--
      }
    }
    
    // Resultado: array com 12 meses em ordem crescente
    // Exemplo para Nov 2025: ["2024-12", "2025-01", ..., "2025-11"]
    return meses
  }

  // Carregar dados detalhados
  const loadDadosDetalhados = useCallback(async (
    dataInicio: string,
    dataFim: string,
    pagina: number = 1,
    mesesFiltrados?: string[],
    overrides?: {
      operadoras?: string[]
      entidades?: string[]
      tipo?: string
    }
  ): Promise<boolean> => {
    setLoadingDetalhados(true)
    try {
      const params = new URLSearchParams({
        data_inicio: dataInicio,
        data_fim: dataFim,
        pagina: pagina.toString(),
        limite: "20",
      })
      const operadorasFiltro = overrides?.operadoras ?? operadorasValidas
      const entidadesFiltro = overrides?.entidades ?? entidades
      const tipoFiltro = overrides?.tipo ?? tipoValido

      if (operadorasFiltro.length > 0) params.append("operadoras", operadorasFiltro.join(","))
      if (entidadesFiltro.length > 0) params.append("entidades", entidadesFiltro.join(","))
      if (tipoFiltro && tipoFiltro !== "Todos") params.append("tipo", tipoFiltro)
      if (mesesFiltrados && mesesFiltrados.length > 0) params.append("meses_referencia", mesesFiltrados.join(","))

      const res = await fetchNoStore(`/api/beneficiarios/detalhados?${params}`)
      if (!res.ok) throw new Error("Erro ao carregar dados detalhados")
      
      const data = await res.json()
      const novosDados = data.dados || []
      
      // Preservar linhas expandidas ao atualizar dados detalhados (paginação)
      // Função auxiliar para gerar key do grupo (mesma lógica usada em dadosAgrupados)
      const getGrupoKey = (row: any) => {
        if (row?.CPF) return `cpf:${row.CPF}`
        if (row?.ID_BENEFICIARIO) return `id:${row.ID_BENEFICIARIO}`
        const parts = [
          row?.OPERADORA || "SEM-OPERADORA",
          row?.PLANO || "SEM-PLANO",
          row?.NOME || "SEM-NOME",
          row?.ENTIDADE || "SEM-ENTIDADE",
          row?.STATUS || "SEM-STATUS",
        ]
        return `fallback:${parts.join("|")}`
      }
      
      // Preservar keys expandidas que ainda existem nos novos dados
      const keysExpandidasAtuais = expandedRowKeysRef.current
      if (keysExpandidasAtuais.size > 0 && novosDados.length > 0) {
        const novasKeys = new Set<string>()
        novosDados.forEach((row: any) => {
          const key = getGrupoKey(row)
          if (keysExpandidasAtuais.has(key)) {
            novasKeys.add(key)
          }
        })
        
        // Preservar todas as keys que ainda existem nos novos dados
        if (novasKeys.size > 0) {
          setExpandedRowKeys(novasKeys)
          expandedRowKeysRef.current = novasKeys
        }
      }
      
      setDadosDetalhados(novosDados)
      setTotalRegistros(data.total || 0)
      setTotalPaginas(data.totalPaginas || 1)
      if (pagina === 1) {
        setPaginaAtual(1) // Resetar apenas se for primeira página
      }
      return true
    } catch (error: any) {
      console.error("Erro ao carregar dados detalhados:", error)
      toast({
        title: "Erro",
        description: error.message || "Não foi possível carregar dados detalhados",
        variant: "destructive"
      })
      return false
    } finally {
      setLoadingDetalhados(false)
    }
  }, [operadorasValidas, entidades, tipoValido, toast])

  // Carregar dados de vidas ativas
  const getPeriodoSelecionado = useCallback(() => {
    if (!mesesReferencia || mesesReferencia.length === 0) return null
    const mesesOrdenados = [...mesesReferencia].sort()
    const primeiroMes = mesesOrdenados[0]
    const ultimoMes = mesesOrdenados[mesesOrdenados.length - 1]

    const [anoInicioSel, mesInicioSel] = primeiroMes.split("-")
    const dataInicioSelecionado = `${anoInicioSel}-${mesInicioSel}-01`

    const [anoFimSel, mesFimSel] = ultimoMes.split("-")
    const anoFimNum = parseInt(anoFimSel)
    const mesFimNum = parseInt(mesFimSel)
    const ultimoDiaSelecionado = new Date(anoFimNum, mesFimNum + 1, 0).getDate()
    const dataFimSelecionado = `${anoFimSel}-${mesFimSel}-${String(ultimoDiaSelecionado).padStart(2, "0")}`

    return {
      mesesOrdenados,
      dataInicioSelecionado,
      dataFimSelecionado,
    }
  }, [mesesReferencia])

  const buildDashboardRequestContext = useCallback((): DashboardRequestContext | null => {
    const periodo = getPeriodoSelecionado()
    if (!periodo) return null

    const { mesesOrdenados, dataInicioSelecionado, dataFimSelecionado } = periodo
    const mesMaisRecente = mesesOrdenados[mesesOrdenados.length - 1]

    const mesesParaGrafico = calcular12MesesParaGrafico(mesMaisRecente)

    const [anoInicioGrafico, mesInicioGrafico] = mesesParaGrafico[0].split("-")
    const dataInicioGrafico = `${anoInicioGrafico}-${mesInicioGrafico}-01`

    const [anoFimGrafico, mesFimGrafico] = mesMaisRecente.split("-")
    const anoNum = parseInt(anoFimGrafico)
    const mesNum = parseInt(mesFimGrafico)
    const ultimoDiaGrafico = new Date(anoNum, mesNum + 1, 0).getDate()
    const dataFimGrafico = `${anoFimGrafico}-${mesFimGrafico}-${String(ultimoDiaGrafico).padStart(2, "0")}`

    return {
      mesesReferencia: mesesOrdenados,
      dataInicioSelecionado,
      dataFimSelecionado,
      operadoras: operadorasValidas,
      entidades,
      tipo: tipoValido,
      dataInicioGrafico,
      dataFimGrafico,
      mesesParaGrafico,
    }
  }, [getPeriodoSelecionado, calcular12MesesParaGrafico, operadorasValidas, entidades, tipoValido])

  const loadVidasAtivas = useCallback(async (context: DashboardRequestContext): Promise<boolean> => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        data_inicio: context.dataInicioGrafico,
        data_fim: context.dataFimGrafico,
      })
      if (context.operadoras.length > 0) params.append("operadoras", context.operadoras.join(","))
      if (context.entidades.length > 0) params.append("entidades", context.entidades.join(","))
      if (context.tipo && context.tipo !== "Todos") params.append("tipo", context.tipo)

      const res = await fetchNoStore(`/api/beneficiarios/ativos?${params}`)
      if (!res.ok) throw new Error("Erro ao carregar vidas ativas")

      const data = await res.json()

      const dadosPorMes = new Map<string, VidasAtivasPorMes>()
      ;(data || []).forEach((item: VidasAtivasPorMes) => {
        dadosPorMes.set(item.mes_referencia, item)
      })

      const vidasCompletas = context.mesesParaGrafico.map(mes => {
        const dadosDoMes = dadosPorMes.get(mes)
        if (dadosDoMes) {
          return dadosDoMes
        }
        return { mes_referencia: mes, vidas_ativas: 0 }
      })

      setVidasAtivas(vidasCompletas)
      return true
    } catch (error: any) {
      console.error("Erro ao carregar vidas ativas:", error)
      toast({
        title: "Erro",
        description: error.message || "Não foi possível carregar dados",
        variant: "destructive"
      })
      setVidasAtivas([])
      return false
    } finally {
      setLoading(false)
      // IMPORTANTE: Chamar signalPageLoaded apenas uma vez quando TODOS os dados estiverem carregados
      // Isso será feito em atualizarDados() após ambos loadVidas e loadDadosDetalhados completarem
      // signalPageLoaded() // REMOVIDO - será chamado em atualizarDados() após todos os dados carregarem
    }
  }, [toast])

  // REMOVIDO: useEffect que forçava mês padrão
  // O store já cuida de fornecer valores padrão quando necessário
  // Não devemos forçar valores aqui para evitar conflitos com o store

  // Estabilizar arrays para comparação profunda
  const mesesReferenciaStable = useMemo(() => {
    const sorted = [...mesesReferencia].sort()
    const str = JSON.stringify(sorted)
    return str
  }, [mesesReferencia])

  const operadorasValidasStable = useMemo(() => {
    const sorted = [...operadorasValidas].sort()
    const str = JSON.stringify(sorted)
    return str
  }, [operadorasValidas])

  const entidadesStable = useMemo(() => {
    const sorted = [...entidades].sort()
    const str = JSON.stringify(sorted)
    return str
  }, [entidades])

  // Carregar dados do dashboard - APENAS quando chamado explicitamente (botão Atualizar ou carregamento inicial)
  // Mesma abordagem da página de Histórico de Bonificações: sem comparações automáticas
  const loadDashboard = useCallback(async () => {
    // Proteção: evitar chamadas duplicadas simultâneas
    if (loadDashboardInProgressRef.current) {
      return
    }
    loadDashboardInProgressRef.current = true
    
    // Usar valores atuais dos filtros
    const mesesAtuais = JSON.parse(mesesReferenciaStable) as string[]
    const operadorasAtuais = JSON.parse(operadorasValidasStable) as string[]
    const entidadesAtuais = JSON.parse(entidadesStable) as string[]

    if (mesesAtuais.length === 0) {
      loadDashboardInProgressRef.current = false
      return
    }

    setLoading(true)
    try {
      // Calcular período selecionado
      const mesesOrdenados = [...mesesAtuais]
      const primeiroMes = mesesOrdenados[0]
      const ultimoMes = mesesOrdenados[mesesOrdenados.length - 1]

      const [anoInicioSel, mesInicioSel] = primeiroMes.split("-")
      const dataInicioSelecionado = `${anoInicioSel}-${mesInicioSel}-01`

      const [anoFimSel, mesFimSel] = ultimoMes.split("-")
      const anoFimNum = parseInt(anoFimSel)
      const mesFimNum = parseInt(mesFimSel)
      const ultimoDiaSelecionado = new Date(anoFimNum, mesFimNum + 1, 0).getDate()
      const dataFimSelecionado = `${anoFimSel}-${mesFimSel}-${String(ultimoDiaSelecionado).padStart(2, "0")}`

      // Calcular período do gráfico (12 meses a partir do mês mais recente)
      const mesMaisRecente = mesesOrdenados[mesesOrdenados.length - 1]
      const mesesParaGrafico = calcular12MesesParaGrafico(mesMaisRecente)

      const [anoInicioGrafico, mesInicioGrafico] = mesesParaGrafico[0].split("-")
      const dataInicioGrafico = `${anoInicioGrafico}-${mesInicioGrafico}-01`

      const [anoFimGrafico, mesFimGrafico] = mesMaisRecente.split("-")
      const anoNum = parseInt(anoFimGrafico)
      const mesNum = parseInt(mesFimGrafico)
      const ultimoDiaGrafico = new Date(anoNum, mesNum + 1, 0).getDate()
      const dataFimGrafico = `${anoFimGrafico}-${mesFimGrafico}-${String(ultimoDiaGrafico).padStart(2, "0")}`

      // Carregar dados em paralelo
      const paramsVidas = new URLSearchParams({
        data_inicio: dataInicioGrafico,
        data_fim: dataFimGrafico,
      })
      if (operadorasAtuais.length > 0) paramsVidas.append("operadoras", operadorasAtuais.join(","))
      if (entidadesAtuais.length > 0) paramsVidas.append("entidades", entidadesAtuais.join(","))
      if (tipoValido && tipoValido !== "Todos") paramsVidas.append("tipo", tipoValido)

      const paramsDetalhados = new URLSearchParams({
        data_inicio: dataInicioSelecionado,
        data_fim: dataFimSelecionado,
        pagina: "1",
        limite: "20",
      })
      if (operadorasAtuais.length > 0) paramsDetalhados.append("operadoras", operadorasAtuais.join(","))
      if (entidadesAtuais.length > 0) paramsDetalhados.append("entidades", entidadesAtuais.join(","))
      if (tipoValido && tipoValido !== "Todos") paramsDetalhados.append("tipo", tipoValido)
      if (mesesAtuais.length > 0) paramsDetalhados.append("meses_referencia", mesesAtuais.join(","))

      const [vidasRes, detalhadosRes] = await Promise.all([
        fetchNoStore(`/api/beneficiarios/ativos?${paramsVidas}`),
        fetchNoStore(`/api/beneficiarios/detalhados?${paramsDetalhados}`)
      ])

      if (!vidasRes.ok) throw new Error("Erro ao carregar vidas ativas")
      if (!detalhadosRes.ok) throw new Error("Erro ao carregar dados detalhados")

      const [vidasData, detalhadosData] = await Promise.all([
        vidasRes.json(),
        detalhadosRes.json()
      ])

      // Processar vidas ativas
      const dadosPorMes = new Map<string, VidasAtivasPorMes>()
      ;(vidasData || []).forEach((item: VidasAtivasPorMes) => {
        dadosPorMes.set(item.mes_referencia, item)
      })

      const vidasCompletas = mesesParaGrafico.map(mes => {
        const dadosDoMes = dadosPorMes.get(mes)
        if (dadosDoMes) {
          return dadosDoMes
        }
        return { mes_referencia: mes, vidas_ativas: 0 }
      })

      setVidasAtivas(vidasCompletas)
      
      // Preservar linhas expandidas ao recarregar dados
      const novosDados = detalhadosData.dados || []
      
      // Função auxiliar para gerar key do grupo (mesma lógica usada em dadosAgrupados)
      const getGrupoKey = (row: any) => {
        if (row?.CPF) return `cpf:${row.CPF}`
        if (row?.ID_BENEFICIARIO) return `id:${row.ID_BENEFICIARIO}`
        const parts = [
          row?.OPERADORA || "SEM-OPERADORA",
          row?.PLANO || "SEM-PLANO",
          row?.NOME || "SEM-NOME",
          row?.ENTIDADE || "SEM-ENTIDADE",
          row?.STATUS || "SEM-STATUS",
        ]
        return `fallback:${parts.join("|")}`
      }
      
      // Preservar keys expandidas que ainda existem nos novos dados
      // IMPORTANTE: Só preservar quando realmente há novos dados (não em re-renders)
      // Usar ref para garantir que as linhas expandidas sejam preservadas
      const keysExpandidasAtuais = expandedRowKeysRef.current
      if (keysExpandidasAtuais.size > 0 && novosDados.length > 0) {
        const novasKeys = new Set<string>()
        novosDados.forEach((row: any) => {
          const key = getGrupoKey(row)
          if (keysExpandidasAtuais.has(key)) {
            novasKeys.add(key)
          }
        })
        
        // Preservar todas as keys que ainda existem nos novos dados
        if (novasKeys.size > 0) {
          setExpandedRowKeys(novasKeys)
          expandedRowKeysRef.current = novasKeys
        }
      }
      
      setDadosDetalhados(novosDados)
      setTotalRegistros(detalhadosData.total || 0)
      setTotalPaginas(detalhadosData.totalPaginas || 1)
      setPaginaAtual(1)
      signalPageLoaded()
    } catch (error: any) {
      console.error("Erro ao carregar dashboard:", error)
      toast({
        title: "Erro",
        description: error.message || "Não foi possível carregar dados do dashboard",
        variant: "destructive"
      })
      setVidasAtivas([])
      setDadosDetalhados([])
    } finally {
      setLoading(false)
      loadDashboardInProgressRef.current = false
    }
  }, [mesesReferenciaStable, operadorasValidasStable, entidadesStable, tipoValido, toast])
  
  // Carregar todos os dados necessários na inicialização (mesma abordagem da página de Histórico de Bonificações)
  const loadAllData = useCallback(async () => {
    // Proteção: garantir que só execute uma vez
    if (loadAllDataCalledRef.current) {
      return
    }
    loadAllDataCalledRef.current = true
    
    setLoading(true)
    try {
      // Primeiro carregar filtros disponíveis
      try {
        const res = await fetchNoStore("/api/beneficiarios/filtros")
        if (!res.ok) throw new Error("Erro ao carregar filtros")
        const data = await res.json()
        setOperadorasDisponiveis(data.operadoras || [])
        setEntidadesDisponiveis(data.entidades || [])
        setEntidadesPorOperadora(data.entidadesPorOperadora || {})
        setTiposDisponiveis(data.tipos || [])
        setLoadingFiltros(false)
      } catch (error: any) {
        console.error("Erro ao carregar filtros:", error)
        toast({
          title: "Erro",
          description: "Não foi possível carregar filtros",
          variant: "destructive"
        })
        setLoadingFiltros(false)
      }
      
      // Depois carregar dados do dashboard (após filtros estarem prontos)
      await loadDashboard()
    } catch (error) {
      console.error("Erro ao carregar dados:", error)
      // Resetar flag em caso de erro para permitir retry
      loadAllDataCalledRef.current = false
    } finally {
      setLoading(false)
      signalPageLoaded()
      isInitialLoad.current = false
    }
  }, [loadDashboard, toast])

  // Carregamento inicial único - executa apenas uma vez no mount
  useEffect(() => {
    loadAllData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // REMOVIDO: useEffect que recarregava automaticamente quando filtros mudavam
  // A página fica congelada até o usuário clicar no botão "Atualizar"
  // Mesma abordagem da página de Histórico de Bonificações - sem reloads automáticos

  const fmtNumber = (v: number) => 
    new Intl.NumberFormat("pt-BR").format(v)

  const fmtCurrency = (v: number | null | undefined) => {
    if (v === null || v === undefined) return "-"
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v)
  }

  const fmtDate = (value?: string | null) => {
    if (!value) return "-"
    const date = new Date(value)
    if (isNaN(date.getTime())) return value
    return date.toLocaleDateString("pt-BR")
  }

  const fmtMes = (mes: string) => {
    const [ano, mesNum] = mes.split("-")
    const date = new Date(parseInt(ano), parseInt(mesNum) - 1, 1)
    return date.toLocaleDateString("pt-BR", { month: "short", year: "numeric" })
  }

  const parseValor = (valor: any): number => {
    if (typeof valor === "number") return valor
    if (typeof valor === "string") {
      const parsed = Number(valor.replace(",", "."))
      return isNaN(parsed) ? 0 : parsed
    }
    return 0
  }

  const chartData = useMemo(() => {
    return vidasAtivas.map(item => ({
      ...item,
      mes: fmtMes(item.mes_referencia),
    }))
  }, [vidasAtivas])

  const dadosAgrupados = useMemo(() => {
    const getGrupoKey = (row: any) => {
      if (row?.CPF) return `cpf:${row.CPF}`
      if (row?.ID_BENEFICIARIO) return `id:${row.ID_BENEFICIARIO}`
      const parts = [
        row?.OPERADORA || "SEM-OPERADORA",
        row?.PLANO || "SEM-PLANO",
        row?.NOME || "SEM-NOME",
        row?.ENTIDADE || "SEM-ENTIDADE",
        row?.STATUS || "SEM-STATUS",
      ]
      return `fallback:${parts.join("|")}`
    }

    const grupos = new Map<
      string,
      {
        key: string
        info: any
        procedimentos: {
          evento?: string | null
          descricao?: string | null
          especialidade?: string | null
          valor: number
          data_competencia?: string | null
          data_atendimento?: string | null
        }[]
        totalValor: number
        gastoAnual: number
      }
    >()

    dadosDetalhados.forEach(row => {
      const key = getGrupoKey(row)
      const valorProcedimento = parseValor(row.VALOR)
      const gastoAnual = parseValor(row.GASTO_ANUAL)
      if (!grupos.has(key)) {
        grupos.set(key, {
          key,
          info: row,
          procedimentos: [],
          totalValor: 0,
          gastoAnual,
        })
      }
      const grupo = grupos.get(key)!
      if (gastoAnual > 0) {
        grupo.gastoAnual = gastoAnual
      }
        grupo.procedimentos.push({
        evento: row.EVENTO,
        descricao: row.DESCRICAO,
        especialidade: row.ESPECIALIDADE,
        valor: valorProcedimento,
        data_competencia: row.DATA_COMPETENCIA,
        data_atendimento: row.DATA_ATENDIMENTO,
      })
      grupo.totalValor += valorProcedimento
    })

    return Array.from(grupos.values())
      .map(grupo => ({
        ...grupo,
        info: {
          ...grupo.info,
          NOME: grupo.info?.NOME
            ? grupo.info.NOME
                .toLowerCase()
                .split(" ")
                .filter(Boolean)
                .map((part: string) => part.charAt(0).toUpperCase() + part.slice(1))
                .join(" ")
            : grupo.info?.NOME,
        },
      }))
      .sort((a, b) => {
        if (b.gastoAnual !== a.gastoAnual) {
          return b.gastoAnual - a.gastoAnual
        }
        return b.totalValor - a.totalValor
      })
  }, [dadosDetalhados])

  // REMOVIDO: useEffect que fechava linhas expandidas automaticamente
  // As linhas expandidas agora ficam abertas até o usuário fechar manualmente
  // Não há mais reloads automáticos que fecham as linhas

  const toggleExpandRow = (key: string) => {
    setExpandedRowKeys(prev => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      // Atualizar ref também para garantir persistência
      expandedRowKeysRef.current = next
      return next
    })
  }

  const recarregarPaginaDetalhados = useCallback(async (paginaDestino: number) => {
    if (mesesReferencia.length === 0) return false

    // Calcular período selecionado
    const mesesOrdenados = [...mesesReferencia].sort()
    const primeiroMes = mesesOrdenados[0]
    const ultimoMes = mesesOrdenados[mesesOrdenados.length - 1]

    const [anoInicioSel, mesInicioSel] = primeiroMes.split("-")
    const dataInicioSelecionado = `${anoInicioSel}-${mesInicioSel}-01`

    const [anoFimSel, mesFimSel] = ultimoMes.split("-")
    const anoFimNum = parseInt(anoFimSel)
    const mesFimNum = parseInt(mesFimSel)
    const ultimoDiaSelecionado = new Date(anoFimNum, mesFimNum + 1, 0).getDate()
    const dataFimSelecionado = `${anoFimSel}-${mesFimSel}-${String(ultimoDiaSelecionado).padStart(2, "0")}`

    return await loadDadosDetalhados(
      dataInicioSelecionado,
      dataFimSelecionado,
      paginaDestino,
      mesesReferencia,
      {
        operadoras: operadorasValidas,
        entidades: entidades,
        tipo: tipoValido,
      }
    )
  }, [loadDadosDetalhados, mesesReferencia, operadorasValidas, entidades, tipoValido])

  // REMOVIDO: useEffects complexos e refs desnecessárias
  // Agora usa abordagem simples como Histórico de Bonificações

  // Aguardar carregamento do usuário antes de renderizar
  if (authLoading) {
    return null
  }

  if (!user) {
    return null
  }

  if (user.role !== "admin") {
    return null
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold">Dashboard de Sinistralidade</h1>
        <p className="text-muted-foreground mt-1">
          Visualize indicadores e métricas de sinistralidade.
        </p>
      </div>

      {/* Card de Filtros */}
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
              <Label>Mês Referência *</Label>
              <div className="relative">
                <Button
                  type="button"
                  variant="outline"
                  className="w-full justify-between"
                  onClick={() => setMesesDropdownOpen(!mesesDropdownOpen)}
                  onBlur={() => setTimeout(() => setMesesDropdownOpen(false), 200)}
                >
                  <span className={mesesReferencia.length === 0 ? "text-muted-foreground" : ""}>
                    {getTextoMesesSelecionados()}
                  </span>
                  <ChevronDown className={`h-4 w-4 transition-transform ${mesesDropdownOpen ? "rotate-180" : ""}`} />
                </Button>
                {mesesDropdownOpen && (
                  <div className="absolute z-10 mt-1 w-full max-h-96 overflow-auto rounded-md border bg-popover text-popover-foreground shadow-md">
                    <div className="p-2 space-y-4">
                      {anosDisponiveis.map(ano => {
                        const mesesDoAno = mesesDisponiveis.map(mes => ({
                          ...mes,
                          valorCompleto: `${ano}-${mes.valor}`
                        }))
                        
                        return (
                          <div key={ano} className="space-y-2">
                            <div className="font-semibold text-sm px-2 py-1 bg-muted rounded">
                              {ano}
                            </div>
                            <div className="space-y-1 pl-4">
                              {mesesDoAno.map(mes => {
                                const isChecked = mesesReferencia.includes(mes.valorCompleto)
                                const isUltimoMes = mesesReferencia.length === 1 && isChecked
                                
                                return (
                                  <div
                                    key={mes.valorCompleto}
                                    className="flex items-center space-x-2 py-1 px-2 rounded hover:bg-accent cursor-pointer"
                                    onMouseDown={(e) => {
                                      e.preventDefault()
                                      toggleMes(mes.valorCompleto)
                                    }}
                                  >
                                    <Checkbox
                                      checked={isChecked}
                                      onCheckedChange={() => toggleMes(mes.valorCompleto)}
                                      disabled={isUltimoMes}
                                    />
                                    <label
                                      className={`text-sm cursor-pointer flex-1 ${isUltimoMes ? "opacity-60" : ""}`}
                                      onMouseDown={(e) => e.preventDefault()}
                                    >
                                      {mes.nome}
                                    </label>
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
              {mesesReferencia.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {mesesReferencia.map(mes => {
                    const [ano, mesNum] = mes.split("-")
                    const mesObj = mesesDisponiveis.find(m => m.valor === mesNum)
                    const isUltimo = mesesReferencia.length === 1
                    
                    return (
                      <span
                        key={mes}
                        className={`inline-flex items-center gap-1 px-2 py-1 bg-zinc-100 dark:bg-zinc-800 rounded-md text-sm ${isUltimo ? "opacity-60" : ""}`}
                      >
                        {mesObj?.nome || mesNum} {ano}
                        {!isUltimo && (
                          <button
                            onClick={() => toggleMes(mes)}
                            className="hover:text-red-500"
                            aria-label={`Remover ${mesObj?.nome} ${ano}`}
                          >
                            ×
                          </button>
                        )}
                      </span>
                    )
                  })}
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Label>Operadoras</Label>
              <Select
                key={`operadora-${operadoras.length}`}
                onValueChange={(val) => {
                  if (val && val !== "__no-operadora" && !operadoras.includes(val)) {
                    updateFilters({ 
                      operadoras: [...operadoras, val],
                      entidades: [] 
                    })
                    setEntidadeSelectKey(prev => prev + 1)
                  }
                }}
                disabled={operadorasDisponiveisParaSelecao.length === 0 || loadingFiltros}
              >
                <SelectTrigger>
                  <SelectValue placeholder={operadorasPlaceholder} />
                </SelectTrigger>
                <SelectContent>
                  {operadorasDisponiveisParaSelecao.map(op => (
                    <SelectItem key={op} value={op}>
                      {op}
                    </SelectItem>
                  ))}
                  {operadorasDisponiveisParaSelecao.length === 0 && (
                    <SelectItem value="__no-operadora" disabled>
                      {operadoras.length > 0 ? "Todas as operadoras selecionadas" : "Nenhuma operadora disponível"}
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
              {operadorasValidas.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {operadorasValidas.map(op => (
                    <span
                      key={op}
                      className="inline-flex items-center gap-1 px-2 py-1 bg-zinc-100 dark:bg-zinc-800 rounded-md text-sm"
                    >
                      {op}
                      <button
                        onClick={() => toggleOperadora(op)}
                        className="hover:text-red-500"
                        aria-label={`Remover ${op}`}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}
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
                  <SelectValue placeholder={operadorasValidas.length > 0 ? "Selecione a entidade" : "Selecione"} />
                </SelectTrigger>
                <SelectContent>
                  {entidadesDisponiveisParaSelecao.map(ent => (
                    <SelectItem key={ent} value={ent}>
                      {ent}
                    </SelectItem>
                  ))}
                  {entidadesDisponiveisParaSelecao.length === 0 && (
                    <SelectItem value="__no-entidade" disabled>
                      {operadorasValidas.length > 0 ? "Sem entidades disponíveis" : "Nenhuma entidade disponível"}
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
              <Label>Tipo de beneficiário</Label>
              <Select 
                value={tipoValido} 
                onValueChange={(val) => updateFilters({ tipo: val })}
                disabled={loadingFiltros}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Todos">Todos</SelectItem>
                  {tiposDisponiveis.map(t => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="mt-4 flex flex-col items-end gap-1">
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={clearFilters}>
                Limpar
              </Button>
              <Button onClick={() => loadDashboard()} size="sm" className="gap-2" disabled={loading}>
                <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                Atualizar
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Gráfico de Vidas Ativas */}
      <Card className="bg-white rounded-2xl shadow-sm border-zinc-200/70">
        <CardHeader>
          <CardTitle>Posição Vidas ativas Mensal</CardTitle>
          <CardDescription>
            Contagem de beneficiários ativos acumulados - Últimos 12 meses a partir do mês mais recente filtrado
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-64 w-full" />
          ) : vidasAtivas.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">Nenhum dado disponível</p>
          ) : (
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="mes" />
                <YAxis tickFormatter={(value) => fmtNumber(value)} />
                <Tooltip 
                  content={({ active, payload }) => {
                    if (!active || !payload || payload.length === 0) return null
                    const data = payload[0].payload as VidasAtivasPorMes
                    return (
                      <div className="bg-white dark:bg-zinc-900 p-3 border rounded-lg shadow-lg">
                        <p className="font-semibold mb-2">{fmtMes(data.mes_referencia)}</p>
                        <p className="text-sm font-semibold">
                          Vidas Ativas: {fmtNumber(data.vidas_ativas)}
                        </p>
                      </div>
                    )
                  }}
                />
                <Legend />
                <Bar dataKey="vidas_ativas" name="Vidas Ativas" fill="#333b5f" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Tabela de Resultados Detalhados */}
      <Card className="bg-white rounded-2xl shadow-sm border-zinc-200/70">
        <CardHeader>
          <CardTitle>Resultados Detalhados</CardTitle>
          <CardDescription>
            Lista completa de beneficiários ativos com procedimentos
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loadingDetalhados ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : dadosDetalhados.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">Nenhum dado disponível</p>
          ) : (
            <>
              <div className="border rounded-md overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10" />
                      <TableHead>Operadora</TableHead>
                      <TableHead>Plano</TableHead>
                      <TableHead>CPF</TableHead>
                      <TableHead>Nome</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Entidade</TableHead>
                      <TableHead>Idade</TableHead>
                      <TableHead>Procedimentos</TableHead>
                      <TableHead>Gasto do Mês</TableHead>
                      <TableHead>Gasto Anual</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dadosAgrupados.map(grupo => {
                      const isExpanded = expandedRowKeys.has(grupo.key)
                      return (
                        <Fragment key={grupo.key}>
                          <TableRow>
                            <TableCell className="w-10">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => toggleExpandRow(grupo.key)}
                                aria-label={isExpanded ? "Recolher procedimentos" : "Expandir procedimentos"}
                              >
                                <ChevronDown
                                  className={`h-4 w-4 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                                />
                              </Button>
                            </TableCell>
                            <TableCell>{grupo.info?.OPERADORA || "-"}</TableCell>
                            <TableCell>{grupo.info?.PLANO || "-"}</TableCell>
                            <TableCell>{grupo.info?.CPF || "-"}</TableCell>
                            <TableCell>{grupo.info?.NOME || "-"}</TableCell>
                            <TableCell>{grupo.info?.STATUS || "-"}</TableCell>
                            <TableCell>{grupo.info?.ENTIDADE || "-"}</TableCell>
                            <TableCell>{grupo.info?.IDADE || "-"}</TableCell>
                            <TableCell>{grupo.procedimentos.length}</TableCell>
                            <TableCell>{fmtCurrency(grupo.totalValor)}</TableCell>
                            <TableCell>{fmtCurrency(grupo.gastoAnual)}</TableCell>
                          </TableRow>
                          {isExpanded && (
                            <TableRow>
                              <TableCell colSpan={11} className="bg-muted/40">
                                <div className="space-y-3 p-3">
                                  <p className="text-sm font-semibold text-muted-foreground">
                                    Procedimentos realizados
                                  </p>
                                  <div className="space-y-3">
                                    {grupo.procedimentos.map((proc, index) => (
                                      <div
                                        key={`${grupo.key}-proc-${index}-${proc.evento || "evento"}`}
                                        className="rounded-lg border bg-white p-3 text-sm shadow-sm"
                                      >
                                        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
                                          <div>
                                            <p className="text-xs uppercase text-muted-foreground">Evento</p>
                                            <p className="font-medium">{proc.evento || "-"}</p>
                                          </div>
                                          <div>
                                            <p className="text-xs uppercase text-muted-foreground">Descrição</p>
                                            <p className="font-medium break-words whitespace-pre-line">
                                              {proc.descricao || "-"}
                                            </p>
                                          </div>
                                          <div>
                                            <p className="text-xs uppercase text-muted-foreground">Especialidade</p>
                                            <p className="font-medium">{proc.especialidade || "-"}</p>
                                          </div>
                                          <div>
                                            <p className="text-xs uppercase text-muted-foreground">Data</p>
                                            <p className="font-medium">{fmtDate(proc.data_atendimento || proc.data_competencia)}</p>
                                          </div>
                                          <div>
                                            <p className="text-xs uppercase text-muted-foreground">Valor</p>
                                            <p className="font-medium">{fmtCurrency(proc.valor)}</p>
                                          </div>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </TableCell>
                            </TableRow>
                          )}
                        </Fragment>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
              {/* Controles de Paginação */}
              <div className="flex items-center justify-between mt-4">
                <div className="text-sm text-muted-foreground">
                  Mostrando {((paginaAtual - 1) * linhasPorPagina) + 1} a {Math.min(paginaAtual * linhasPorPagina, totalRegistros)} de {fmtNumber(totalRegistros)} registros
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      const novaPagina = Math.max(1, paginaAtual - 1)
                      const sucesso = await recarregarPaginaDetalhados(novaPagina)
                      if (sucesso) {
                        setPaginaAtual(novaPagina)
                      }
                    }}
                    disabled={dadosDetalhados.length === 0 || paginaAtual === 1 || loadingDetalhados}
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Anterior
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    Página {paginaAtual} de {totalPaginas}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      const novaPagina = Math.min(totalPaginas, paginaAtual + 1)
                      const sucesso = await recarregarPaginaDetalhados(novaPagina)
                      if (sucesso) {
                        setPaginaAtual(novaPagina)
                      }
                    }}
                    disabled={dadosDetalhados.length === 0 || paginaAtual >= totalPaginas || loadingDetalhados}
                  >
                    Próxima
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}


