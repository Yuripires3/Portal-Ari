"use client"

import { useEffect, useState, useMemo, useCallback } from "react"
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

type VidasAtivasPorMes = {
  mes_referencia: string
  vidas_ativas: number
}

export default function SinistralidadeDashboardPage() {
  const { user, isLoading: authLoading } = useAuth()
  const router = useRouter()
  const { toast } = useToast()
  const { filters, updateFilters, resetFilters } = useBeneficiariosFilters()
  
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
  const [dadosCarregadosInicialmente, setDadosCarregadosInicialmente] = useState(false)
  const [paginaAtual, setPaginaAtual] = useState(1)
  const linhasPorPagina = 20

  // Extrair valores com fallbacks seguros
  // Se não houver meses selecionados, usar o mês atual como padrão
  const mesesReferencia = useMemo(() => {
    if (Array.isArray(filters?.mesesReferencia) && filters.mesesReferencia.length > 0) {
      return filters.mesesReferencia
    }
    if (filters?.mesReferencia) {
      return [filters.mesReferencia]
    }
    // Usar o mês atual como padrão
    const hoje = new Date()
    const ano = hoje.getFullYear()
    const mes = String(hoje.getMonth() + 1).padStart(2, "0")
    return [`${ano}-${mes}`]
  }, [filters?.mesesReferencia, filters?.mesReferencia])
  
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

  useEffect(() => {
    if (!authLoading && user && user.role !== "admin") {
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
    if (!tipo || tipo === "Todos") return "Todos"
    return tiposDisponiveis.includes(tipo) ? tipo : "Todos"
  }, [tipo, tiposDisponiveis])

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

  // Carregar filtros disponíveis
  useEffect(() => {
    const loadFiltros = async () => {
      try {
        const res = await fetchNoStore("/api/beneficiarios/filtros")
        if (!res.ok) throw new Error("Erro ao carregar filtros")
        const data = await res.json()
        setOperadorasDisponiveis(data.operadoras || [])
        setEntidadesDisponiveis(data.entidades || [])
        setEntidadesPorOperadora(data.entidadesPorOperadora || {})
        setTiposDisponiveis(data.tipos || [])
      } catch (error: any) {
        console.error("Erro ao carregar filtros:", error)
        toast({
          title: "Erro",
          description: "Não foi possível carregar filtros",
          variant: "destructive"
        })
      } finally {
        setLoadingFiltros(false)
        signalPageLoaded()
      }
    }
    loadFiltros()
  }, [toast, filters?.mesesReferencia, filters?.mesReferencia, updateFilters])

  useEffect(() => {
    if (loadingFiltros) return

    // Corrigir valores inválidos quando os filtros carregarem
    const operadorasInvalidas = operadoras.filter(op => !operadorasDisponiveis.includes(op))
    if (operadorasInvalidas.length > 0) {
      updateFilters({ 
        operadoras: operadoras.filter(op => operadorasDisponiveis.includes(op)),
        entidades: [] 
      })
      setEntidadeSelectKey(prev => prev + 1)
    }
    if (tipo && tipo !== "Todos" && !tiposDisponiveis.includes(tipo)) {
      updateFilters({ tipo: "Todos" })
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
  const loadDadosDetalhados = useCallback(async (dataInicio: string, dataFim: string, pagina: number = 1) => {
    setLoadingDetalhados(true)
    try {
      const params = new URLSearchParams({
        data_inicio: dataInicio,
        data_fim: dataFim,
        pagina: pagina.toString(),
        limite: "20",
      })
      if (operadorasValidas.length > 0) params.append("operadoras", operadorasValidas.join(","))
      if (entidades.length > 0) params.append("entidades", entidades.join(","))
      if (tipoValido && tipoValido !== "Todos") params.append("tipo", tipoValido)

      const res = await fetchNoStore(`/api/beneficiarios/detalhados?${params}`)
      if (!res.ok) throw new Error("Erro ao carregar dados detalhados")
      
      const data = await res.json()
      setDadosDetalhados(data.dados || [])
      setTotalRegistros(data.total || 0)
      setTotalPaginas(data.totalPaginas || 1)
      if (pagina === 1) {
        setPaginaAtual(1) // Resetar apenas se for primeira página
      }
    } catch (error: any) {
      console.error("Erro ao carregar dados detalhados:", error)
      toast({
        title: "Erro",
        description: error.message || "Não foi possível carregar dados detalhados",
        variant: "destructive"
      })
      setDadosDetalhados([])
    } finally {
      setLoadingDetalhados(false)
    }
  }, [operadorasValidas, entidades, tipoValido, toast])

  // Carregar dados de vidas ativas
  const loadVidasAtivas = useCallback(async () => {
    if (!mesesReferencia || mesesReferencia.length === 0) return

    // Ordenar os meses para identificar o mais recente dos meses filtrados
    const mesesOrdenados = [...mesesReferencia].sort()
    const mesMaisRecente = mesesOrdenados[mesesOrdenados.length - 1]
    
    // Calcular os 12 meses para o gráfico: mês mais recente filtrado + 11 meses anteriores
    const mesesParaGrafico = calcular12MesesParaGrafico(mesMaisRecente)
    
    // data_inicio será o primeiro dia do mês mais antigo (primeiro dos 12 meses)
    const [anoInicio, mesInicio] = mesesParaGrafico[0].split("-")
    const dataInicio = `${anoInicio}-${mesInicio}-01`

    // data_fim será o último dia do mês mais recente filtrado
    const [anoFim, mesFim] = mesMaisRecente.split("-")
    const anoNum = parseInt(anoFim)
    const mesNum = parseInt(mesFim) // mesNum está em formato 1-12
    // Calcular último dia do mês: JavaScript Date usa mês 0-indexed
    // new Date(ano, mesNum, 0) onde mesNum está em formato 1-12 retorna último dia do mês (mesNum-1)
    // Para pegar último dia do mês atual (mesNum), usamos new Date(ano, mesNum + 1, 0)
    const ultimoDia = new Date(anoNum, mesNum + 1, 0).getDate()
    const dataFim = `${anoFim}-${mesFim}-${String(ultimoDia).padStart(2, "0")}`

    setLoading(true)
    try {
      const params = new URLSearchParams({
        data_inicio: dataInicio,
        data_fim: dataFim,
      })
      if (operadorasValidas.length > 0) params.append("operadoras", operadorasValidas.join(","))
      if (entidades.length > 0) params.append("entidades", entidades.join(","))
      if (tipoValido && tipoValido !== "Todos") params.append("tipo", tipoValido)

      const res = await fetchNoStore(`/api/beneficiarios/ativos?${params}`)
      if (!res.ok) throw new Error("Erro ao carregar vidas ativas")
      
      const data = await res.json()
      
      // Criar um mapa dos dados retornados para busca rápida
      const dadosPorMes = new Map<string, VidasAtivasPorMes>()
      ;(data || []).forEach((item: VidasAtivasPorMes) => {
        dadosPorMes.set(item.mes_referencia, item)
      })
      
      // Garantir que todos os 12 meses estejam presentes no gráfico
      const vidasCompletas = mesesParaGrafico.map(mes => {
        const dadosDoMes = dadosPorMes.get(mes)
        if (dadosDoMes) {
          return dadosDoMes
        }
        return { mes_referencia: mes, vidas_ativas: 0 }
      })
      
      setVidasAtivas(vidasCompletas)
      
      // Carregar dados detalhados também (primeira página)
      await loadDadosDetalhados(dataInicio, dataFim, 1)
    } catch (error: any) {
      console.error("Erro ao carregar vidas ativas:", error)
      toast({
        title: "Erro",
        description: error.message || "Não foi possível carregar dados",
        variant: "destructive"
      })
      setVidasAtivas([])
    } finally {
      setLoading(false)
      signalPageLoaded()
    }
  }, [mesesReferencia, operadorasValidas, entidades, tipoValido, toast, loadDadosDetalhados])

  // Garantir que sempre haja pelo menos um mês selecionado
  useEffect(() => {
    if (mesesReferencia.length === 0 && !loadingFiltros) {
      // Usar o mês atual como padrão
      const hoje = new Date()
      const ano = hoje.getFullYear()
      const mes = String(hoje.getMonth() + 1).padStart(2, "0")
      const mesAtual = `${ano}-${mes}`
      updateFilters({ mesesReferencia: [mesAtual] })
    }
  }, [mesesReferencia, loadingFiltros, updateFilters])

  // Carregar dados apenas uma vez quando a página monta (após filtros carregarem)
  useEffect(() => {
    if (!loadingFiltros && mesesReferencia.length > 0 && !dadosCarregadosInicialmente) {
      loadVidasAtivas()
      setDadosCarregadosInicialmente(true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadingFiltros]) // Carregar apenas quando os filtros terminarem de carregar pela primeira vez

  const fmtNumber = (v: number) => 
    new Intl.NumberFormat("pt-BR").format(v)

  const fmtCurrency = (v: number | null | undefined) => {
    if (v === null || v === undefined) return '-'
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v)
  }

  const fmtMes = (mes: string) => {
    const [ano, mesNum] = mes.split("-")
    const date = new Date(parseInt(ano), parseInt(mesNum) - 1, 1)
    return date.toLocaleDateString("pt-BR", { month: "short", year: "numeric" })
  }

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
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={clearFilters}>
              Limpar
            </Button>
            <Button onClick={() => loadVidasAtivas()} size="sm" className="gap-2" disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              Atualizar
            </Button>
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
              <BarChart data={vidasAtivas.map(item => ({ ...item, mes: fmtMes(item.mes_referencia) }))}>
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
                      <TableHead>Operadora</TableHead>
                      <TableHead>Plano</TableHead>
                      <TableHead>CPF</TableHead>
                      <TableHead>Nome</TableHead>
                      <TableHead>Entidade</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Idade</TableHead>
                      <TableHead>Evento</TableHead>
                      <TableHead>Descrição</TableHead>
                      <TableHead>Especialidade</TableHead>
                      <TableHead>Valor</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dadosDetalhados.map((row, index) => (
                      <TableRow key={`${row.CPF}-${index}-${row.EVENTO || ''}-${row.DATA_COMPETENCIA || ''}`}>
                        <TableCell>{row.OPERADORA || '-'}</TableCell>
                        <TableCell>{row.PLANO || '-'}</TableCell>
                        <TableCell>{row.CPF || '-'}</TableCell>
                        <TableCell>{row.NOME || '-'}</TableCell>
                        <TableCell>{row.ENTIDADE || '-'}</TableCell>
                        <TableCell>{row.STATUS || '-'}</TableCell>
                        <TableCell>{row.IDADE || '-'}</TableCell>
                        <TableCell>{row.EVENTO || '-'}</TableCell>
                        <TableCell>{row.DESCRICAO || '-'}</TableCell>
                        <TableCell>{row.ESPECIALIDADE || '-'}</TableCell>
                        <TableCell>{fmtCurrency(row.VALOR)}</TableCell>
                      </TableRow>
                    ))}
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
                      setPaginaAtual(novaPagina)
                      // Recalcular datas para recarregar
                      const mesesOrdenados = [...mesesReferencia].sort()
                      const mesMaisRecente = mesesOrdenados[mesesOrdenados.length - 1]
                      const mesesParaGrafico = calcular12MesesParaGrafico(mesMaisRecente)
                      const [anoInicio, mesInicio] = mesesParaGrafico[0].split("-")
                      const dataInicio = `${anoInicio}-${mesInicio}-01`
                      const [anoFim, mesFim] = mesMaisRecente.split("-")
                      const anoNum = parseInt(anoFim)
                      const mesNum = parseInt(mesFim)
                      const ultimoDia = new Date(anoNum, mesNum + 1, 0).getDate()
                      const dataFim = `${anoFim}-${mesFim}-${String(ultimoDia).padStart(2, "0")}`
                      await loadDadosDetalhados(dataInicio, dataFim, novaPagina)
                    }}
                    disabled={paginaAtual === 1 || loadingDetalhados}
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
                      setPaginaAtual(novaPagina)
                      // Recalcular datas para recarregar
                      const mesesOrdenados = [...mesesReferencia].sort()
                      const mesMaisRecente = mesesOrdenados[mesesOrdenados.length - 1]
                      const mesesParaGrafico = calcular12MesesParaGrafico(mesMaisRecente)
                      const [anoInicio, mesInicio] = mesesParaGrafico[0].split("-")
                      const dataInicio = `${anoInicio}-${mesInicio}-01`
                      const [anoFim, mesFim] = mesMaisRecente.split("-")
                      const anoNum = parseInt(anoFim)
                      const mesNum = parseInt(mesFim)
                      const ultimoDia = new Date(anoNum, mesNum + 1, 0).getDate()
                      const dataFim = `${anoFim}-${mesFim}-${String(ultimoDia).padStart(2, "0")}`
                      await loadDadosDetalhados(dataInicio, dataFim, novaPagina)
                    }}
                    disabled={paginaAtual >= totalPaginas || loadingDetalhados}
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

