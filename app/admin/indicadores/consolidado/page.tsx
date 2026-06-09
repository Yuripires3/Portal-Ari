"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/components/auth/auth-provider"
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
  filtrarOperadoras,
  listarNomesOperadoras,
  mesesVisiveisPorFiltro,
  STORAGE_KEY_FILTROS,
} from "@/lib/indicadores/consolidado-filtros-utils"
import type { ConsolidadoFiltrosState, ConsolidadoResponse } from "@/lib/indicadores/types"

const fetchNoStore = (url: string) => fetch(url, { cache: "no-store" })

const ANOS_FALLBACK = [2026, 2025, 2024, 2023, 2022, 2021]

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
  const { user } = useAuth() as { user?: { role?: string } }
  const router = useRouter()
  const { toast } = useToast()

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
    if (user && user.role !== "admin") {
      router.replace("/admin")
    }
  }, [user, router])

  const carregarAnos = useCallback(async () => {
    const res = await fetchNoStore("/api/indicadores/anos")
    if (!res.ok) throw new Error("Não foi possível carregar os anos disponíveis")
    const json = await res.json()
    const lista: number[] = json.anos?.length ? json.anos : ANOS_FALLBACK
    setAnos(lista)
    if (lista.length > 0 && !lista.includes(filtros.ano)) {
      setFiltros((f) => ({ ...f, ano: lista[0] }))
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
    if (user?.role !== "admin") return
    carregarAnos().catch(() => setAnos(ANOS_FALLBACK))
  }, [user, carregarAnos])

  useEffect(() => {
    if (user?.role !== "admin") return
    carregarConsolidado(filtros.ano)
  }, [user, filtros.ano, carregarConsolidado])

  const operadorasFiltradas = useMemo(
    () => (dados ? filtrarOperadoras(dados, filtros) : []),
    [dados, filtros]
  )

  const mesesVisiveis = useMemo(() => mesesVisiveisPorFiltro(filtros.mesAte), [filtros.mesAte])

  const nomesOperadoras = useMemo(
    () => (dados ? listarNomesOperadoras(dados) : []),
    [dados]
  )

  const exibirConsolidado =
    filtros.exibirConsolidadoGeral &&
    dados?.consolidadoGeral &&
    operadorasFiltradas.length === dados.operadoras.length &&
    !filtros.buscaOperadora.trim() &&
    !filtros.modoPersonalizado

  if (user?.role !== "admin") {
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
          nomesOperadoras={nomesOperadoras}
          totalOperadoras={dados?.operadoras.length ?? 0}
          exibindoOperadoras={operadorasFiltradas.length}
          loading={loading}
          onChange={setFiltros}
          onAtualizar={() => carregarConsolidado(filtros.ano)}
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

      {!loading && !erro && dados && operadorasFiltradas.length > 0 && (
        <div className="space-y-4">
          {operadorasFiltradas.map((op) => (
            <ConsolidadoOperadoraBlock
              key={op.operadora}
              operadora={op}
              mesesVisiveis={mesesVisiveis}
            />
          ))}

          {exibirConsolidado && dados.consolidadoGeral && (
            <ConsolidadoOperadoraBlock
              operadora={dados.consolidadoGeral}
              mesesVisiveis={mesesVisiveis}
            />
          )}
        </div>
      )}

      {!loading && !erro && dados && dados.operadoras.length > 0 && operadorasFiltradas.length === 0 && (
        <Card className="bg-white">
          <CardHeader>
            <CardTitle>Nenhuma operadora no filtro</CardTitle>
            <CardDescription>
              Ajuste a busca ou selecione outras operadoras para exibir os indicadores.
            </CardDescription>
          </CardHeader>
        </Card>
      )}
    </div>
  )
}
