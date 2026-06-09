"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { RefreshCw, BarChart3 } from "lucide-react"
import { useAuth } from "@/components/auth/auth-provider"
import { useToast } from "@/hooks/use-toast"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { ConsolidadoTable } from "@/components/indicadores/ConsolidadoTable"
import { signalPageLoaded } from "@/components/ui/page-loading"
import { MESES_NUMEROS } from "@/lib/indicadores/constants"
import type { ConsolidadoResponse } from "@/lib/indicadores/types"

const fetchNoStore = (url: string) => fetch(url, { cache: "no-store" })

export default function IndicadoresConsolidadoPage() {
  const { user } = useAuth() as { user?: { role?: string } }
  const router = useRouter()
  const { toast } = useToast()

  const [anos, setAnos] = useState<number[]>([])
  const [ano, setAno] = useState<number>(new Date().getFullYear())
  const [dados, setDados] = useState<ConsolidadoResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    if (user && user.role !== "admin") {
      router.replace("/admin")
    }
  }, [user, router])

  const carregarAnos = useCallback(async () => {
    const res = await fetchNoStore("/api/indicadores/anos")
    if (!res.ok) throw new Error("Não foi possível carregar os anos disponíveis")
    const json = await res.json()
    const lista: number[] = json.anos ?? []
    setAnos(lista)
    if (lista.length > 0 && !lista.includes(ano)) {
      setAno(lista[0])
    }
  }, [ano])

  const carregarConsolidado = useCallback(async (anoSelecionado: number) => {
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
  }, [toast])

  useEffect(() => {
    if (user?.role !== "admin") return
    carregarAnos().catch(() => {
      setAnos([new Date().getFullYear()])
    })
  }, [user, carregarAnos])

  useEffect(() => {
    if (user?.role !== "admin") return
    carregarConsolidado(ano)
  }, [user, ano, carregarConsolidado])

  if (user?.role !== "admin") {
    return null
  }

  const mesesVisiveis = dados?.mesesDisponiveis?.length ? dados.mesesDisponiveis : MESES_NUMEROS
  const vazio = !loading && !erro && (!dados || dados.operadoras.length === 0)

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <BarChart3 className="h-8 w-8" />
            Indicadores — Consolidado
          </h1>
          <p className="text-muted-foreground mt-1">
            Visão mensal por operadora, equivalente às abas &quot;Relatório Indicadores&quot; do Excel.
          </p>
        </div>

        <div className="flex items-end gap-3">
          <div className="space-y-1">
            <Label htmlFor="ano">Ano</Label>
            <Select value={String(ano)} onValueChange={(v) => setAno(Number(v))}>
              <SelectTrigger id="ano" className="w-[120px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(anos.length > 0 ? anos : [ano]).map((a) => (
                  <SelectItem key={a} value={String(a)}>
                    {a}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button variant="outline" size="icon" onClick={() => carregarConsolidado(ano)} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {loading && (
        <div className="space-y-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      )}

      {erro && !loading && (
        <Card className="border-destructive/50">
          <CardHeader>
            <CardTitle className="text-destructive">Falha ao carregar dados</CardTitle>
            <CardDescription>{erro}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => carregarConsolidado(ano)}>Tentar novamente</Button>
          </CardContent>
        </Card>
      )}

      {vazio && (
        <Card>
          <CardHeader>
            <CardTitle>Nenhum dado encontrado</CardTitle>
            <CardDescription>
              Não há registros nas tabelas de indicadores para o ano {ano}. Verifique se o processo Python
              já alimentou os dados.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {!loading && !erro && dados && dados.operadoras.length > 0 && (
        <div className="space-y-6">
          {dados.operadoras.map((op) => (
            <ConsolidadoTable key={op.operadora} operadora={op} mesesVisiveis={mesesVisiveis} />
          ))}
        </div>
      )}
    </div>
  )
}
