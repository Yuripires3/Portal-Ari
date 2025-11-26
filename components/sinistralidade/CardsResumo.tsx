"use client"

import { useEffect, useState, useMemo, memo } from "react"
import { SummaryCard } from "./SummaryCard"
import { FaixaEtariaItem } from "./FaixaEtariaChart"

export interface SinistralidadeCards {
  mes: string
  ativo: number
  inativo: number
  nao_localizado: number
  total_vidas: number
  valor_ativo: number
  valor_inativo: number
  valor_nao_localizado: number
  valor_total_geral: number
  faixa_etaria_ativo?: FaixaEtariaItem[]
  faixa_etaria_inativo?: FaixaEtariaItem[]
  faixa_etaria_nao_localizado?: FaixaEtariaItem[]
  faixa_etaria_total?: FaixaEtariaItem[]
}

/**
 * Componente de cards de resumo de sinistralidade
 * Exibe 4 cards: Ativos, Inativos, Não Localizados e Total
 * OTIMIZADO: Processamento O(n) em vez de O(n²), memoização, logs de performance
 */
function CardsResumoComponent({ 
  dataInicio, 
  dataFim,
  operadoras,
  entidades,
  tipo,
  cpf
}: { 
  dataInicio: string
  dataFim: string
  operadoras?: string[]
  entidades?: string[]
  tipo?: string
  cpf?: string
}) {
  const [dados, setDados] = useState<SinistralidadeCards[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      if (!dataInicio || !dataFim) {
        setLoading(false)
        return
      }

      const fetchStartTime = performance.now()
      try {
        setLoading(true)
        setError(null)
        
        const params = new URLSearchParams({
          data_inicio: dataInicio,
          data_fim: dataFim,
        })
        
        if (operadoras && operadoras.length > 0) {
          params.append("operadoras", operadoras.join(","))
        }
        if (entidades && entidades.length > 0) {
          params.append("entidades", entidades.join(","))
        }
        if (tipo && tipo !== "Todos") {
          params.append("tipo", tipo)
        }
        if (cpf) {
          params.append("cpf", cpf)
        }
        
        const res = await fetch(
          `/api/sinistralidade/cards?${params}`,
          { cache: "no-store" }
        )
        
        const fetchDuration = performance.now() - fetchStartTime
        console.log(`[FRONTEND] CardsResumo fetch: ${Math.round(fetchDuration)}ms`)
        
        if (!res.ok) {
          const errorData = await res.json()
          throw new Error(errorData.error || "Erro ao carregar dados")
        }
        
        const json = await res.json()
        const processStartTime = performance.now()
        setDados(json)
        const processDuration = performance.now() - processStartTime
        console.log(`[FRONTEND] CardsResumo setState: ${Math.round(processDuration)}ms`)
      } catch (err: any) {
        setError(err.message || "Erro ao carregar dados")
        console.error("Erro ao carregar cards de sinistralidade:", err)
      } finally {
        setLoading(false)
      }
    }
    
    load()
  }, [dataInicio, dataFim, operadoras, entidades, tipo, cpf])

  // OTIMIZADO: Agregação O(n) em vez de O(n²) - uma única passada pelos dados
  // Memoizado para evitar recálculos desnecessários
  // IMPORTANTE: useMemo deve ser chamado ANTES de qualquer early return
  const aggregated = useMemo(() => {
    if (dados.length === 0) {
      return {
        totalAtivos: 0,
        totalInativos: 0,
        totalNaoLocalizados: 0,
        totalVidas: 0,
        valorAtivos: 0,
        valorInativos: 0,
        valorNaoLocalizados: 0,
        valorTotalGeral: 0,
        faixaEtariaAtivo: [] as FaixaEtariaItem[],
        faixaEtariaInativo: [] as FaixaEtariaItem[],
        faixaEtariaNaoLocalizado: [] as FaixaEtariaItem[],
        faixaEtariaTotal: [] as FaixaEtariaItem[],
      }
    }

    const renderStartTime = performance.now()
    
    // Agregar dados de todos os meses por status (soma simples)
    const totalAtivos = dados.reduce((sum, linha) => sum + linha.ativo, 0)
    const totalInativos = dados.reduce((sum, linha) => sum + linha.inativo, 0)
    const totalNaoLocalizados = dados.reduce((sum, linha) => sum + linha.nao_localizado, 0)
    const totalVidas = dados.reduce((sum, linha) => sum + linha.total_vidas, 0)
    
    const valorAtivos = dados.reduce((sum, linha) => sum + linha.valor_ativo, 0)
    const valorInativos = dados.reduce((sum, linha) => sum + linha.valor_inativo, 0)
    const valorNaoLocalizados = dados.reduce((sum, linha) => sum + linha.valor_nao_localizado, 0)
    const valorTotalGeral = dados.reduce((sum, linha) => sum + linha.valor_total_geral, 0)

    // OTIMIZADO: Agregar faixa etária em uma única passada (O(n) em vez de O(n²))
    const faixas = ["00 a 18", "19 a 23", "24 a 28", "29 a 33", "34 a 38", "39 a 43", "44 a 48", "49 a 53", "54 a 58", ">59"]
    
    // Inicializar acumuladores
    const acumuladores = {
      ativo: new Map<string, { vidas: number; valorGasto: number }>(),
      inativo: new Map<string, { vidas: number; valorGasto: number }>(),
      naoLocalizado: new Map<string, { vidas: number; valorGasto: number }>(),
      total: new Map<string, { vidas: number; valorGasto: number }>(),
    }

    // Uma única passada pelos dados (O(n))
    dados.forEach(linha => {
      // Processar faixa etária ativo
      linha.faixa_etaria_ativo?.forEach(item => {
        const atual = acumuladores.ativo.get(item.faixa) || { vidas: 0, valorGasto: 0 }
        acumuladores.ativo.set(item.faixa, {
          vidas: atual.vidas + (item.vidas || 0),
          valorGasto: atual.valorGasto + (item.valorGasto || 0),
        })
      })
      
      // Processar faixa etária inativo
      linha.faixa_etaria_inativo?.forEach(item => {
        const atual = acumuladores.inativo.get(item.faixa) || { vidas: 0, valorGasto: 0 }
        acumuladores.inativo.set(item.faixa, {
          vidas: atual.vidas + (item.vidas || 0),
          valorGasto: atual.valorGasto + (item.valorGasto || 0),
        })
      })
      
      // Processar faixa etária não localizado
      linha.faixa_etaria_nao_localizado?.forEach(item => {
        const atual = acumuladores.naoLocalizado.get(item.faixa) || { vidas: 0, valorGasto: 0 }
        acumuladores.naoLocalizado.set(item.faixa, {
          vidas: atual.vidas + (item.vidas || 0),
          valorGasto: atual.valorGasto + (item.valorGasto || 0),
        })
      })
      
      // Processar faixa etária total
      linha.faixa_etaria_total?.forEach(item => {
        const atual = acumuladores.total.get(item.faixa) || { vidas: 0, valorGasto: 0 }
        acumuladores.total.set(item.faixa, {
          vidas: atual.vidas + (item.vidas || 0),
          valorGasto: atual.valorGasto + (item.valorGasto || 0),
        })
      })
    })

    // Converter Maps para arrays ordenados
    const faixaEtariaAtivo: FaixaEtariaItem[] = faixas.map(faixa => {
      const dados = acumuladores.ativo.get(faixa) || { vidas: 0, valorGasto: 0 }
      return { faixa, vidas: dados.vidas, valorGasto: dados.valorGasto }
    })
    
    const faixaEtariaInativo: FaixaEtariaItem[] = faixas.map(faixa => {
      const dados = acumuladores.inativo.get(faixa) || { vidas: 0, valorGasto: 0 }
      return { faixa, vidas: dados.vidas, valorGasto: dados.valorGasto }
    })
    
    const faixaEtariaNaoLocalizado: FaixaEtariaItem[] = faixas.map(faixa => {
      const dados = acumuladores.naoLocalizado.get(faixa) || { vidas: 0, valorGasto: 0 }
      return { faixa, vidas: dados.vidas, valorGasto: dados.valorGasto }
    })
    
    const faixaEtariaTotal: FaixaEtariaItem[] = faixas.map(faixa => {
      const dados = acumuladores.total.get(faixa) || { vidas: 0, valorGasto: 0 }
      return { faixa, vidas: dados.vidas, valorGasto: dados.valorGasto }
    })

    const renderDuration = performance.now() - renderStartTime
    console.log(`[FRONTEND] CardsResumo aggregation: ${Math.round(renderDuration)}ms`)

    return {
      totalAtivos,
      totalInativos,
      totalNaoLocalizados,
      totalVidas,
      valorAtivos,
      valorInativos,
      valorNaoLocalizados,
      valorTotalGeral,
      faixaEtariaAtivo,
      faixaEtariaInativo,
      faixaEtariaNaoLocalizado,
      faixaEtariaTotal,
    }
  }, [dados])

  // Early returns APÓS todos os hooks
  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <p>Carregando...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded text-red-700">
        <p className="font-semibold">Erro ao carregar dados</p>
        <p className="text-sm">{error}</p>
      </div>
    )
  }

  if (dados.length === 0) {
    return (
      <div className="p-4 bg-gray-50 border border-gray-200 rounded text-gray-700">
        <p>Nenhum dado encontrado para o período selecionado.</p>
      </div>
    )
  }

  const {
    totalAtivos,
    totalInativos,
    totalNaoLocalizados,
    totalVidas,
    valorAtivos,
    valorInativos,
    valorNaoLocalizados,
    valorTotalGeral,
    faixaEtariaAtivo,
    faixaEtariaInativo,
    faixaEtariaNaoLocalizado,
    faixaEtariaTotal,
  } = aggregated

  // Grid responsivo: 4 cards em telas grandes (≥ 1280px), 2 em médias, 1 em pequenas
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
      {/* Card Ativos - Verde */}
      <SummaryCard
        title="Ativos"
        livesValue={totalAtivos}
        amountValue={valorAtivos}
        accentColorClass="text-emerald-600 dark:text-emerald-500"
        faixaEtaria={faixaEtariaAtivo}
        totalVidas={totalVidas}
      />

      {/* Card Inativos - Vermelho */}
      <SummaryCard
        title="Inativos"
        livesValue={totalInativos}
        amountValue={valorInativos}
        accentColorClass="text-red-600 dark:text-red-500"
        faixaEtaria={faixaEtariaInativo}
        totalVidas={totalVidas}
      />

      {/* Card Não Localizados - Laranja */}
      <SummaryCard
        title="Não Localizados"
        livesValue={totalNaoLocalizados}
        amountValue={valorNaoLocalizados}
        accentColorClass="text-orange-600 dark:text-orange-500"
        faixaEtaria={faixaEtariaNaoLocalizado}
        totalVidas={totalVidas}
      />

      {/* Card Total */}
      <SummaryCard
        title="Total Geral"
        livesValue={totalVidas}
        amountValue={valorTotalGeral}
        accentColorClass="text-black-600 dark:text-black-500"
        faixaEtaria={faixaEtariaTotal}
        totalVidas={totalVidas}
      />
    </div>
  )
}

// Função auxiliar para comparar arrays
const arraysEqual = (a?: string[], b?: string[]): boolean => {
  if (a === b) return true
  if (!a || !b) return a === b
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false
  }
  return true
}

// Memoizar componente para evitar re-renderizações desnecessárias
export const CardsResumo = memo(CardsResumoComponent, (prevProps, nextProps) => {
  if (prevProps.dataInicio !== nextProps.dataInicio) return false
  if (prevProps.dataFim !== nextProps.dataFim) return false
  if (!arraysEqual(prevProps.operadoras, nextProps.operadoras)) return false
  if (!arraysEqual(prevProps.entidades, nextProps.entidades)) return false
  if (prevProps.tipo !== nextProps.tipo) return false
  if (prevProps.cpf !== nextProps.cpf) return false
  return true
})

