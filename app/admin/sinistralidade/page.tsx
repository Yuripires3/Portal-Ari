"use client"

import { useEffect, useState, useMemo, useCallback, useRef } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useAuth } from "@/components/auth/auth-provider"
import { useToast } from "@/hooks/use-toast"
import { Filter, RefreshCw, ChevronDown, Users, UserX, UserCheck, Activity, ChevronRight, Loader2 } from "lucide-react"
import { Checkbox } from "@/components/ui/checkbox"
import { Skeleton } from "@/components/ui/skeleton"
import { useEntidadesPorMes } from "@/hooks/useEntidadesPorMes"
import { useTiposPorMes } from "@/hooks/useTiposPorMes"
import { filterAssimSaude, validateFilters, createDefaultFilters, getMesReferenciaAtual } from "@/lib/beneficiarios-filters-utils"
import { PlanDistributionList } from "@/components/sinistralidade/PlanDistributionList"
import type { BeneficiariosFiltersState } from "@/lib/beneficiarios-filters-utils"

const fetchNoStore = (input: string, init?: RequestInit) =>
  fetch(input, { ...init, cache: "no-store" })

// Chave para persistência específica desta página
const STORAGE_KEY_SINISTRALIDADE = "sinistralidade-dashboard-filters"

// Tipo para filtros aplicados (usados na API)
type FiltrosAplicados = {
  mesesReferencia: string[]
  operadoras: string[]
  entidades: string[]
  mesesReajuste: string[]
  tipo: string
}

export default function SinistralidadeDashboardPage() {
  const { user, isLoading: authLoading } = useAuth()
  const router = useRouter()
  const { toast } = useToast()
  
  // Estados de filtros: formulário (edição) vs aplicados (consulta API)
  const [filtrosFormulario, setFiltrosFormulario] = useState<BeneficiariosFiltersState>(() => {
    // Carregar do localStorage ao inicializar
    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem(STORAGE_KEY_SINISTRALIDADE)
        if (stored) {
          const parsed = JSON.parse(stored)
          return {
            mesReferencia: parsed.mesReferencia || getMesReferenciaAtual(),
            mesesReferencia: Array.isArray(parsed.mesesReferencia) && parsed.mesesReferencia.length > 0
              ? parsed.mesesReferencia
              : [getMesReferenciaAtual()],
            operadoras: Array.isArray(parsed.operadoras) ? parsed.operadoras : [],
            entidades: Array.isArray(parsed.entidades) ? parsed.entidades : [],
            tipo: parsed.tipo || "Todos",
            cpf: "", // Sempre vazio nesta página
          }
        }
      } catch (e) {
        console.error("Erro ao carregar filtros do localStorage:", e)
      }
    }
    return createDefaultFilters()
  })

  const [filtrosAplicados, setFiltrosAplicados] = useState<FiltrosAplicados | null>(null)
  const [mesesReajuste, setMesesReajuste] = useState<string[]>(() => {
    // Carregar meses de reajuste do localStorage
    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem(STORAGE_KEY_SINISTRALIDADE)
        if (stored) {
          const parsed = JSON.parse(stored)
          return Array.isArray(parsed.mesesReajuste) ? parsed.mesesReajuste : []
        }
      } catch (e) {
        console.error("Erro ao carregar meses de reajuste do localStorage:", e)
      }
    }
    return []
  })

  const [entidadeSelectKey, setEntidadeSelectKey] = useState(0)
  const [mesesDropdownOpen, setMesesDropdownOpen] = useState(false)
  const [operadorasDisponiveis, setOperadorasDisponiveis] = useState<string[]>([])
  const [entidadesPorOperadoraGlobal, setEntidadesPorOperadoraGlobal] = useState<Record<string, string[]>>({})
  const [loadingFiltros, setLoadingFiltros] = useState(true)
  
  // Estados para cards de status de vidas
  // INTEGRAÇÃO: Incluídos campos de faturamento NET
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
      valor_net_ativo?: number
      valor_net_inativo?: number
      valor_net_nao_localizado?: number
      valor_net_total_geral?: number
      por_plano?: {
        ativo: Array<{ plano: string; vidas: number; valor: number; valor_net?: number }>
        inativo: Array<{ plano: string; vidas: number; valor: number; valor_net?: number }>
        nao_localizado: Array<{ plano: string; vidas: number; valor: number; valor_net?: number }>
        total: Array<{ plano: string; vidas: number; valor: number; valor_net?: number }>
      }
    }
    por_entidade?: {
      ativo: Array<{
        entidade: string
        mes_reajuste?: string | null
        vidas: number
        valor_total: number
        valor_net_total?: number
        pct_vidas: number
        pct_valor: number
        por_plano?: Array<{ plano: string; vidas: number; valor: number; valor_net?: number }>
      }>
      inativo: Array<{
        entidade: string
        mes_reajuste?: string | null
        vidas: number
        valor_total: number
        valor_net_total?: number
        pct_vidas: number
        pct_valor: number
        por_plano?: Array<{ plano: string; vidas: number; valor: number; valor_net?: number }>
      }>
      nao_localizado: Array<{
        entidade: string
        mes_reajuste?: string | null
        vidas: number
        valor_total: number
        valor_net_total?: number
        pct_vidas: number
        pct_valor: number
        por_plano?: Array<{ plano: string; vidas: number; valor: number; valor_net?: number }>
      }>
      total: Array<{
        entidade: string
        mes_reajuste?: string | null
        vidas: number
        valor_total: number
        valor_net_total?: number
        pct_vidas: number
        pct_valor: number
        por_plano?: Array<{ plano: string; vidas: number; valor: number; valor_net?: number }>
      }>
    }
  } | null>(null)
  const [loadingCardsStatus, setLoadingCardsStatus] = useState(false)
  const [loadingOverlay, setLoadingOverlay] = useState(false)
  
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

  // Ler filtros do formulário (com fallbacks seguros)
  const mesesReferencia = useMemo(() => {
    if (Array.isArray(filtrosFormulario?.mesesReferencia) && filtrosFormulario.mesesReferencia.length > 0) {
      return filtrosFormulario.mesesReferencia
    }
    if (filtrosFormulario?.mesReferencia) {
      return [filtrosFormulario.mesReferencia]
    }
    return []
  }, [filtrosFormulario?.mesesReferencia, filtrosFormulario?.mesReferencia])

  const operadoras = useMemo(() => 
    Array.isArray(filtrosFormulario?.operadoras) ? filtrosFormulario.operadoras : [],
    [filtrosFormulario?.operadoras]
  )
  
  const entidades = useMemo(() => 
    Array.isArray(filtrosFormulario?.entidades) ? filtrosFormulario.entidades : [],
    [filtrosFormulario?.entidades]
  )
  
  const tipo = useMemo(() => filtrosFormulario?.tipo || "Todos", [filtrosFormulario?.tipo])

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

  // Usar hook otimizado para carregar entidades por mês (baseado nos filtros do formulário)
  const {
    entidadesDisponiveis,
    entidadesPorOperadora,
    loading: loadingEntidades,
    error: errorEntidades,
    refresh: refreshEntidades,
  } = useEntidadesPorMes(mesesReferencia, operadorasDisponiveis)

  // Usar hook otimizado para carregar tipos por mês (baseado nos filtros do formulário)
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

  // Callbacks memoizados para atualizar filtros do formulário (não dispara carregamento)
  const toggleOperadora = useCallback((op: string) => {
    const novasOperadoras = operadoras.includes(op)
      ? operadoras.filter(o => o !== op)
      : [...operadoras, op]
    
    // Filtrar entidades para manter apenas as que estão disponíveis para o período atual
    // e pertencem às operadoras selecionadas (entidadesDisponiveis já está filtrada por período e operadora)
    const entidadesValidas = novasOperadoras.length > 0
      ? entidades.filter(ent => entidadesDisponiveis.includes(ent))
      : []
    
    setFiltrosFormulario(prev => ({
      ...prev,
      operadoras: novasOperadoras,
      entidades: entidadesValidas
    }))
    setEntidadeSelectKey(prev => prev + 1)
  }, [operadoras, entidades, entidadesDisponiveis])

  const toggleEntidade = useCallback((ent: string) => {
    setFiltrosFormulario(prev => ({
      ...prev,
      entidades: entidades.includes(ent)
        ? entidades.filter(e => e !== ent)
        : [...entidades, ent]
    }))
  }, [entidades])

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
    setFiltrosFormulario(prev => ({
      ...prev,
      mesesReferencia: mesesOrdenados,
      mesReferencia: mesesOrdenados[0]
    }))
  }, [mesesReferencia, toast])

  const getTextoMesesSelecionados = () => {
    if (mesesReferencia.length === 0) return "Selecione os meses"
    if (mesesReferencia.length === 1) {
      const [ano, mes] = mesesReferencia[0].split("-")
      const mesObj = mesesDisponiveis.find(m => m.valor === mes)
      return `${mesObj?.nome || mes} ${ano}`
    }
    return `${mesesReferencia.length} meses selecionados`
  }

  const getTextoEntidadesSelecionadas = () => {
    if (entidades.length === 0) return operadorasValidas.length > 0 ? "Selecione a entidade" : "Selecione"
    if (entidades.length === 1) return entidades[0]
    if (entidades.length <= 2) {
      return entidades.join(", ")
    }
    return `${entidades.slice(0, 2).join(", ")} +${entidades.length - 2}`
  }

  const getTextoMesesReajusteSelecionados = () => {
    if (mesesReajuste.length === 0) return "Selecione o mês"
    if (mesesReajuste.length === 1) {
      return getNomeMes(mesesReajuste[0]) || mesesReajuste[0]
    }
    return `${mesesReajuste.length} meses selecionados`
  }

  const clearFilters = useCallback(() => {
    const mesAtual = getMesReferenciaAtual()
    const novosFiltros = {
      mesReferencia: mesAtual,
      mesesReferencia: [mesAtual],
      operadoras: [],
      entidades: [],
      tipo: "Todos",
      cpf: "",
    }
    setFiltrosFormulario(novosFiltros)
    setMesesReajuste([])
    setEntidadeSelectKey(prev => prev + 1)
    // Persistir no localStorage
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(STORAGE_KEY_SINISTRALIDADE, JSON.stringify({
          ...novosFiltros,
          mesesReajuste: []
        }))
      } catch (e) {
        console.error("Erro ao salvar filtros no localStorage:", e)
      }
    }
  }, [])

  // Função para aplicar filtros e carregar dados (dispara carregamento)
  const handleAplicarFiltros = useCallback(() => {
    // Validar meses
    if (mesesReferencia.length === 0) {
      toast({
        title: "Atenção",
        description: "Pelo menos um mês deve estar selecionado",
        variant: "destructive"
      })
      return
    }

    // Aplicar filtros do formulário aos filtros aplicados
    const novosFiltrosAplicados: FiltrosAplicados = {
      mesesReferencia: mesesReferencia,
      operadoras: operadoras,
      entidades: entidades,
      mesesReajuste: mesesReajuste,
      tipo: tipo,
    }
    
    setFiltrosAplicados(novosFiltrosAplicados)
    
    // Persistir no localStorage
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(STORAGE_KEY_SINISTRALIDADE, JSON.stringify({
          ...filtrosFormulario,
          mesesReajuste: mesesReajuste
        }))
      } catch (e) {
        console.error("Erro ao salvar filtros no localStorage:", e)
      }
    }
  }, [mesesReferencia, operadoras, entidades, mesesReajuste, tipo, filtrosFormulario, toast])

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

  // Função para agrupar entidades de todos os status (ativo, inativo, nao_localizado) por entidade e mês de reajuste
  // Usado no card "Total de Vidas" para somar todas as vidas de uma mesma entidade/mês de reajuste
  // INTEGRAÇÃO: Incluídos campos de faturamento NET
  const agruparEntidadesTotal = useCallback((
    entidadesAtivo: Array<{
      entidade: string
      mes_reajuste?: string | null
      vidas: number
      valor_total: number
      valor_net_total?: number
      pct_vidas: number
      pct_valor: number
      por_plano?: Array<{ plano: string; vidas: number; valor: number; valor_net?: number }>
    }>,
    entidadesInativo: Array<{
      entidade: string
      mes_reajuste?: string | null
      vidas: number
      valor_total: number
      valor_net_total?: number
      pct_vidas: number
      pct_valor: number
      por_plano?: Array<{ plano: string; vidas: number; valor: number; valor_net?: number }>
    }>,
    entidadesNaoLocalizado: Array<{
      entidade: string
      mes_reajuste?: string | null
      vidas: number
      valor_total: number
      valor_net_total?: number
      pct_vidas: number
      pct_valor: number
      por_plano?: Array<{ plano: string; vidas: number; valor: number; valor_net?: number }>
    }>,
    totalVidasConsolidado: number,
    valorTotalConsolidado: number
  ) => {
    // Map para agrupar por chave (entidade + mês de reajuste)
    const agrupado = new Map<string, {
      entidade: string
      mes_reajuste?: string | null
      vidas: number
      valor_total: number
      valor_net_total: number
      pct_vidas: number
      pct_valor: number
      por_plano: Map<string, { vidas: number; valor: number; valor_net: number }>
    }>()

    // Função auxiliar para processar uma lista de entidades
    const processarEntidades = (lista: typeof entidadesAtivo) => {
      lista.forEach(ent => {
        const key = `${ent.entidade}|${ent.mes_reajuste || 'null'}`
        const existente = agrupado.get(key)
        
        if (existente) {
          existente.vidas += ent.vidas
          existente.valor_total += ent.valor_total
          existente.valor_net_total += ent.valor_net_total || 0
          
          // Agrupar planos também - CORREÇÃO: preservar e somar valor_net
          if (ent.por_plano) {
            ent.por_plano.forEach(plano => {
              const planoExistente = existente.por_plano.get(plano.plano) || { vidas: 0, valor: 0, valor_net: 0 }
              planoExistente.vidas += plano.vidas
              planoExistente.valor += plano.valor
              // CORREÇÃO: Somar valor_net corretamente, tratando null/undefined como 0
              const valorNetPlano = (plano.valor_net !== null && plano.valor_net !== undefined && !isNaN(Number(plano.valor_net))) 
                ? Number(plano.valor_net) 
                : 0
              planoExistente.valor_net += valorNetPlano
              existente.por_plano.set(plano.plano, planoExistente)
            })
          }
        } else {
          const planosMap = new Map<string, { vidas: number; valor: number; valor_net: number }>()
          if (ent.por_plano) {
            ent.por_plano.forEach(plano => {
              // CORREÇÃO: Preservar valor_net ao criar novo Map
              const valorNetPlano = (plano.valor_net !== null && plano.valor_net !== undefined && !isNaN(Number(plano.valor_net))) 
                ? Number(plano.valor_net) 
                : 0
              planosMap.set(plano.plano, { 
                vidas: plano.vidas, 
                valor: plano.valor,
                valor_net: valorNetPlano
              })
            })
          }
          
          agrupado.set(key, {
            entidade: ent.entidade,
            mes_reajuste: ent.mes_reajuste,
            vidas: ent.vidas,
            valor_total: ent.valor_total,
            valor_net_total: ent.valor_net_total || 0,
            pct_vidas: 0, // Será calculado depois
            pct_valor: 0, // Será calculado depois
            por_plano: planosMap
          })
        }
      })
    }

    // Processar todas as listas
    processarEntidades(entidadesAtivo)
    processarEntidades(entidadesInativo)
    processarEntidades(entidadesNaoLocalizado)

    // Calcular percentuais e converter planos para array
    const resultado = Array.from(agrupado.values()).map(ent => ({
      entidade: ent.entidade,
      mes_reajuste: ent.mes_reajuste,
      vidas: ent.vidas,
      valor_total: ent.valor_total,
      valor_net_total: ent.valor_net_total,
      pct_vidas: totalVidasConsolidado > 0 ? ent.vidas / totalVidasConsolidado : 0,
      pct_valor: valorTotalConsolidado > 0 ? ent.valor_total / valorTotalConsolidado : 0,
      por_plano: Array.from(ent.por_plano.entries())
        .map(([plano, { vidas, valor, valor_net }]) => ({ 
          plano, 
          vidas, 
          valor,
          valor_net: (valor_net !== null && valor_net !== undefined && !isNaN(valor_net)) ? valor_net : 0
        }))
        .sort((a, b) => b.vidas - a.vidas)
    }))

    // Ordenar: primeiro por mês de reajuste (maior volume), depois por vidas (maior para menor)
    const volumePorMesReajuste = new Map<string | null, number>()
    resultado.forEach(ent => {
      const mesReajuste = ent.mes_reajuste || null
      const atual = volumePorMesReajuste.get(mesReajuste) || 0
      volumePorMesReajuste.set(mesReajuste, atual + ent.vidas)
    })

    return resultado.sort((a, b) => {
      const mesA = a.mes_reajuste || null
      const mesB = b.mes_reajuste || null
      
      if (mesA !== mesB) {
        const volumeA = volumePorMesReajuste.get(mesA) || 0
        const volumeB = volumePorMesReajuste.get(mesB) || 0
        
        if (volumeB !== volumeA) {
          return volumeB - volumeA
        }
        
        if (!mesA) return -1
        if (!mesB) return 1
        return mesA.localeCompare(mesB)
      }
      
      if (b.vidas !== a.vidas) {
        return b.vidas - a.vidas
      }
      
      return a.entidade.localeCompare(b.entidade)
    })
  }, [])

  // Função para agrupar entidades por entidade e mês de reajuste
  // Ordenação: primeiro por mês de reajuste (maior volume de vidas), depois por entidade (maior quantidade de vidas)
  // INTEGRAÇÃO: Incluídos campos de faturamento NET
  const agruparEntidadesPorMesReajuste = useCallback((
    entidades: Array<{
      entidade: string
      mes_reajuste?: string | null
      vidas: number
      valor_total: number
      valor_net_total?: number
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

  // Carregar cards de status de vidas (apenas quando filtrosAplicados mudar)
  useEffect(() => {
    if (!filtrosAplicados || filtrosAplicados.mesesReferencia.length === 0) {
      setCardsStatusVidas(null)
      setLoadingOverlay(false)
      return
    }

    let cancelled = false
    setLoadingCardsStatus(true)
    setLoadingOverlay(true)

    const loadCardsStatus = async () => {
      try {
        // CARDS MÃE: usar apenas meses_referencia e operadoras
        const paramsCardsMae = new URLSearchParams({
          meses_referencia: filtrosAplicados.mesesReferencia.join(","),
        })

        if (filtrosAplicados.operadoras.length > 0) {
          paramsCardsMae.append("operadoras", filtrosAplicados.operadoras.join(","))
        }

        // CARDS FILHOS: usar todos os filtros (exceto CPF)
        const paramsCardsFilhos = new URLSearchParams({
          meses_referencia: filtrosAplicados.mesesReferencia.join(","),
        })

        if (filtrosAplicados.operadoras.length > 0) {
          paramsCardsFilhos.append("operadoras", filtrosAplicados.operadoras.join(","))
        }

        if (filtrosAplicados.entidades.length > 0) {
          paramsCardsFilhos.append("entidades", filtrosAplicados.entidades.join(","))
        }

        if (filtrosAplicados.tipo && filtrosAplicados.tipo !== "Todos") {
          paramsCardsFilhos.append("tipo", filtrosAplicados.tipo)
        }

        if (filtrosAplicados.mesesReajuste.length > 0) {
          paramsCardsFilhos.append("meses_reajuste", filtrosAplicados.mesesReajuste.join(","))
        }

        // Fazer duas chamadas em paralelo: uma para cards MÃE e outra para FILHOS
        const [resCardsMae, resCardsFilhos] = await Promise.all([
          fetchNoStore(`/api/sinistralidade/cards-status-vidas?${paramsCardsMae}`),
          fetchNoStore(`/api/sinistralidade/cards-status-vidas?${paramsCardsFilhos}`)
        ])
        
        if (cancelled) return

        if (!resCardsMae.ok || !resCardsFilhos.ok) {
          throw new Error("Erro ao carregar cards de status")
        }

        const [dataCardsMae, dataCardsFilhos] = await Promise.all([
          resCardsMae.json(),
          resCardsFilhos.json()
        ])
        
        if (cancelled) return

        // Combinar dados: consolidado dos cards MÃE + por_entidade dos cards FILHOS
        setCardsStatusVidas({
          consolidado: dataCardsMae.consolidado,
          por_entidade: dataCardsFilhos.por_entidade,
        })
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
          setLoadingOverlay(false)
        }
      }
    }

    loadCardsStatus()

    return () => {
      cancelled = true
    }
  }, [filtrosAplicados, toast])

  // Carregar filtros aplicados ao montar a página (se existirem no localStorage)
  // Isso garante que ao voltar para a página, os cards sejam carregados automaticamente
  useEffect(() => {
    if (filtrosAplicados !== null) return // Já foi aplicado
    if (loadingFiltros) return // Aguardar carregamento dos filtros disponíveis

    // Aplicar filtros do formulário como filtros aplicados na primeira carga
    // Isso permite que os cards sejam carregados automaticamente ao entrar na página
    if (mesesReferencia.length > 0) {
      setFiltrosAplicados({
        mesesReferencia: mesesReferencia,
        operadoras: operadoras,
        entidades: entidades,
        mesesReajuste: mesesReajuste,
        tipo: tipo,
      })
    }
  }, [filtrosAplicados, loadingFiltros, mesesReferencia, operadoras, entidades, mesesReajuste, tipo])

  // Validação automática de filtros do formulário
  const validacaoExecutadaRef = useRef(false)
  useEffect(() => {
    if (loadingFiltros || loadingTipos || validacaoExecutadaRef.current) {
      return
    }
    
    const updates = validateFilters(filtrosFormulario, {
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
      setFiltrosFormulario(prev => ({ ...prev, ...updates }))
      if (updates.entidades !== undefined) {
        setEntidadeSelectKey(prev => prev + 1)
      }
    } else {
      validacaoExecutadaRef.current = true
    }
  }, [loadingFiltros, loadingTipos, filtrosFormulario, operadorasDisponiveis, tiposDisponiveis, operadoras, entidades, entidadesDisponiveis, tipo])

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
                    setFiltrosFormulario(prev => ({ 
                      ...prev,
                      operadoras: [...operadoras, val],
                      entidades: [] 
                    }))
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
                    setFiltrosFormulario(prev => ({ ...prev, entidades: [...entidades, val] }))
                  }
                  setEntidadeSelectKey(prev => prev + 1)
                }}
                disabled={entidadesDisponiveisParaSelecao.length === 0}
              >
                <SelectTrigger>
                  <SelectValue placeholder={getTextoEntidadesSelecionadas()} />
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
                  <SelectValue placeholder={getTextoMesesReajusteSelecionados()} />
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
                onValueChange={(val) => setFiltrosFormulario(prev => ({ ...prev, tipo: val }))}
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
          </div>
          <div className="mt-4 flex flex-col items-end gap-1">
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={clearFilters}>
                Limpar
              </Button>
              <Button 
                size="sm" 
                onClick={handleAplicarFiltros}
                disabled={loadingCardsStatus || loadingOverlay || mesesReferencia.length === 0}
                className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
              >
                <RefreshCw className={`h-4 w-4 ${loadingCardsStatus || loadingOverlay ? "animate-spin" : ""}`} />
                Visualizar
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Cards de Status de Vidas com Entidades */}
      {filtrosAplicados && filtrosAplicados.mesesReferencia.length > 0 && (() => {
        const cardsData = cardsStatusVidas
        const temNaoLocalizados = (cardsData?.consolidado?.nao_localizado || 0) > 0
        const gridCols = temNaoLocalizados ? "sm:grid-cols-2 lg:grid-cols-4" : "sm:grid-cols-2 lg:grid-cols-3"
        const mesesReajusteFiltro = filtrosAplicados.mesesReajuste
        
        // Funções auxiliares para calcular nome de exibição e key
        const calcularNomeExibicao = (entidade: { entidade: string; mes_reajuste?: string | null }) => {
          return entidade.mes_reajuste 
            ? `${entidade.entidade} ${getNomeMes(entidade.mes_reajuste)}`
            : entidade.entidade
        }
        
        const calcularKey = (prefixo: string, entidade: { entidade: string; mes_reajuste?: string | null }) => {
          return entidade.mes_reajuste 
            ? `${prefixo}-${entidade.entidade}-${entidade.mes_reajuste}`
            : `${prefixo}-${entidade.entidade}`
        }
        
        // Objeto de filtros para passar para os componentes de drilldown
        const filtrosParaDrilldown = {
          mesesReferencia: filtrosAplicados.mesesReferencia,
          operadoras: filtrosAplicados.operadoras,
          entidades: filtrosAplicados.entidades,
          mesesReajuste: filtrosAplicados.mesesReajuste,
          tipo: filtrosAplicados.tipo,
        }
        
        return (
        <div className="relative mt-6">
          {/* Overlay de carregamento */}
          {loadingOverlay && (
            <div className="absolute inset-0 z-50 flex items-center justify-center bg-white/80 backdrop-blur-sm rounded-2xl">
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-sm font-medium text-muted-foreground">Carregando dados...</p>
              </div>
            </div>
          )}
          <div className={`grid gap-6 ${gridCols}`}>
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
                      {fmtNumber(cardsData?.consolidado?.total_vidas || 0)}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Valor Total: {fmtBRL(cardsData?.consolidado?.valor_total_geral || 0)}
                    </p>
                    {(cardsData?.consolidado?.valor_net_total_geral || 0) > 0 && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        NET: {fmtBRL(cardsData?.consolidado?.valor_net_total_geral || 0)}
                      </p>
                    )}
                    {/* Distribuição por plano - Drilldown */}
                    {cardsData?.consolidado?.por_plano?.total && cardsData.consolidado.por_plano.total.length > 0 && (
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
                            planos={cardsData.consolidado.por_plano.total}
                            totalVidas={cardsData.consolidado.total_vidas || 0}
                            filtros={filtrosParaDrilldown}
                          />
                        )}
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
            
            {/* Cards de Entidades - Total */}
            {cardsData?.por_entidade && (
              (() => {
                // Agrupar entidades de todos os status para o card Total
                const entidadesAgrupadas = agruparEntidadesTotal(
                  cardsData.por_entidade.ativo || [],
                  cardsData.por_entidade.inativo || [],
                  cardsData.por_entidade.nao_localizado || [],
                  cardsData.consolidado?.total_vidas || 0,
                  cardsData.consolidado?.valor_total_geral || 0
                )
                
                // Aplicar filtro de mês de reajuste se houver
                const entidadesFiltradas = mesesReajusteFiltro.length > 0
                  ? entidadesAgrupadas.filter(ent => 
                      !ent.mes_reajuste || mesesReajusteFiltro.includes(ent.mes_reajuste)
                    )
                  : entidadesAgrupadas
                
                if (entidadesFiltradas.length === 0) return null
                
                return (
                  <div className="space-y-2">
                    {agruparEntidadesPorMesReajuste(entidadesFiltradas).map((entidade) => {
                  const nomeExibicao = calcularNomeExibicao(entidade)
                  const key = calcularKey('total', entidade)
                  
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
                      {((entidade as any).valor_net_total || 0) > 0 && (
                        <p className="text-xs text-slate-400 mt-0.5">
                          NET: {fmtBRL((entidade as any).valor_net_total || 0)}
                        </p>
                      )}
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
                              filtros={{
                                ...filtrosParaDrilldown,
                                // Para cards filhos dentro de um card de entidade, usar apenas esta entidade específica
                                entidades: [entidade.entidade],
                                // Usar apenas o mês de reajuste desta entidade (se houver)
                                mesesReajuste: entidade.mes_reajuste ? [entidade.mes_reajuste] : []
                              }}
                            />
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
                  </div>
                )
              })()
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
                      {fmtNumber(cardsData?.consolidado?.ativo || 0)}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Valor: {fmtBRL(cardsData?.consolidado?.valor_ativo || 0)}
                    </p>
                    {(cardsData?.consolidado?.valor_net_ativo || 0) > 0 && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        NET: {fmtBRL(cardsData?.consolidado?.valor_net_ativo || 0)}
                      </p>
                    )}
                    {/* Distribuição por plano - Drilldown */}
                    {cardsData?.consolidado?.por_plano?.ativo && cardsData.consolidado.por_plano.ativo.length > 0 && (
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
                            planos={cardsData.consolidado.por_plano.ativo}
                            totalVidas={cardsData.consolidado.ativo || 0}
                            filtros={{ ...filtrosParaDrilldown, status: 'ativo' }}
                          />
                        )}
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
            
            {/* Cards de Entidades - Ativas */}
            {cardsData?.por_entidade?.ativo && cardsData.por_entidade.ativo.length > 0 && (
              <div className="space-y-2">
                {agruparEntidadesPorMesReajuste(
                  mesesReajusteFiltro.length > 0
                    ? cardsData.por_entidade.ativo.filter(ent => 
                        !ent.mes_reajuste || mesesReajusteFiltro.includes(ent.mes_reajuste)
                      )
                    : cardsData.por_entidade.ativo
                ).map((entidade) => {
                  const nomeExibicao = calcularNomeExibicao(entidade)
                  const key = calcularKey('ativo', entidade)
                  
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
                      {(entidade.valor_net_total || 0) > 0 && (
                        <p className="text-xs text-slate-400 mt-0.5">
                          NET: {fmtBRL(entidade.valor_net_total || 0)}
                        </p>
                      )}
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
                              filtros={{
                                ...filtrosParaDrilldown,
                                status: 'ativo',
                                // Para cards filhos dentro de um card de entidade, usar apenas esta entidade específica
                                entidades: [entidade.entidade],
                                // Usar apenas o mês de reajuste desta entidade (se houver)
                                mesesReajuste: entidade.mes_reajuste ? [entidade.mes_reajuste] : []
                              }}
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
                      {fmtNumber(cardsData?.consolidado?.inativo || 0)}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Valor: {fmtBRL(cardsData?.consolidado?.valor_inativo || 0)}
                    </p>
                    {(cardsData?.consolidado?.valor_net_inativo || 0) > 0 && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        NET: {fmtBRL(cardsData?.consolidado?.valor_net_inativo || 0)}
                      </p>
                    )}
                    {/* Distribuição por plano - Drilldown */}
                    {cardsData?.consolidado?.por_plano?.inativo && cardsData.consolidado.por_plano.inativo.length > 0 && (
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
                            planos={cardsData.consolidado.por_plano.inativo}
                            totalVidas={cardsData.consolidado.inativo || 0}
                            filtros={{ ...filtrosParaDrilldown, status: 'inativo' }}
                          />
                        )}
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
            
            {/* Cards de Entidades - Inativas */}
            {cardsData?.por_entidade?.inativo && cardsData.por_entidade.inativo.length > 0 && (
              <div className="space-y-2">
                {agruparEntidadesPorMesReajuste(
                  mesesReajusteFiltro.length > 0
                    ? cardsData.por_entidade.inativo.filter(ent => 
                        !ent.mes_reajuste || mesesReajusteFiltro.includes(ent.mes_reajuste)
                      )
                    : cardsData.por_entidade.inativo
                ).map((entidade) => {
                  const nomeExibicao = calcularNomeExibicao(entidade)
                  const key = calcularKey('inativo', entidade)
                  
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
                      {(entidade.valor_net_total || 0) > 0 && (
                        <p className="text-xs text-slate-400 mt-0.5">
                          NET: {fmtBRL(entidade.valor_net_total || 0)}
                        </p>
                      )}
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
                              filtros={{
                                ...filtrosParaDrilldown,
                                status: 'inativo',
                                // Para cards filhos dentro de um card de entidade, usar apenas esta entidade específica
                                entidades: [entidade.entidade],
                                // Usar apenas o mês de reajuste desta entidade (se houver)
                                mesesReajuste: entidade.mes_reajuste ? [entidade.mes_reajuste] : []
                              }}
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
                      {fmtNumber(cardsData?.consolidado?.nao_localizado || 0)}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Valor: {fmtBRL(cardsData?.consolidado?.valor_nao_localizado || 0)}
                    </p>
                    {(cardsData?.consolidado?.valor_net_nao_localizado || 0) > 0 && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        NET: {fmtBRL(cardsData?.consolidado?.valor_net_nao_localizado || 0)}
                      </p>
                    )}
                    {/* Distribuição por plano - Drilldown */}
                    {cardsData?.consolidado?.por_plano?.nao_localizado && cardsData.consolidado.por_plano.nao_localizado.length > 0 && (
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
                            planos={cardsData.consolidado.por_plano.nao_localizado}
                            totalVidas={cardsData.consolidado.nao_localizado || 0}
                            filtros={{ ...filtrosParaDrilldown, status: 'vazio' }}
                          />
                        )}
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
            
            {/* Cards de Entidades - Não Localizadas */}
            {cardsData?.por_entidade?.nao_localizado && cardsData.por_entidade.nao_localizado.length > 0 && (
              <div className="space-y-2">
                {agruparEntidadesPorMesReajuste(
                  mesesReajusteFiltro.length > 0
                    ? cardsData.por_entidade.nao_localizado.filter(ent => 
                        !ent.mes_reajuste || mesesReajusteFiltro.includes(ent.mes_reajuste)
                      )
                    : cardsData.por_entidade.nao_localizado
                ).map((entidade) => {
                  const nomeExibicao = calcularNomeExibicao(entidade)
                  const key = calcularKey('nao_localizado', entidade)
                  
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
                      {(entidade.valor_net_total || 0) > 0 && (
                        <p className="text-xs text-slate-400 mt-0.5">
                          NET: {fmtBRL(entidade.valor_net_total || 0)}
                        </p>
                      )}
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
                              filtros={{
                                ...filtrosParaDrilldown,
                                status: 'vazio',
                                // Para cards filhos dentro de um card de entidade, usar apenas esta entidade específica
                                entidades: [entidade.entidade],
                                // Usar apenas o mês de reajuste desta entidade (se houver)
                                mesesReajuste: entidade.mes_reajuste ? [entidade.mes_reajuste] : []
                              }}
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
        </div>
        )
      })()}

    </div>
  )
}
