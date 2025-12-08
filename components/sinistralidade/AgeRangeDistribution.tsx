"use client"

import { useState, useEffect } from "react"
import { ChevronRight, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"

interface FaixaEtaria {
  faixa_etaria: string
  vidas: number
  valor: number
  is?: number | null
}

interface AgeRangeDistributionProps {
  plano: string
  filtros: {
    mesesReferencia: string[]
    operadoras?: string[]
    entidades?: string[]
    mesesReajuste?: string[]
    tipo?: string
    status?: string
  }
  totalVidas: number
}

export function AgeRangeDistribution({ 
  plano, 
  filtros, 
  totalVidas 
}: AgeRangeDistributionProps) {
  const [faixasEtarias, setFaixasEtarias] = useState<FaixaEtaria[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const loadFaixasEtarias = async () => {
      setLoading(true)
      setError(null)

      try {
        const params = new URLSearchParams({
          meses_referencia: filtros.mesesReferencia.join(","),
          plano: plano,
        })

        if (filtros.operadoras && filtros.operadoras.length > 0) {
          params.append("operadoras", filtros.operadoras.join(","))
        }

        if (filtros.entidades && filtros.entidades.length > 0) {
          params.append("entidades", filtros.entidades.join(","))
        }

        if (filtros.mesesReajuste && filtros.mesesReajuste.length > 0) {
          params.append("meses_reajuste", filtros.mesesReajuste.join(","))
        }

        if (filtros.tipo && filtros.tipo !== "Todos") {
          params.append("tipo", filtros.tipo)
        }

        if (filtros.status) {
          params.append("status", filtros.status)
        }

        const res = await fetch(`/api/sinistralidade/faixas-etarias-plano?${params}`, {
          cache: "no-store"
        })

        if (!res.ok) {
          throw new Error("Erro ao carregar faixas etárias")
        }

        const data = await res.json()
        setFaixasEtarias(data.faixas_etarias || [])
      } catch (err: any) {
        console.error("Erro ao carregar faixas etárias:", err)
        setError(err.message || "Erro ao carregar faixas etárias")
      } finally {
        setLoading(false)
      }
    }

    loadFaixasEtarias()
  }, [plano, filtros])

  const formatCurrency = (valor: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(valor)
  }

  const formatNumber = (valor: number) => {
    return new Intl.NumberFormat("pt-BR").format(valor)
  }

  const formatPercent = (valor: number | null | undefined) => {
    if (valor === null || valor === undefined || isNaN(valor)) {
      return "-"
    }
    return `${valor.toFixed(1)}%`
  }

  const getPctVidas = (vidas: number) => {
    return totalVidas > 0 ? (vidas / totalVidas) * 100 : 0
  }

  if (loading) {
    return (
      <div className="mt-2 flex items-center justify-center py-4">
        <Loader2 className="h-4 w-4 animate-spin text-[#184286]" />
        <span className="ml-2 text-xs text-slate-500">Carregando faixas etárias...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="mt-2 text-xs text-red-500 py-2">
        Erro: {error}
      </div>
    )
  }

  if (faixasEtarias.length === 0) {
    return null
  }

  return (
    <div className="mt-2 ml-4 border-l-2 border-slate-200 pl-3">
      {/* Cabeçalho */}
      <div className="mb-2">
        <div className="flex items-center py-1.5 text-[10px] font-semibold text-slate-500 uppercase tracking-wide">
          <span className="w-[90px] text-left">Faixa Etária</span>
          <span className="w-[60px] text-center">Vidas</span>
          <span className="w-[110px] text-center">Valor</span>
          <span className="w-[50px] text-center">%</span>
          <span className="w-[50px] text-center">IS</span>
        </div>
      </div>

      {/* Linhas */}
      <div className="space-y-1">
        {faixasEtarias.map((faixa) => {
          const pct = getPctVidas(faixa.vidas)
          
          return (
            <div
              key={faixa.faixa_etaria}
              className="flex items-center py-1.5 text-[11px] hover:bg-slate-50/60 transition-colors rounded"
            >
              {/* Faixa Etária */}
              <span className="w-[90px] text-left font-medium text-slate-700">
                {faixa.faixa_etaria}
              </span>

              {/* Vidas */}
              <span className="w-[60px] text-center font-semibold text-[#184286]">
                {formatNumber(faixa.vidas)}
              </span>

              {/* Valor */}
              <span className="w-[110px] text-center text-[#184286]">
                {formatCurrency(faixa.valor)}
              </span>

              {/* Percentual */}
              <span className="w-[50px] text-center text-slate-600">
                {pct.toFixed(1)}%
              </span>

              {/* IS */}
              <span className={cn(
                "w-[50px] text-center",
                faixa.is != null ? "text-[#184286]" : "text-slate-300"
              )}>
                {faixa.is != null ? formatPercent(faixa.is) : "-"}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

