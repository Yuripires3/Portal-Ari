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
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Checkbox } from "@/components/ui/checkbox"

const fetchNoStore = (input: string, init?: RequestInit) =>
  fetch(input, { ...init, cache: "no-store" })

export default function AnaliseBeneficiariosPage() {
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
  const [dadosDetalhados, setDadosDetalhados] = useState<any[]>([])
  const [dadosNaoIdentificados, setDadosNaoIdentificados] = useState<any[]>([])
  const [totalRegistros, setTotalRegistros] = useState(0)
  const [totalPaginas, setTotalPaginas] = useState(1)
  const [loadingDetalhados, setLoadingDetalhados] = useState(false)
  const [paginaAtual, setPaginaAtual] = useState(1)
  const [expandedRowKeys, setExpandedRowKeys] = useState<Set<string>>(() => new Set())
  const [expandedRowKeysNaoIdentificados, setExpandedRowKeysNaoIdentificados] = useState<Set<string>>(() => new Set())
  const expandedRowKeysRef = useRef<Set<string>>(new Set())
  const linhasPorPagina = 20

  // Ler filtros diretamente do store
  const mesesReferencia = Array.isArray(filters?.mesesReferencia) && filters.mesesReferencia.length > 0
    ? filters.mesesReferencia
    : filters?.mesReferencia
    ? [filters.mesReferencia]
    : []
  const operadoras = Array.isArray(filters?.operadoras) ? filters.operadoras : []
  const entidades = Array.isArray(filters?.entidades) ? filters.entidades : []
  const tipo = filters?.tipo || "Todos"
  const cpf = filters?.cpf || ""

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

  // Filtrar operadoras válidas
  const operadorasValidas = useMemo(() => {
    return operadoras.filter(op => operadorasDisponiveis.includes(op))
  }, [operadoras, operadorasDisponiveis])

  // Operadoras disponíveis para seleção (excluindo as já selecionadas)
  // Filtrar para mostrar apenas ASSIM SAÚDE
  const operadorasDisponiveisParaSelecao = useMemo(() => {
    const apenasAssimSaude = operadorasDisponiveis.filter(
      (op: string) => op.toUpperCase() === "ASSIM SAÚDE" || op.toUpperCase() === "ASSIM SAUDE"
    )
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

  // Garantir que o valor do tipo está na lista disponível
  const tipoValido = useMemo(() => {
    if (!tipo || tipo === "Todos") {
      return "Todos"
    }
    return tiposDisponiveis.includes(tipo) ? tipo : "Todos"
  }, [tipo, tiposDisponiveis])

  const entidadesBase = useMemo(() => {
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
      entidades: []
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
    
    if (novosMeses.length === 0) {
      toast({
        title: "Atenção",
        description: "Pelo menos um mês deve estar selecionado",
        variant: "destructive"
      })
      return
    }

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
    setEntidadeSelectKey(prev => prev + 1)
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
      cpf?: string
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
      const cpfFiltro = overrides?.cpf ?? cpf

      if (operadorasFiltro.length > 0) params.append("operadoras", operadorasFiltro.join(","))
      if (entidadesFiltro.length > 0) params.append("entidades", entidadesFiltro.join(","))
      if (tipoFiltro && tipoFiltro !== "Todos") params.append("tipo", tipoFiltro)
      if (cpfFiltro) params.append("cpf", cpfFiltro)
      if (mesesFiltrados && mesesFiltrados.length > 0) params.append("meses_referencia", mesesFiltrados.join(","))

      const res = await fetchNoStore(`/api/beneficiarios/detalhados?${params}`)
      if (!res.ok) throw new Error("Erro ao carregar dados detalhados")
      
      const data = await res.json()
      const novosDados = data.dados || []
      
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
      
      const keysExpandidasAtuais = expandedRowKeysRef.current
      if (keysExpandidasAtuais.size > 0 && novosDados.length > 0) {
        const novasKeys = new Set<string>()
        novosDados.forEach((row: any) => {
          const key = getGrupoKey(row)
          if (keysExpandidasAtuais.has(key)) {
            novasKeys.add(key)
          }
        })
        
        if (novasKeys.size > 0) {
          setExpandedRowKeys(novasKeys)
          expandedRowKeysRef.current = novasKeys
        }
      }
      
      setDadosDetalhados(novosDados)
      setDadosNaoIdentificados(data.naoIdentificadosDetalhes || [])
      setTotalRegistros(data.total || 0)
      setTotalPaginas(data.totalPaginas || 1)
      if (pagina === 1) {
        setPaginaAtual(1)
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
  }, [operadorasValidas, entidades, tipoValido, cpf, toast])

  // Carregar entidades com vidas nos meses selecionados
  const carregarEntidadesPorMeses = useCallback(async (meses: string[]) => {
    if (!meses || meses.length === 0) {
      setEntidadesDisponiveis([])
      setEntidadesPorOperadora({})
      return
    }

    try {
      const mesesOrdenados = [...meses].sort()
      const primeiroMes = mesesOrdenados[0]
      const ultimoMes = mesesOrdenados[mesesOrdenados.length - 1]

      const [anoInicioSel, mesInicioSel] = primeiroMes.split("-")
      const dataInicio = `${anoInicioSel}-${mesInicioSel}-01`

      const [anoFimSel, mesFimSel] = ultimoMes.split("-")
      const anoFimNum = parseInt(anoFimSel)
      const mesFimNum = parseInt(mesFimSel)
      const ultimoDiaDate = new Date(anoFimNum, mesFimNum, 0)
      const dataFim = ultimoDiaDate.toISOString().split("T")[0]

      const params = new URLSearchParams({
        data_inicio: dataInicio,
        data_fim: dataFim,
        operadora: "ASSIM SAÚDE",
      })

      const res = await fetchNoStore(`/api/beneficiarios/entidades-por-mes?${params}`)
      if (!res.ok) {
        console.error("Erro ao carregar entidades por mês")
        return
      }

      const data = await res.json()
      const entidadesComDados = data.entidades || []
      const entidadesAssimSaude = entidadesComDados.filter((ent: string) => Boolean(ent))

      setEntidadesDisponiveis(entidadesAssimSaude)
      
      const entidadesPorOperadoraFiltrado: Record<string, string[]> = {}
      const operadoraKey = operadorasDisponiveis.find(
        (op: string) => op.toUpperCase() === "ASSIM SAÚDE" || op.toUpperCase() === "ASSIM SAUDE"
      )
      if (operadoraKey) {
        entidadesPorOperadoraFiltrado[operadoraKey] = entidadesAssimSaude
      }
      setEntidadesPorOperadora(entidadesPorOperadoraFiltrado)
    } catch (error: any) {
      console.error("Erro ao carregar entidades por meses:", error)
    }
  }, [operadorasDisponiveis])

  // Carregar dados quando filtros mudarem
  const loadData = useCallback(async () => {
    if (mesesReferencia.length === 0) {
      setDadosDetalhados([])
      setDadosNaoIdentificados([])
      setTotalRegistros(0)
      setTotalPaginas(1)
      return
    }

    const mesesOrdenados = [...mesesReferencia].sort()
    const primeiroMes = mesesOrdenados[0]
    const ultimoMes = mesesOrdenados[mesesOrdenados.length - 1]

    const [anoInicioSel, mesInicioSel] = primeiroMes.split("-")
    const dataInicioSelecionado = `${anoInicioSel}-${mesInicioSel}-01`

    const [anoFimSel, mesFimSel] = ultimoMes.split("-")
    const anoFimNum = parseInt(anoFimSel)
    const mesFimNum = parseInt(mesFimSel)
    const ultimoDiaSelecionadoDate = new Date(anoFimNum, mesFimNum, 0)
    const dataFimSelecionado = ultimoDiaSelecionadoDate.toISOString().split("T")[0]

    await loadDadosDetalhados(
      dataInicioSelecionado,
      dataFimSelecionado,
      1,
      mesesReferencia,
      {
        operadoras: operadorasValidas,
        entidades: entidades,
        tipo: tipoValido,
        cpf,
      }
    )
    setPaginaAtual(1)
  }, [mesesReferencia, operadorasValidas, entidades, tipoValido, cpf, loadDadosDetalhados])

  // Carregar filtros disponíveis
  useEffect(() => {
    const loadFiltros = async () => {
      try {
        const res = await fetchNoStore("/api/beneficiarios/filtros")
        if (!res.ok) throw new Error("Erro ao carregar filtros")
        const data = await res.json()
        const operadorasFiltradas = (data.operadoras || []).filter(
          (op: string) => op.toUpperCase() === "ASSIM SAÚDE" || op.toUpperCase() === "ASSIM SAUDE"
        )
        setOperadorasDisponiveis(operadorasFiltradas)
        setEntidadesDisponiveis([])
        setEntidadesPorOperadora({})
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
    }
    loadFiltros()
  }, [toast])

  // Carregar entidades quando os meses mudarem
  useEffect(() => {
    if (mesesReferencia.length > 0) {
      carregarEntidadesPorMeses(mesesReferencia)
    } else {
      setEntidadesDisponiveis([])
      setEntidadesPorOperadora({})
    }
  }, [mesesReferencia, carregarEntidadesPorMeses])

  // Carregar dados quando filtros mudarem
  useEffect(() => {
    if (loadingFiltros) return
    loadData()
  }, [loadingFiltros, loadData])

  // Sincronizar ref com state
  useEffect(() => {
    expandedRowKeysRef.current = expandedRowKeys
  }, [expandedRowKeys])

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

  const parseValor = (valor: any): number => {
    if (typeof valor === "number") return valor
    if (typeof valor === "string") {
      const parsed = Number(valor.replace(",", "."))
      return isNaN(parsed) ? 0 : parsed
    }
    return 0
  }

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

  // Agrupar dados não identificados por CPF
  const dadosNaoIdentificadosAgrupados = useMemo(() => {
    const grupos = new Map<
      string,
      {
        key: string
        cpf: string
        procedimentos: {
          evento?: string | null
          descricao?: string | null
          especialidade?: string | null
          valor: number
          data_competencia?: string | null
          data_atendimento?: string | null
        }[]
        totalValor: number
      }
    >()

    dadosNaoIdentificados.forEach(row => {
      const cpf = row.CPF || "SEM-CPF"
      const key = `nao-identificado-${cpf}`
      const valorProcedimento = parseValor(row.VALOR)
      
      if (!grupos.has(key)) {
        grupos.set(key, {
          key,
          cpf,
          procedimentos: [],
          totalValor: 0,
        })
      }
      const grupo = grupos.get(key)!
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
      .sort((a, b) => b.totalValor - a.totalValor)
  }, [dadosNaoIdentificados])

  const toggleExpandRow = (key: string) => {
    setExpandedRowKeys(prev => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      expandedRowKeysRef.current = next
      return next
    })
  }

  const recarregarPaginaDetalhados = useCallback(async (paginaDestino: number) => {
    if (mesesReferencia.length === 0) {
      return false
    }

    const mesesOrdenados = [...mesesReferencia].sort()
    const primeiroMes = mesesOrdenados[0]
    const ultimoMes = mesesOrdenados[mesesOrdenados.length - 1]

    const [anoInicioSel, mesInicioSel] = primeiroMes.split("-")
    const dataInicioSelecionado = `${anoInicioSel}-${mesInicioSel}-01`

    const [anoFimSel, mesFimSel] = ultimoMes.split("-")
    const anoFimNum = parseInt(anoFimSel)
    const mesFimNum = parseInt(mesFimSel)
    const ultimoDiaSelecionadoDate = new Date(anoFimNum, mesFimNum, 0)
    const dataFimSelecionado = ultimoDiaSelecionadoDate.toISOString().split("T")[0]

    const sucesso = await loadDadosDetalhados(
      dataInicioSelecionado,
      dataFimSelecionado,
      paginaDestino,
      mesesReferencia,
      {
        operadoras: operadorasValidas,
        entidades: entidades,
        tipo: tipoValido,
        cpf,
      }
    )
    return sucesso
  }, [loadDadosDetalhados, mesesReferencia, operadorasValidas, entidades, tipoValido, cpf])

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
        <h1 className="text-3xl font-bold">Análise de Beneficiários</h1>
        <p className="text-muted-foreground mt-1">
          Lista completa de beneficiários ativos com procedimentos
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
            <div className="space-y-2">
              <Label>CPF</Label>
              <Input
                value={cpf}
                onChange={(event) =>
                  updateFilters({
                    cpf: event.target.value.replace(/\D/g, "").slice(0, 11),
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
              <Button onClick={loadData} size="sm" className="gap-2" disabled={loadingDetalhados}>
                <RefreshCw className={`h-4 w-4 ${loadingDetalhados ? "animate-spin" : ""}`} />
                Atualizar
              </Button>
            </div>
          </div>
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
                      <TableHead>Idade</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Entidade</TableHead>
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
                            <TableCell>{grupo.info?.IDADE || "-"}</TableCell>
                            <TableCell>{grupo.info?.STATUS || "-"}</TableCell>
                            <TableCell>{grupo.info?.ENTIDADE || "-"}</TableCell>
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

      {/* Tabela de Beneficiários Não Identificados */}
      {dadosNaoIdentificados.length > 0 && (
        <Card className="bg-white rounded-2xl shadow-sm border-zinc-200/70">
          <CardHeader>
            <CardTitle>Beneficiários Não Identificados</CardTitle>
            <CardDescription>
              Procedimentos de CPFs que não foram identificados na base de beneficiários no mês em questão
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="border rounded-md overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10" />
                    <TableHead>CPF</TableHead>
                    <TableHead>Procedimentos</TableHead>
                    <TableHead>Gasto do Mês</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dadosNaoIdentificadosAgrupados.map(grupo => {
                    const isExpanded = expandedRowKeysNaoIdentificados.has(grupo.key)
                    return (
                      <Fragment key={grupo.key}>
                        <TableRow>
                          <TableCell className="w-10">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                const newExpanded = new Set(expandedRowKeysNaoIdentificados)
                                if (isExpanded) {
                                  newExpanded.delete(grupo.key)
                                } else {
                                  newExpanded.add(grupo.key)
                                }
                                setExpandedRowKeysNaoIdentificados(newExpanded)
                              }}
                              aria-label={isExpanded ? "Recolher procedimentos" : "Expandir procedimentos"}
                            >
                              <ChevronDown
                                className={`h-4 w-4 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                              />
                            </Button>
                          </TableCell>
                          <TableCell>{grupo.cpf || "-"}</TableCell>
                          <TableCell>{grupo.procedimentos.length}</TableCell>
                          <TableCell>{fmtCurrency(grupo.totalValor)}</TableCell>
                        </TableRow>
                        {isExpanded && (
                          <TableRow>
                            <TableCell colSpan={4} className="bg-muted/40">
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
            <div className="mt-4 text-sm text-muted-foreground">
              Total: {fmtNumber(dadosNaoIdentificadosAgrupados.length)} beneficiário(s) - {fmtCurrency(
                dadosNaoIdentificadosAgrupados.reduce((sum, grupo) => sum + grupo.totalValor, 0)
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

