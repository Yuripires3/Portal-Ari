"use client"

import { useEffect, useState } from "react"
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
 */
export function CardsResumo({ dataInicio, dataFim }: { dataInicio: string; dataFim: string }) {
  const [dados, setDados] = useState<SinistralidadeCards[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      if (!dataInicio || !dataFim) {
        setLoading(false)
        return
      }

      try {
        setLoading(true)
        setError(null)
        const res = await fetch(
          `/api/sinistralidade/cards?data_inicio=${dataInicio}&data_fim=${dataFim}`,
          { cache: "no-store" }
        )
        
        if (!res.ok) {
          const errorData = await res.json()
          throw new Error(errorData.error || "Erro ao carregar dados")
        }
        
        const json = await res.json()
        setDados(json)
      } catch (err: any) {
        setError(err.message || "Erro ao carregar dados")
        console.error("Erro ao carregar cards de sinistralidade:", err)
      } finally {
        setLoading(false)
      }
    }
    
    load()
  }, [dataInicio, dataFim])

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

  // Agregar dados de todos os meses por status
  const totalAtivos = dados.reduce((sum, linha) => sum + linha.ativo, 0)
  const totalInativos = dados.reduce((sum, linha) => sum + linha.inativo, 0)
  const totalNaoLocalizados = dados.reduce((sum, linha) => sum + linha.nao_localizado, 0)
  const totalVidas = dados.reduce((sum, linha) => sum + linha.total_vidas, 0)
  
  const valorAtivos = dados.reduce((sum, linha) => sum + linha.valor_ativo, 0)
  const valorInativos = dados.reduce((sum, linha) => sum + linha.valor_inativo, 0)
  const valorNaoLocalizados = dados.reduce((sum, linha) => sum + linha.valor_nao_localizado, 0)
  const valorTotalGeral = dados.reduce((sum, linha) => sum + linha.valor_total_geral, 0)

  // Agregar faixa etária de todos os meses
  const faixas = ["00 a 18", "19 a 23", "24 a 28", "29 a 33", "34 a 38", "39 a 43", "44 a 48", "49 a 53", "54 a 58", ">59"]
  
  const faixaEtariaAtivo: FaixaEtariaItem[] = faixas.map(faixa => ({
    faixa,
    vidas: dados.reduce((sum, linha) => {
      const item = linha.faixa_etaria_ativo?.find(f => f.faixa === faixa)
      return sum + (item?.vidas || 0)
    }, 0),
    valorGasto: dados.reduce((sum, linha) => {
      const item = linha.faixa_etaria_ativo?.find(f => f.faixa === faixa)
      return sum + (item?.valorGasto || 0)
    }, 0),
  }))
  
  const faixaEtariaInativo: FaixaEtariaItem[] = faixas.map(faixa => ({
    faixa,
    vidas: dados.reduce((sum, linha) => {
      const item = linha.faixa_etaria_inativo?.find(f => f.faixa === faixa)
      return sum + (item?.vidas || 0)
    }, 0),
    valorGasto: dados.reduce((sum, linha) => {
      const item = linha.faixa_etaria_inativo?.find(f => f.faixa === faixa)
      return sum + (item?.valorGasto || 0)
    }, 0),
  }))
  
  const faixaEtariaNaoLocalizado: FaixaEtariaItem[] = faixas.map(faixa => ({
    faixa,
    vidas: dados.reduce((sum, linha) => {
      const item = linha.faixa_etaria_nao_localizado?.find(f => f.faixa === faixa)
      return sum + (item?.vidas || 0)
    }, 0),
    valorGasto: dados.reduce((sum, linha) => {
      const item = linha.faixa_etaria_nao_localizado?.find(f => f.faixa === faixa)
      return sum + (item?.valorGasto || 0)
    }, 0),
  }))
  
  const faixaEtariaTotal: FaixaEtariaItem[] = faixas.map(faixa => ({
    faixa,
    vidas: dados.reduce((sum, linha) => {
      const item = linha.faixa_etaria_total?.find(f => f.faixa === faixa)
      return sum + (item?.vidas || 0)
    }, 0),
    valorGasto: dados.reduce((sum, linha) => {
      const item = linha.faixa_etaria_total?.find(f => f.faixa === faixa)
      return sum + (item?.valorGasto || 0)
    }, 0),
  }))

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

