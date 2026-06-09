"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/components/auth/auth-provider"
import { isAdmin } from "@/lib/permissions"
import { useToast } from "@/hooks/use-toast"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { ConsolidadoFiltros } from "@/components/indicadores/ConsolidadoFiltros"
import { ConsolidadoHeader } from "@/components/indicadores/ConsolidadoHeader"
import { ConsolidadoOperadoraBlock } from "@/components/indicadores/ConsolidadoOperadoraBlock"
import { signalPageLoaded } from "@/components/ui/page-loading"
import {
  criarFiltrosPadrao,
  mesesVisiveisPorFiltro,
  STORAGE_KEY_FILTROS,
} from "@/lib/indicadores/consolidado-filtros-utils"
import { ANOS_INDICADORES_FIXOS } from "@/lib/indicadores/static-data-service"
import type { ConsolidadoFiltrosState, ConsolidadoResponse } from "@/lib/indicadores/types"

const fetchNoStore = (url: string) => fetch(url, { cache: "no-store" })

const ANOS_FALLBACK: number[] = [...ANOS_INDICADORES_FIXOS]

function carregarFiltrosPersistidos(): ConsolidadoFiltrosState {
  if (typeof window === "undefined") return criarFiltrosPadrao()
  try {
    const raw = localStorage.getItem(STORAGE_KEY_FILTROS)
    if (!raw) return criarFiltrosPadrao()
    return { ...criarFiltrosPadrao(), ...JSON.parse(raw) }
  } catch {
    return criarFiltrosPadrao()
  }
}

export default function IndicadoresConsolidadoPage() {
  const { user } = useAuth()
  const router = useRouter()
  const { toast } = useToast()
  const usuarioAdmin = isAdmin(user)

  const [filtros, setFiltros] = useState<ConsolidadoFiltrosState>(criarFiltrosPadrao)
  const [anos, setAnos] = useState<number[]>(ANOS_FALLBACK)
  const [dados, setDados] = useState<ConsolidadoResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    setFiltros(carregarFiltrosPersistidos())
  }, [])

  useEffect(() => {
    if (typeof window === "undefined") return
    localStorage.setItem(STORAGE_KEY_FILTROS, JSON.stringify(filtros))
  }, [filtros])

  useEffect(() => {
    if (user && !usuarioAdmin) {
      router.replace("/admin")
    }
  }, [user, usuarioAdmin, router])

  const carregarAnos = useCallback(async () => {
    // Abas fixas 2021–2026 (dados estáticos do Excel)
    setAnos(ANOS_FALLBACK)
    try {
      const res = await fetchNoStore("/api/indicadores/anos")
      if (res.ok) {
        const json = await res.json()
        if (json.anos?.length) {
          setAnos(json.anos)
          if (!json.anos.includes(filtros.ano)) {
            setFiltros((f) => ({ ...f, ano: json.anos[0] }))
          }
          return
        }
      }
    } catch {
      // mantém ANOS_FALLBACK
    }
    if (!ANOS_FALLBACK.includes(filtros.ano)) {
      setFiltros((f) => ({ ...f, ano: ANOS_FALLBACK[0] }))
    }
  }, [filtros.ano])

  const carregarConsolidado = useCallback(
    async (anoSelecionado: number) => {
      setLoading(true)
      setErro(null)
      try {
        const res = await fetchNoStore(`/api/indicadores/consolidado?ano=${anoSelecionado}`)
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(body.error || "Erro ao carregar consolidado")
        }
        const json: ConsolidadoResponse = await res.json()
        setDados(json)
        const ultimoMesDisponivel = json.mesesDisponiveis.at(-1)
        if (ultimoMesDisponivel) {
          setFiltros((atuais) => {
            if (atuais.ano !== anoSelecionado || json.mesesDisponiveis.includes(atuais.mesAte)) {
              return atuais
            }
            return { ...atuais, mesAte: ultimoMesDisponivel }
          })
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Erro desconhecido"
        setErro(msg)
        setDados(null)
        toast({ title: "Erro", description: msg, variant: "destructive" })
      } finally {
        setLoading(false)
        signalPageLoaded("indicadores-consolidado")
      }
    },
    [toast]
  )

  useEffect(() => {
    if (!usuarioAdmin) return
    carregarAnos().catch(() => setAnos(ANOS_FALLBACK))
  }, [usuarioAdmin, carregarAnos])

  useEffect(() => {
    if (!usuarioAdmin) return
    carregarConsolidado(filtros.ano)
  }, [usuarioAdmin, filtros.ano, carregarConsolidado])

  const mesesVisiveis = useMemo(
    () =>
      mesesVisiveisPorFiltro(
        filtros.ano,
        filtros.mesAte,
        dados?.mesesDisponiveis
      ),
    [dados?.mesesDisponiveis, filtros.ano, filtros.mesAte]
  )

  const operadoras = dados?.operadoras ?? []
  const consolidadoGeral = dados?.consolidadoGeral ?? null
  const operadorasAposConsolidado = dados?.operadorasAposConsolidado ?? []

  if (!usuarioAdmin) {
    return null
  }

  const vazio = !loading && !erro && (!dados || dados.operadoras.length === 0)

  return (
    <div className="min-h-full bg-[#dde4ec] p-3 md:p-5 space-y-4">
      {/* Cabeçalho + filtros integrados (estrutura do Excel) */}
      <div className="overflow-hidden rounded-lg shadow-md">
        <ConsolidadoHeader ano={filtros.ano} />
        <ConsolidadoFiltros
          filtros={filtros}
          anosDisponiveis={anos}
          mesesDisponiveis={dados?.mesesDisponiveis ?? []}
          onChange={setFiltros}
        />
      </div>

      {loading && (
        <div className="space-y-4">
          <Skeleton className="h-52 w-full rounded-lg" />
          <Skeleton className="h-52 w-full rounded-lg" />
          <Skeleton className="h-52 w-full rounded-lg" />
        </div>
      )}

      {erro && !loading && (
        <Card className="border-destructive/50 bg-white">
          <CardHeader>
            <CardTitle className="text-destructive">Falha ao carregar dados</CardTitle>
            <CardDescription>{erro}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => carregarConsolidado(filtros.ano)}>Tentar novamente</Button>
          </CardContent>
        </Card>
      )}

      {vazio && (
        <Card className="bg-white">
          <CardHeader>
            <CardTitle>Nenhum dado encontrado</CardTitle>
            <CardDescription>
              Não há dados para o ano {filtros.ano} no arquivo de indicadores.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {!loading && !erro && dados && operadoras.length > 0 && (
        <div className="space-y-4">
          {operadoras.map((op) => (
            <ConsolidadoOperadoraBlock
              key={op.operadora}
              operadora={op}
              mesesVisiveis={mesesVisiveis}
              ano={filtros.ano}
            />
          ))}

          {consolidadoGeral && (
            <ConsolidadoOperadoraBlock
              operadora={consolidadoGeral}
              mesesVisiveis={mesesVisiveis}
              ano={filtros.ano}
            />
          )}

          {operadorasAposConsolidado.map((op) => (
            <ConsolidadoOperadoraBlock
              key={op.operadora}
              operadora={op}
              mesesVisiveis={mesesVisiveis}
              ano={filtros.ano}
            />
          ))}
        </div>
      )}
    </div>
  )
}
