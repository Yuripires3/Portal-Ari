"use client"

import { useEffect, useState, useMemo, useCallback, useRef } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useAuth } from "@/components/auth/auth-provider"
import { useBeneficiariosFilters } from "@/lib/beneficiarios-filters-store"
import { useToast } from "@/hooks/use-toast"
import { Filter, RefreshCw, ChevronDown, Users, UserX, UserCheck, Activity, ChevronRight } from "lucide-react"
import { Checkbox } from "@/components/ui/checkbox"
import { Skeleton } from "@/components/ui/skeleton"
import { useEntidadesPorMes } from "@/hooks/useEntidadesPorMes"
import { useTiposPorMes } from "@/hooks/useTiposPorMes"
import { filterAssimSaude, validateFilters, normalizeCpf } from "@/lib/beneficiarios-filters-utils"
import { PlanDistributionList } from "@/components/sinistralidade/PlanDistributionList"

const fetchNoStore = (input: string, init?: RequestInit) =>
  fetch(input, { ...init, cache: "no-store" })

export default function SinistralidadeDashboardPage() {
  const { user, isLoading: authLoading } = useAuth()
  const router = useRouter()
  const { toast } = useToast()
  const { filters, updateFilters } = useBeneficiariosFilters()
  
  const [entidadeSelectKey, setEntidadeSelectKey] = useState(0)
  const [mesesDropdownOpen, setMesesDropdownOpen] = useState(false)
  const [operadorasDisponiveis, setOperadorasDisponiveis] = useState<string[]>([])
  const [entidadesPorOperadoraGlobal, setEntidadesPorOperadoraGlobal] = useState<Record<string, string[]>>({})
  const [loadingFiltros, setLoadingFiltros] = useState(true)
  
  // Estados para cards de status de vidas
  const [cardsStatusVidas, setCardsStatusVidas] = useState<{
    consolidado: {
      ativo: number
      inativo: number
      nao_localizado: number
      total_vidas: number
      valor_ativo: number
      valor_inativo: number
      valor_nao_localizado: number
      valor_total_geral: number
      por_plano?: {
        ativo: Array<{ plano: string; vidas: number; valor: number }>
        inativo: Array<{ plano: string; vidas: number; valor: number }>
        nao_localizado: Array<{ plano: string; vidas: number; valor: number }>
        total: Array<{ plano: string; vidas: number; valor: number }>
      }
    }
    por_entidade?: {
      ativo: Array<{
        entidade: string
        mes_reajuste?: string | null
        vidas: number
        valor_total: number
        pct_vidas: number
        pct_valor: number
        por_plano?: Array<{ plano: string; vidas: number; valor: number }>
      }>
      inativo: Array<{
        entidade: string
        mes_reajuste?: string | null
        vidas: number
        valor_total: number
        pct_vidas: number
        pct_valor: number
        por_plano?: Array<{ plano: string; vidas: number; valor: number }>
      }>
      nao_localizado: Array<{
        entidade: string
        mes_reajuste?: string | null
        vidas: number
        valor_total: number
        pct_vidas: number
        pct_valor: number
        por_plano?: Array<{ plano: string; vidas: number; valor: number }>
      }>
      total: Array<{
        entidade: string
        mes_reajuste?: string | null
        vidas: number
        valor_total: number
        pct_vidas: number
        pct_valor: number
        por_plano?: Array<{ plano: string; vidas: number; valor: number }>
      }>
    }
  } | null>(null)
  const [loadingCardsStatus, setLoadingCardsStatus] = useState(false)
  
  // Estados para controlar expansão dos drilldowns de planos
  const [planosExpandidos, setPlanosExpandidos] = useState<Set<string>>(new Set())
  const [planosEntidadeExpandidos, setPlanosEntidadeExpandidos] = useState<Set<string>>(new Set())
  
  const togglePlanos = useCallback((key: string) => {
    setPlanosExpandidos(prev => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }, [])
  
  const togglePlanosEntidade = useCallback((key: string) => {
    setPlanosEntidadeExpandidos(prev => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }, [])

  // Ler filtros diretamente do store (com fallbacks seguros)
  const mesesReferencia = useMemo(() => {
    if (Array.isArray(filters?.mesesReferencia) && filters.mesesReferencia.length > 0) {
      return filters.mesesReferencia
    }
    if (filters?.mesReferencia) {
      return [filters.mesReferencia]
    }
    return []
  }, [filters?.mesesReferencia, filters?.mesReferencia])

  const operadoras = useMemo(() => 
    Array.isArray(filters?.operadoras) ? filters.operadoras : [],
    [filters?.operadoras]
  )
  
  const entidades = useMemo(() => 
    Array.isArray(filters?.entidades) ? filters.entidades : [],
    [filters?.entidades]
  )
  
  const tipo = useMemo(() => filters?.tipo || "Todos", [filters?.tipo])
  const cpf = useMemo(() => filters?.cpf || "", [filters?.cpf])
  
  // Estado local para meses de reajuste (não está no store de filtros)
  const [mesesReajuste, setMesesReajuste] = useState<string[]>([])

  // Carregar meses de reajuste disponíveis dos dados já carregados
  const mesesReajusteDisponiveis = useMemo(() => {
    const mesesSet = new Set<string>()
    if (cardsStatusVidas?.por_entidade) {
      try {
        Object.values(cardsStatusVidas.por_entidade).forEach((entidades) => {
          if (Array.isArray(entidades)) {
            entidades.forEach((ent) => {
              if (ent?.mes_reajuste && typeof ent.mes_reajuste === 'string') {
                mesesSet.add(ent.mes_reajuste)
              }
            })
          }
        })
      } catch (error) {
        console.error('Erro ao processar meses de reajuste:', error)
      }
    }
    return Array.from(mesesSet).sort()
  }, [cardsStatusVidas])

  const mesesReajusteDisponiveisParaSelecao = useMemo(() => {
    return mesesReajusteDisponiveis.filter(mes => !mesesReajuste.includes(mes))
  }, [mesesReajusteDisponiveis, mesesReajuste])

  const toggleMesReajuste = useCallback((mes: string) => {
    setMesesReajuste(prev => 
      prev.includes(mes)
        ? prev.filter(m => m !== mes)
        : [...prev, mes]
    )
  }, [])

  // Usar hook otimizado para carregar entidades por mês
  const {
    entidadesDisponiveis,
    entidadesPorOperadora,
    loading: loadingEntidades,
    error: errorEntidades,
    refresh: refreshEntidades,
  } = useEntidadesPorMes(mesesReferencia, operadorasDisponiveis)

  // Usar hook otimizado para carregar tipos por mês
  const {
    tiposDisponiveis,
    loading: loadingTipos,
    error: errorTipos,
    refresh: refreshTipos,
  } = useTiposPorMes(mesesReferencia, operadorasDisponiveis)

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
    if (redirectCheckedRef.current) return
    if (!authLoading && user && user.role !== "admin") {
      redirectCheckedRef.current = true
      router.push("/admin")
    }
  }, [authLoading, user, router])

  // Filtrar operadoras válidas (memoizado)
  const operadorasValidas = useMemo(() => {
    return operadoras.filter(op => operadorasDisponiveis.includes(op))
  }, [operadoras, operadorasDisponiveis])

  // Operadoras disponíveis para seleção (excluindo as já selecionadas)
  // Filtrar para mostrar apenas ASSIM SAÚDE (usando utilitário centralizado)
  const operadorasDisponiveisParaSelecao = useMemo(() => {
    const apenasAssimSaude = filterAssimSaude(operadorasDisponiveis)
    return apenasAssimSaude.filter((op: string) => !operadoras.includes(op))
  }, [operadorasDisponiveis, operadoras])

  // Texto do placeholder baseado nas operadoras selecionadas
  const operadorasPlaceholder = useMemo(() => {
    if (loadingFiltros) return "Carregando..."
    if (operadorasValidas.length === 0) return "Todas"
    if (operadorasValidas.length === 1) return operadorasValidas[0]
    if (operadorasValidas.length <= 2) {
      return operadorasValidas.join(", ")
    }
    return `${operadorasValidas.slice(0, 2).join(", ")} +${operadorasValidas.length - 2}`
  }, [loadingFiltros, operadorasValidas])

  // Garantir que o valor do tipo está na lista disponível (memoizado)
  const tipoValido = useMemo(() => {
    if (!tipo || tipo === "Todos") {
      return "Todos"
    }
    return tiposDisponiveis.includes(tipo) ? tipo : "Todos"
  }, [tipo, tiposDisponiveis])

  // Mostrar erros se houver
  useEffect(() => {
    if (errorEntidades) {
      console.error("Erro ao carregar entidades:", errorEntidades)
    }
    if (errorTipos) {
      console.error("Erro ao carregar tipos:", errorTipos)
    }
  }, [errorEntidades, errorTipos])

  // Filtrar entidades baseado nas operadoras selecionadas E período (meses)
  // O hook useEntidadesPorMes já retorna entidades filtradas por:
  // - Período (meses de referência selecionados)
  // - Operadora ASSIM SAÚDE (hardcoded na API)
  // 
  // Quando há operadoras selecionadas, usar apenas entidadesDisponiveis que já estão
  // filtradas por período E operadora. Não precisamos usar entidadesPorOperadoraGlobal
  // porque o hook já faz esse filtro.
  const entidadesBase = useMemo(() => {
    // Se há operadoras selecionadas, usar apenas entidadesDisponiveis
    // que já estão filtradas por período (meses) E operadora ASSIM SAÚDE
    if (operadorasValidas.length > 0) {
      // entidadesDisponiveis já vem filtrada por período e operadora da API
      // Apenas garantir que está ordenada
      return [...entidadesDisponiveis].sort()
    }
    
    // Se não há operadoras selecionadas, mostrar todas as entidades disponíveis para os meses
    return entidadesDisponiveis
  }, [operadorasValidas, entidadesDisponiveis])

  const entidadesDisponiveisParaSelecao = useMemo(() => {
    return entidadesBase.filter(ent => !entidades.includes(ent))
  }, [entidadesBase, entidades])

  // Callbacks memoizados para evitar re-renders desnecessários
  const toggleOperadora = useCallback((op: string) => {
    const novasOperadoras = operadoras.includes(op)
      ? operadoras.filter(o => o !== op)
      : [...operadoras, op]
    
    // Filtrar entidades para manter apenas as que estão disponíveis para o período atual
    // e pertencem às operadoras selecionadas (entidadesDisponiveis já está filtrada por período e operadora)
    const entidadesValidas = novasOperadoras.length > 0
      ? entidades.filter(ent => entidadesDisponiveis.includes(ent))
      : []
    
    updateFilters({
      operadoras: novasOperadoras,
      entidades: entidadesValidas
    })
    setEntidadeSelectKey(prev => prev + 1)
  }, [operadoras, entidades, entidadesDisponiveis, updateFilters])

  const toggleEntidade = useCallback((ent: string) => {
    updateFilters({
      entidades: entidades.includes(ent)
        ? entidades.filter(e => e !== ent)
        : [...entidades, ent]
    })
  }, [entidades, updateFilters])

  const toggleMes = useCallback((mesValue: string) => {
    const novosMeses = mesesReferencia.includes(mesValue)
      ? mesesReferencia.filter(m => m !== mesValue)
      : [...mesesReferencia, mesValue]
    
    if (novosMeses.length === 0) {
      toast({
        title: "Atenção",
        description: "Pelo menos um mês deve estar selecionado",
        variant: "destructive"
      })
      return
    }

    // Ordenar meses em ordem cronológica
    const mesesOrdenados = [...novosMeses].sort()
    updateFilters({ mesesReferencia: mesesOrdenados })
  }, [mesesReferencia, updateFilters, toast])

  const getTextoMesesSelecionados = () => {
    if (mesesReferencia.length === 0) return "Selecione os meses"
    if (mesesReferencia.length === 1) {
      const [ano, mes] = mesesReferencia[0].split("-")
      const mesObj = mesesDisponiveis.find(m => m.valor === mes)
      return `${mesObj?.nome || mes} ${ano}`
    }
    return `${mesesReferencia.length} meses selecionados`
  }

  const clearFilters = useCallback(() => {
    const hoje = new Date()
    const ano = hoje.getFullYear()
    const mes = String(hoje.getMonth() + 1).padStart(2, "0")
    const mesAtual = `${ano}-${mes}`
    updateFilters({ 
      mesesReferencia: [mesAtual],
      operadoras: [],
      entidades: [],
      tipo: "Todos",
      cpf: "",
    })
    setMesesReajuste([])
    setEntidadeSelectKey(prev => prev + 1)
  }, [updateFilters])

  // Função para atualizar/recarregar dados
  const handleRefresh = useCallback(() => {
    refreshEntidades()
    refreshTipos()
  }, [refreshEntidades, refreshTipos])

  // Função para formatar valores monetários
  const fmtBRL = useCallback((valor: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(valor)
  }, [])

  // Função para formatar números
  const fmtNumber = useCallback((valor: number) => {
    return new Intl.NumberFormat("pt-BR").format(valor)
  }, [])

  // Função auxiliar para formatar nome do mês
  const getNomeMes = useCallback((mesNum: string | null | undefined) => {
    if (!mesNum) return null
    const meses: Record<string, string> = {
      "01": "Janeiro", "02": "Fevereiro", "03": "Março", "04": "Abril",
      "05": "Maio", "06": "Junho", "07": "Julho", "08": "Agosto",
      "09": "Setembro", "10": "Outubro", "11": "Novembro", "12": "Dezembro"
    }
    return meses[mesNum] || mesNum
  }, [])

  // Função para agrupar entidades por entidade e mês de reajuste
  // Ordenação: primeiro por mês de reajuste (maior volume de vidas), depois por entidade (maior quantidade de vidas)
  const agruparEntidadesPorMesReajuste = useCallback((
    entidades: Array<{
      entidade: string
      mes_reajuste?: string | null
      vidas: number
      valor_total: number
      pct_vidas: number
      pct_valor: number
      por_plano?: Array<{ plano: string; vidas: number; valor: number }>
    }>
  ) => {
    // Primeiro, calcular o volume total de vidas por mês de reajuste
    const volumePorMesReajuste = new Map<string | null, number>()
    
    entidades.forEach(ent => {
      const mesReajuste = ent.mes_reajuste || null
      const atual = volumePorMesReajuste.get(mesReajuste) || 0
      volumePorMesReajuste.set(mesReajuste, atual + ent.vidas)
    })

    // Ordenar entidades:
    // 1. Primeiro por mês de reajuste (ordenar pelos meses com maior volume de vidas primeiro)
    // 2. Depois por quantidade de vidas da entidade (maior para menor)
    const resultado = [...entidades].sort((a, b) => {
      const mesA = a.mes_reajuste || null
      const mesB = b.mes_reajuste || null
      
      // Se os meses de reajuste forem diferentes, ordenar pelo volume total do mês
      if (mesA !== mesB) {
        const volumeA = volumePorMesReajuste.get(mesA) || 0
        const volumeB = volumePorMesReajuste.get(mesB) || 0
        
        // Maior volume primeiro
        if (volumeB !== volumeA) {
          return volumeB - volumeA
        }
        
        // Se o volume for igual, ordenar por mês (null primeiro, depois cronologicamente)
        if (!mesA) return -1
        if (!mesB) return 1
        return mesA.localeCompare(mesB)
      }
      
      // Se for o mesmo mês de reajuste, ordenar por quantidade de vidas da entidade (maior para menor)
      if (b.vidas !== a.vidas) {
        return b.vidas - a.vidas
      }
      
      // Se a quantidade de vidas for igual, ordenar por nome da entidade
      return a.entidade.localeCompare(b.entidade)
    })

    return resultado.map((item, index) => ({
      ...item,
      isPrincipal: index === 0 && !item.mes_reajuste
    }))
  }, [])

  // Carregar cards de status de vidas
  useEffect(() => {
    if (mesesReferencia.length === 0) {
      setCardsStatusVidas(null)
      return
    }

    let cancelled = false
    setLoadingCardsStatus(true)

    const loadCardsStatus = async () => {
      try {
        const params = new URLSearchParams({
          meses_referencia: mesesReferencia.join(","),
        })

        if (operadoras.length > 0) {
          params.append("operadoras", operadoras.join(","))
        }

        if (entidades.length > 0) {
          params.append("entidades", entidades.join(","))
        }

        if (tipo && tipo !== "Todos") {
          params.append("tipo", tipo)
        }

        if (cpf) {
          params.append("cpf", cpf)
        }

        if (mesesReajuste.length > 0) {
          params.append("meses_reajuste", mesesReajuste.join(","))
        }

        const res = await fetchNoStore(`/api/sinistralidade/cards-status-vidas?${params}`)
        
        if (cancelled) return

        if (!res.ok) {
          throw new Error("Erro ao carregar cards de status")
        }

        const data = await res.json()
        
        if (cancelled) return

        setCardsStatusVidas(data)
      } catch (error: any) {
        if (cancelled) return
        console.error("Erro ao carregar cards de status:", error)
        toast({
          title: "Erro",
          description: "Não foi possível carregar cards de status",
          variant: "destructive",
        })
      } finally {
        if (!cancelled) {
          setLoadingCardsStatus(false)
        }
      }
    }

    loadCardsStatus()

    return () => {
      cancelled = true
    }
  }, [mesesReferencia, operadoras, entidades, tipo, cpf, mesesReajuste, toast])

  // Validação automática de filtros (usando utilitário centralizado)
  const validacaoExecutadaRef = useRef(false)
  useEffect(() => {
    if (loadingFiltros || loadingTipos || validacaoExecutadaRef.current) {
      return
    }
    
    const updates = validateFilters(filters, {
      operadorasDisponiveis,
      tiposDisponiveis,
    })
    
    // Validar entidades selecionadas contra operadoras selecionadas E período
    // entidadesDisponiveis já está filtrada por período (meses) e operadora ASSIM SAÚDE
    if (operadoras.length > 0 && entidadesDisponiveis.length > 0) {
      const entidadesValidas = entidades.filter(ent => 
        entidadesDisponiveis.includes(ent)
      )
      
      if (entidadesValidas.length !== entidades.length) {
        updates.entidades = entidadesValidas
      }
    }
    
    // Validar tipo selecionado contra tipos disponíveis para o período
    // tiposDisponiveis já está filtrado por período (meses) e operadora ASSIM SAÚDE
    if (tipo && tipo !== "Todos" && tiposDisponiveis.length > 0) {
      if (!tiposDisponiveis.includes(tipo)) {
        updates.tipo = "Todos"
      }
    }
    
    if (Object.keys(updates).length > 0) {
      validacaoExecutadaRef.current = true
      updateFilters(updates)
      if (updates.entidades !== undefined) {
        setEntidadeSelectKey(prev => prev + 1)
      }
    } else {
      validacaoExecutadaRef.current = true
    }
  }, [loadingFiltros, loadingTipos, filters, operadorasDisponiveis, tiposDisponiveis, operadoras, entidades, entidadesDisponiveis, tipo, updateFilters])

  // Carregar filtros disponíveis (apenas uma vez)
  useEffect(() => {
    let cancelled = false
    
    const loadFiltros = async () => {
      try {
        const res = await fetchNoStore("/api/beneficiarios/filtros")
        if (!res.ok) throw new Error("Erro ao carregar filtros")
        const data = await res.json()
        
        if (cancelled) return
        
        // Filtrar apenas ASSIM SAÚDE usando utilitário centralizado
        const operadorasFiltradas = filterAssimSaude(data.operadoras || [])
        setOperadorasDisponiveis(operadorasFiltradas)
        
        // Filtrar entidadesPorOperadora para mostrar apenas ASSIM SAÚDE
        const entidadesPorOperadoraFiltrado: Record<string, string[]> = {}
        operadorasFiltradas.forEach(op => {
          if (data.entidadesPorOperadora && data.entidadesPorOperadora[op]) {
            entidadesPorOperadoraFiltrado[op] = data.entidadesPorOperadora[op]
          }
        })
        setEntidadesPorOperadoraGlobal(entidadesPorOperadoraFiltrado)
        
        setLoadingFiltros(false)
      } catch (error: any) {
        if (cancelled) return
        console.error("Erro ao carregar filtros:", error)
        toast({
          title: "Erro",
          description: "Não foi possível carregar filtros",
          variant: "destructive"
        })
        setLoadingFiltros(false)
      }
    }
    
    loadFiltros()
    
    return () => {
      cancelled = true
    }
  }, [toast])

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
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
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
              <Label>Mês de Reajuste</Label>
              <Select
                onValueChange={(val) => {
                  if (val && val !== "__no-mes-reajuste" && !mesesReajuste.includes(val)) {
                    toggleMesReajuste(val)
                  }
                }}
                disabled={mesesReajusteDisponiveisParaSelecao.length === 0 || !cardsStatusVidas}
              >
                <SelectTrigger>
                  <SelectValue placeholder={mesesReajuste.length === 0 ? "Selecione o mês" : "Adicionar mês"} />
                </SelectTrigger>
                <SelectContent>
                  {mesesReajusteDisponiveisParaSelecao.map(mes => (
                    <SelectItem key={mes} value={mes}>
                      {getNomeMes(mes) || mes}
                    </SelectItem>
                  ))}
                  {mesesReajusteDisponiveisParaSelecao.length === 0 && (
                    <SelectItem value="__no-mes-reajuste" disabled>
                      {mesesReajuste.length > 0 ? "Todos os meses selecionados" : "Nenhum mês disponível"}
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
              {mesesReajuste.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {mesesReajuste.map(mes => (
                    <span
                      key={mes}
                      className="inline-flex items-center gap-1 px-2 py-1 bg-zinc-100 dark:bg-zinc-800 rounded-md text-sm"
                    >
                      {getNomeMes(mes) || mes}
                      <button
                        onClick={() => toggleMesReajuste(mes)}
                        className="hover:text-red-500"
                        aria-label={`Remover ${getNomeMes(mes)}`}
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
                disabled={loadingFiltros || loadingTipos}
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
            <div className="space-y-2">
              <Label>CPF</Label>
              <Input
                value={cpf}
                onChange={(event) =>
                  updateFilters({
                    cpf: normalizeCpf(event.target.value),
                  })
                }
                placeholder="Somente números"
                maxLength={14}
              />
            </div>
          </div>
          <div className="mt-4 flex flex-col items-end gap-1">
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={clearFilters}>
                Limpar
              </Button>
              <Button 
                size="sm" 
                onClick={handleRefresh}
                disabled={loadingEntidades || loadingTipos || loadingFiltros}
                className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
              >
                <RefreshCw className={`h-4 w-4 ${loadingEntidades || loadingTipos ? "animate-spin" : ""}`} />
                Atualizar
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Cards de Status de Vidas com Entidades */}
      {mesesReferencia.length > 0 && (() => {
        const temNaoLocalizados = (cardsStatusVidas?.consolidado?.nao_localizado || 0) > 0
        const gridCols = temNaoLocalizados ? "sm:grid-cols-2 lg:grid-cols-4" : "sm:grid-cols-2 lg:grid-cols-3"
        
        return (
        <div className={`grid gap-6 ${gridCols} mt-6`}>
          {/* Coluna 1 – Total de Vidas + entidades de total */}
          <div className="space-y-3 lg:border-r lg:border-slate-200 lg:pr-4">
            <Card className="bg-white rounded-2xl shadow-sm border-zinc-200/70">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Total de Vidas</CardTitle>
                <Activity className="h-4 w-4 text-primary" />
              </CardHeader>
              <CardContent>
                {loadingCardsStatus ? (
                  <>
                    <Skeleton className="h-8 w-32 mb-2" />
                    <Skeleton className="h-4 w-24" />
                  </>
                ) : (
                  <>
                    <div className="text-2xl font-bold">
                      {fmtNumber(cardsStatusVidas?.consolidado?.total_vidas || 0)}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Valor Total: {fmtBRL(cardsStatusVidas?.consolidado?.valor_total_geral || 0)}
                    </p>
                    {/* Distribuição por plano - Drilldown */}
                    {cardsStatusVidas?.consolidado?.por_plano?.total && cardsStatusVidas.consolidado.por_plano.total.length > 0 && (
                      <div className="mt-4 pt-3 border-t border-slate-200">
                        <button
                          onClick={() => togglePlanos('total')}
                          className="w-full flex items-center justify-between text-xs font-medium text-[#184286] hover:text-[#184286]/80 transition-colors mb-2"
                        >
                          <span>Distribuição por plano</span>
                          <ChevronRight 
                            className={`h-4 w-4 transition-transform ${planosExpandidos.has('total') ? 'rotate-90' : ''}`} 
                          />
                        </button>
                        {planosExpandidos.has('total') && (
                          <PlanDistributionList
                            planos={cardsStatusVidas.consolidado.por_plano.total}
                            totalVidas={cardsStatusVidas.consolidado.total_vidas || 0}
                          />
                        )}
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
            
            {/* Cards de Entidades - Total */}
            {cardsStatusVidas?.por_entidade?.total && cardsStatusVidas.por_entidade.total.length > 0 && (
              <div className="space-y-2">
                {agruparEntidadesPorMesReajuste(
                  mesesReajuste.length > 0
                    ? cardsStatusVidas.por_entidade.total.filter(ent => 
                        !ent.mes_reajuste || mesesReajuste.includes(ent.mes_reajuste)
                      )
                    : cardsStatusVidas.por_entidade.total
                ).map((entidade, index) => {
                  const nomeExibicao = entidade.mes_reajuste 
                    ? `${entidade.entidade} ${getNomeMes(entidade.mes_reajuste)}`
                    : entidade.entidade
                  const key = entidade.mes_reajuste 
                    ? `total-${entidade.entidade}-${entidade.mes_reajuste}`
                    : `total-${entidade.entidade}`
                  
                  return (
                    <div
                      key={key}
                      className="bg-white rounded-xl border border-slate-200 p-3.5 hover:shadow-sm transition-shadow cursor-pointer"
                      title={`Entidade: ${nomeExibicao}\nTotal de vidas: ${fmtNumber(entidade.vidas)}\nValor em procedimentos: ${fmtBRL(entidade.valor_total)}\nParticipação em valor: ${(entidade.pct_valor * 100).toFixed(1)}%`}
                    >
                      <div className="text-sm font-medium truncate text-slate-900">{nomeExibicao}</div>
                      <div className="text-lg font-bold mt-1 text-slate-900">{fmtNumber(entidade.vidas)}</div>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {(entidade.pct_vidas * 100).toFixed(1)}% do total de vidas
                      </p>
                      <div className="mt-2">
                        <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-primary"
                            style={{ width: `${Math.min(entidade.pct_vidas * 100, 100)}%` }}
                          />
                        </div>
                      </div>
                      {/* Distribuição por plano - Drilldown */}
                      {entidade.por_plano && entidade.por_plano.length > 0 && (
                        <div className="mt-3 pt-2 border-t border-slate-200">
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              togglePlanosEntidade(key)
                            }}
                            className="w-full flex items-center justify-between text-xs font-medium text-[#184286] hover:text-[#184286]/80 transition-colors mb-2"
                          >
                            <span>Distribuição por plano</span>
                            <ChevronRight 
                              className={`h-3 w-3 transition-transform ${planosEntidadeExpandidos.has(key) ? 'rotate-90' : ''}`} 
                            />
                          </button>
                          {planosEntidadeExpandidos.has(key) && (
                            <PlanDistributionList
                              planos={entidade.por_plano}
                              totalVidas={entidade.vidas || 0}
                            />
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Coluna 2 – Vidas Ativas + entidades ativas */}
          <div className="space-y-3 lg:border-r lg:border-slate-200 lg:px-4">
            <Card className="bg-white rounded-2xl shadow-sm border-zinc-200/70">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Vidas Ativas</CardTitle>
                <UserCheck className="h-4 w-4 text-green-600" />
              </CardHeader>
              <CardContent>
                {loadingCardsStatus ? (
                  <>
                    <Skeleton className="h-8 w-32 mb-2" />
                    <Skeleton className="h-4 w-24" />
                  </>
                ) : (
                  <>
                    <div className="text-2xl font-bold">
                      {fmtNumber(cardsStatusVidas?.consolidado?.ativo || 0)}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Valor: {fmtBRL(cardsStatusVidas?.consolidado?.valor_ativo || 0)}
                    </p>
                    {/* Distribuição por plano - Drilldown */}
                    {cardsStatusVidas?.consolidado?.por_plano?.ativo && cardsStatusVidas.consolidado.por_plano.ativo.length > 0 && (
                      <div className="mt-4 pt-3 border-t border-slate-200">
                        <button
                          onClick={() => togglePlanos('ativo')}
                          className="w-full flex items-center justify-between text-xs font-medium text-[#184286] hover:text-[#184286]/80 transition-colors mb-2"
                        >
                          <span>Distribuição por plano</span>
                          <ChevronRight 
                            className={`h-4 w-4 transition-transform ${planosExpandidos.has('ativo') ? 'rotate-90' : ''}`} 
                          />
                        </button>
                        {planosExpandidos.has('ativo') && (
                          <PlanDistributionList
                            planos={cardsStatusVidas.consolidado.por_plano.ativo}
                            totalVidas={cardsStatusVidas.consolidado.ativo || 0}
                          />
                        )}
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
            
            {/* Cards de Entidades - Ativas */}
            {cardsStatusVidas?.por_entidade?.ativo && cardsStatusVidas.por_entidade.ativo.length > 0 && (
              <div className="space-y-2">
                {agruparEntidadesPorMesReajuste(
                  mesesReajuste.length > 0
                    ? cardsStatusVidas.por_entidade.ativo.filter(ent => 
                        !ent.mes_reajuste || mesesReajuste.includes(ent.mes_reajuste)
                      )
                    : cardsStatusVidas.por_entidade.ativo
                ).map((entidade) => {
                  const nomeExibicao = entidade.mes_reajuste 
                    ? `${entidade.entidade} ${getNomeMes(entidade.mes_reajuste)}`
                    : entidade.entidade
                  const key = entidade.mes_reajuste 
                    ? `ativo-${entidade.entidade}-${entidade.mes_reajuste}`
                    : `ativo-${entidade.entidade}`
                  
                  return (
                    <div
                      key={key}
                      className="bg-white rounded-xl border border-slate-200 p-3.5 hover:shadow-sm transition-shadow cursor-pointer"
                      title={`Entidade: ${nomeExibicao}\nVidas ativas: ${fmtNumber(entidade.vidas)}\nValor em procedimentos: ${fmtBRL(entidade.valor_total)}\nParticipação em valor: ${(entidade.pct_valor * 100).toFixed(1)}%`}
                    >
                      <div className="text-sm font-medium truncate text-slate-900">{nomeExibicao}</div>
                      <div className="text-lg font-bold mt-1 text-slate-900">{fmtNumber(entidade.vidas)}</div>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {(entidade.pct_vidas * 100).toFixed(1)}% das vidas ativas
                      </p>
                      <div className="mt-2">
                        <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-emerald-500"
                            style={{ width: `${Math.min(entidade.pct_vidas * 100, 100)}%` }}
                          />
                        </div>
                      </div>
                      {/* Distribuição por plano - Drilldown */}
                      {entidade.por_plano && entidade.por_plano.length > 0 && (
                        <div className="mt-3 pt-2 border-t border-slate-200">
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              togglePlanosEntidade(key)
                            }}
                            className="w-full flex items-center justify-between text-xs font-medium text-[#184286] hover:text-[#184286]/80 transition-colors mb-2"
                          >
                            <span>Distribuição por plano</span>
                            <ChevronRight 
                              className={`h-3 w-3 transition-transform ${planosEntidadeExpandidos.has(key) ? 'rotate-90' : ''}`} 
                            />
                          </button>
                          {planosEntidadeExpandidos.has(key) && (
                            <PlanDistributionList
                              planos={entidade.por_plano}
                              totalVidas={entidade.vidas || 0}
                            />
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Coluna 3 – Vidas Inativas + entidades inativas */}
          <div className={`space-y-3 ${temNaoLocalizados ? 'lg:border-r lg:border-slate-200 lg:px-4' : 'lg:border-r lg:border-slate-200 lg:px-4'}`}>
            <Card className="bg-white rounded-2xl shadow-sm border-zinc-200/70">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Vidas Inativas</CardTitle>
                <UserX className="h-4 w-4 text-red-600" />
              </CardHeader>
              <CardContent>
                {loadingCardsStatus ? (
                  <>
                    <Skeleton className="h-8 w-32 mb-2" />
                    <Skeleton className="h-4 w-24" />
                  </>
                ) : (
                  <>
                    <div className="text-2xl font-bold">
                      {fmtNumber(cardsStatusVidas?.consolidado?.inativo || 0)}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Valor: {fmtBRL(cardsStatusVidas?.consolidado?.valor_inativo || 0)}
                    </p>
                    {/* Distribuição por plano - Drilldown */}
                    {cardsStatusVidas?.consolidado?.por_plano?.inativo && cardsStatusVidas.consolidado.por_plano.inativo.length > 0 && (
                      <div className="mt-4 pt-3 border-t border-slate-200">
                        <button
                          onClick={() => togglePlanos('inativo')}
                          className="w-full flex items-center justify-between text-xs font-medium text-[#184286] hover:text-[#184286]/80 transition-colors mb-2"
                        >
                          <span>Distribuição por plano</span>
                          <ChevronRight 
                            className={`h-4 w-4 transition-transform ${planosExpandidos.has('inativo') ? 'rotate-90' : ''}`} 
                          />
                        </button>
                        {planosExpandidos.has('inativo') && (
                          <PlanDistributionList
                            planos={cardsStatusVidas.consolidado.por_plano.inativo}
                            totalVidas={cardsStatusVidas.consolidado.inativo || 0}
                          />
                        )}
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
            
            {/* Cards de Entidades - Inativas */}
            {cardsStatusVidas?.por_entidade?.inativo && cardsStatusVidas.por_entidade.inativo.length > 0 && (
              <div className="space-y-2">
                {agruparEntidadesPorMesReajuste(
                  mesesReajuste.length > 0
                    ? cardsStatusVidas.por_entidade.inativo.filter(ent => 
                        !ent.mes_reajuste || mesesReajuste.includes(ent.mes_reajuste)
                      )
                    : cardsStatusVidas.por_entidade.inativo
                ).map((entidade) => {
                  const nomeExibicao = entidade.mes_reajuste 
                    ? `${entidade.entidade} ${getNomeMes(entidade.mes_reajuste)}`
                    : entidade.entidade
                  const key = entidade.mes_reajuste 
                    ? `inativo-${entidade.entidade}-${entidade.mes_reajuste}`
                    : `inativo-${entidade.entidade}`
                  
                  return (
                    <div
                      key={key}
                      className="bg-white rounded-xl border border-slate-200 p-3.5 hover:shadow-sm transition-shadow cursor-pointer"
                      title={`Entidade: ${nomeExibicao}\nVidas inativas: ${fmtNumber(entidade.vidas)}\nValor em procedimentos: ${fmtBRL(entidade.valor_total)}\nParticipação em valor: ${(entidade.pct_valor * 100).toFixed(1)}%`}
                    >
                      <div className="text-sm font-medium truncate text-slate-900">{nomeExibicao}</div>
                      <div className="text-lg font-bold mt-1 text-slate-900">{fmtNumber(entidade.vidas)}</div>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {(entidade.pct_vidas * 100).toFixed(1)}% das vidas inativas
                      </p>
                      <div className="mt-2">
                        <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-red-500"
                            style={{ width: `${Math.min(entidade.pct_vidas * 100, 100)}%` }}
                          />
                        </div>
                      </div>
                      {/* Distribuição por plano - Drilldown */}
                      {entidade.por_plano && entidade.por_plano.length > 0 && (
                        <div className="mt-3 pt-2 border-t border-slate-200">
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              togglePlanosEntidade(key)
                            }}
                            className="w-full flex items-center justify-between text-xs font-medium text-[#184286] hover:text-[#184286]/80 transition-colors mb-2"
                          >
                            <span>Distribuição por plano</span>
                            <ChevronRight 
                              className={`h-3 w-3 transition-transform ${planosEntidadeExpandidos.has(key) ? 'rotate-90' : ''}`} 
                            />
                          </button>
                          {planosEntidadeExpandidos.has(key) && (
                            <PlanDistributionList
                              planos={entidade.por_plano}
                              totalVidas={entidade.vidas || 0}
                            />
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Coluna 4 – Vidas Não Localizadas + entidades correspondentes */}
          {temNaoLocalizados && (
          <div className="space-y-3 lg:px-4">
            <Card className="bg-white rounded-2xl shadow-sm border-zinc-200/70">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Vidas Não Localizadas</CardTitle>
                <Users className="h-4 w-4 text-yellow-600" />
              </CardHeader>
              <CardContent>
                {loadingCardsStatus ? (
                  <>
                    <Skeleton className="h-8 w-32 mb-2" />
                    <Skeleton className="h-4 w-24" />
                  </>
                ) : (
                  <>
                    <div className="text-2xl font-bold">
                      {fmtNumber(cardsStatusVidas?.consolidado?.nao_localizado || 0)}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Valor: {fmtBRL(cardsStatusVidas?.consolidado?.valor_nao_localizado || 0)}
                    </p>
                    {/* Distribuição por plano - Drilldown */}
                    {cardsStatusVidas?.consolidado?.por_plano?.nao_localizado && cardsStatusVidas.consolidado.por_plano.nao_localizado.length > 0 && (
                      <div className="mt-4 pt-3 border-t border-slate-200">
                        <button
                          onClick={() => togglePlanos('nao_localizado')}
                          className="w-full flex items-center justify-between text-xs font-medium text-[#184286] hover:text-[#184286]/80 transition-colors mb-2"
                        >
                          <span>Distribuição por plano</span>
                          <ChevronRight 
                            className={`h-4 w-4 transition-transform ${planosExpandidos.has('nao_localizado') ? 'rotate-90' : ''}`} 
                          />
                        </button>
                        {planosExpandidos.has('nao_localizado') && (
                          <PlanDistributionList
                            planos={cardsStatusVidas.consolidado.por_plano.nao_localizado}
                            totalVidas={cardsStatusVidas.consolidado.nao_localizado || 0}
                          />
                        )}
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
            
            {/* Cards de Entidades - Não Localizadas */}
            {cardsStatusVidas?.por_entidade?.nao_localizado && cardsStatusVidas.por_entidade.nao_localizado.length > 0 && (
              <div className="space-y-2">
                {agruparEntidadesPorMesReajuste(
                  mesesReajuste.length > 0
                    ? cardsStatusVidas.por_entidade.nao_localizado.filter(ent => 
                        !ent.mes_reajuste || mesesReajuste.includes(ent.mes_reajuste)
                      )
                    : cardsStatusVidas.por_entidade.nao_localizado
                ).map((entidade) => {
                  const nomeExibicao = entidade.mes_reajuste 
                    ? `${entidade.entidade} ${getNomeMes(entidade.mes_reajuste)}`
                    : entidade.entidade
                  const key = entidade.mes_reajuste 
                    ? `nao_localizado-${entidade.entidade}-${entidade.mes_reajuste}`
                    : `nao_localizado-${entidade.entidade}`
                  
                  return (
                    <div
                      key={key}
                      className="bg-white rounded-xl border border-slate-200 p-3.5 hover:shadow-sm transition-shadow cursor-pointer"
                      title={`Entidade: ${nomeExibicao}\nVidas não localizadas: ${fmtNumber(entidade.vidas)}\nValor em procedimentos: ${fmtBRL(entidade.valor_total)}\nParticipação em valor: ${(entidade.pct_valor * 100).toFixed(1)}%`}
                    >
                      <div className="text-sm font-medium truncate text-slate-900">{nomeExibicao}</div>
                      <div className="text-lg font-bold mt-1 text-slate-900">{fmtNumber(entidade.vidas)}</div>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {(entidade.pct_vidas * 100).toFixed(1)}% das vidas não localizadas
                      </p>
                      <div className="mt-2">
                        <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-yellow-500"
                            style={{ width: `${Math.min(entidade.pct_vidas * 100, 100)}%` }}
                          />
                        </div>
                      </div>
                      {/* Distribuição por plano - Drilldown */}
                      {entidade.por_plano && entidade.por_plano.length > 0 && (
                        <div className="mt-3 pt-2 border-t border-slate-200">
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              togglePlanosEntidade(key)
                            }}
                            className="w-full flex items-center justify-between text-xs font-medium text-[#184286] hover:text-[#184286]/80 transition-colors mb-2"
                          >
                            <span>Distribuição por plano</span>
                            <ChevronRight 
                              className={`h-3 w-3 transition-transform ${planosEntidadeExpandidos.has(key) ? 'rotate-90' : ''}`} 
                            />
                          </button>
                          {planosEntidadeExpandidos.has(key) && (
                            <PlanDistributionList
                              planos={entidade.por_plano}
                              totalVidas={entidade.vidas || 0}
                            />
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
          )}
        </div>
        )
      })()}

    </div>
  )
}
