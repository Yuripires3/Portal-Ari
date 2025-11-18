"use client"

import { useEffect, useState, useMemo, useCallback } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { useToast } from "@/hooks/use-toast"
import { RefreshCw, Filter } from "lucide-react"
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
import { useBeneficiariosFilters } from "@/lib/beneficiarios-filters-store"
import { signalPageLoaded } from "@/components/ui/page-loading"

const fetchNoStore = (input: string, init?: RequestInit) =>
  fetch(input, { ...init, cache: "no-store" })

type VidasAtivasPorMes = {
  mes_referencia: string
  vidas_ativas: number
}

export default function PainelBeneficiariosPage() {
  const { toast } = useToast()
  const { filters, updateFilters, resetFilters } = useBeneficiariosFilters()
  
  // Extrair valores com fallbacks seguros
  const mesReferencia = filters?.mesReferencia || ""
  const operadoras = Array.isArray(filters?.operadoras) ? filters.operadoras : []
  const entidades = Array.isArray(filters?.entidades) ? filters.entidades : []
  const tipo = filters?.tipo || "Todos"

  // Extrair ano e mês do mesReferencia (formato YYYY-MM)
  const [anoSelecionado, mesSelecionado] = mesReferencia ? mesReferencia.split("-") : ["", ""]

  const [entidadeSelectKey, setEntidadeSelectKey] = useState(0)
  const [anoSelectKey, setAnoSelectKey] = useState(0)

  // Estados de dados
  const [vidasAtivas, setVidasAtivas] = useState<VidasAtivasPorMes[]>([])
  const [loading, setLoading] = useState(false)
  const [loadingFiltros, setLoadingFiltros] = useState(true)

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

  // Estados de filtros disponíveis
  const [operadorasDisponiveis, setOperadorasDisponiveis] = useState<string[]>([])
  const [entidadesDisponiveis, setEntidadesDisponiveis] = useState<string[]>([])
  const [entidadesPorOperadora, setEntidadesPorOperadora] = useState<Record<string, string[]>>({})
  const [tiposDisponiveis, setTiposDisponiveis] = useState<string[]>([])

  const fmtNumber = (v: number) => 
    new Intl.NumberFormat("pt-BR").format(v)

  const fmtMes = (mes: string) => {
    const [ano, mesNum] = mes.split("-")
    const date = new Date(parseInt(ano), parseInt(mesNum) - 1, 1)
    return date.toLocaleDateString("pt-BR", { month: "short", year: "numeric" })
  }

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

  const clearFilters = () => {
    resetFilters()
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
  }, [toast])

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

  // Carregar dados de vidas ativas
  const loadVidasAtivas = useCallback(async () => {
    if (!mesReferencia) return

    // Converter mesReferencia (YYYY-MM) para data_inicio e data_fim
    // data_inicio será o primeiro dia do mês, data_fim será o último dia do mês
    const [ano, mes] = mesReferencia.split("-")
    if (!ano || !mes) return

    const dataInicio = `${ano}-${mes}-01`
    const ultimoDia = new Date(parseInt(ano), parseInt(mes), 0).getDate()
    const dataFim = `${ano}-${mes}-${String(ultimoDia).padStart(2, "0")}`

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
      setVidasAtivas(data || [])
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
  }, [mesReferencia, operadorasValidas, entidades, tipoValido, toast])

  // Carregar dados ao montar ou quando filtros mudarem
  useEffect(() => {
    if (!loadingFiltros) {
      loadVidasAtivas()
    }
  }, [loadingFiltros, loadVidasAtivas])

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold">Painel de Beneficiários</h1>
        <p className="text-muted-foreground mt-1">
          Consulte vidas ativas por mês de referência com filtros personalizados.
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
              <Label>Mês Referência</Label>
              <div className="flex gap-2">
                <Select
                  value={anoSelecionado}
                  onValueChange={(ano) => {
                    if (ano && mesSelecionado) {
                      updateFilters({ mesReferencia: `${ano}-${mesSelecionado}` })
                    } else if (ano) {
                      // Se não houver mês selecionado, usar o primeiro mês
                      updateFilters({ mesReferencia: `${ano}-01` })
                    }
                    setAnoSelectKey(prev => prev + 1)
                  }}
                >
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Ano" />
                  </SelectTrigger>
                  <SelectContent>
                    {anosDisponiveis.map(ano => (
                      <SelectItem key={ano} value={String(ano)}>
                        {ano}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  key={anoSelectKey}
                  value={mesSelecionado}
                  onValueChange={(mes) => {
                    if (mes && anoSelecionado) {
                      updateFilters({ mesReferencia: `${anoSelecionado}-${mes}` })
                    }
                  }}
                  disabled={!anoSelecionado}
                >
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Mês" />
                  </SelectTrigger>
                  <SelectContent>
                    {mesesDisponiveis.map(mes => (
                      <SelectItem key={mes.valor} value={mes.valor}>
                        {mes.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
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
            Contagem de beneficiários ativos acumulados por mês
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
                <Bar dataKey="vidas_ativas" name="Vidas Ativas" fill="#002f67" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Tabela de Resultados */}
      <Card className="bg-white rounded-2xl shadow-sm border-zinc-200/70">
        <CardHeader>
          <CardTitle>Resultados Detalhados</CardTitle>
          <CardDescription>
            Lista completa de vidas ativas por mês de referência
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : vidasAtivas.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">Nenhum dado disponível</p>
          ) : (
            <div className="border rounded-md overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Mês de Referência</TableHead>
                    <TableHead className="text-right">Vidas Ativas</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {vidasAtivas.map((item, index) => (
                    <TableRow key={`${item.mes_referencia}-${index}`}>
                      <TableCell className="font-medium">{fmtMes(item.mes_referencia)}</TableCell>
                      <TableCell className="text-right">{fmtNumber(item.vidas_ativas)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

