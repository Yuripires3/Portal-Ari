"use client"

import { useState, useEffect } from "react"
import { Loader2, X } from "lucide-react"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"

/** Converte string de data (DD/MM/YYYY ou YYYY-MM-DD) para Date. Retorna null se inválida. */
function parseDataBR(s: string): Date | null {
  const t = s.trim()
  if (!t) return null
  if (t.includes("/")) {
    const [d, m, y] = t.split("/").map(Number)
    if (!d || !m || !y || m < 1 || m > 12 || d < 1 || d > 31) return null
    const date = new Date(y, m - 1, d)
    if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return null
    return date
  }
  const iso = new Date(t)
  return isNaN(iso.getTime()) ? null : iso
}

type Props = {
  modo?: "automatico" | "periodo"
  defaultInicio?: string // DD/MM/YYYY ou YYYY-MM-DD
  defaultFim?: string    // DD/MM/YYYY ou YYYY-MM-DD
  onExecutar?: (params: {modo: "automatico"|"periodo"; inicio?: string; fim?: string}) => void
  onCancelar?: () => void
  isLoading?: boolean
  loadingText?: string
  showCancel?: boolean
}

export function ConfiguracaoExecucaoCard({
  modo: modoProp = "automatico",
  defaultInicio = "",
  defaultFim = "",
  onExecutar,
  onCancelar,
  isLoading = false,
  loadingText,
  showCancel = false
}: Props) {
  const [modo, setModo] = useState<"automatico" | "periodo">(modoProp)
  const [dataInicial, setDataInicial] = useState(defaultInicio)
  const [dataFinal, setDataFinal] = useState(defaultFim)
  const [erroValidacao, setErroValidacao] = useState("")

  // Sincronizar props externas
  useEffect(() => {
    setModo(modoProp)
  }, [modoProp])

  useEffect(() => {
    setDataInicial(defaultInicio)
  }, [defaultInicio])

  useEffect(() => {
    setDataFinal(defaultFim)
  }, [defaultFim])

  // Validação (aceita DD/MM/YYYY ou YYYY-MM-DD)
  useEffect(() => {
    if (modo === "periodo") {
      if (!dataInicial || !dataFinal) {
        setErroValidacao("Data inicial e data final são obrigatórias")
        return
      }

      const dtInicial = parseDataBR(dataInicial)
      const dtFinal = parseDataBR(dataFinal)

      if (!dtInicial || !dtFinal) {
        setErroValidacao("Use o formato DD/MM/AAAA (ex: 01/09/2025)")
        return
      }

      if (dtInicial > dtFinal) {
        setErroValidacao("Data inicial não pode ser maior que data final")
        return
      }

      setErroValidacao("")
    } else {
      setErroValidacao("")
    }
  }, [modo, dataInicial, dataFinal])

  const handleExecutar = () => {
    if (modo === "periodo" && (!dataInicial || !dataFinal || erroValidacao)) {
      return
    }

    onExecutar?.({
      modo,
      inicio: modo === "periodo" ? dataInicial : undefined,
      fim: modo === "periodo" ? dataFinal : undefined
    })
  }

  const isValid = modo === "automatico" || (dataInicial && dataFinal && !erroValidacao)

  return (
    <div className="rounded-2xl border border-zinc-200/70 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900 p-6 space-y-6">
      {/* Cabeçalho */}
      <div className="space-y-2">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
          Configuração de Execução
        </h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Selecione o modo de execução
        </p>
      </div>

      {/* Modo de Execução */}
      <div className="space-y-3">
        <Label htmlFor="modo-execucao" className="text-sm font-medium text-gray-900 dark:text-gray-100">
          Modo de execução
        </Label>
        <RadioGroup
          value={modo}
          onValueChange={(v) => setModo(v as "automatico" | "periodo")}
          role="radiogroup"
          aria-labelledby="modo-execucao"
          aria-describedby="modo-execucao-desc"
        >
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <div className="flex items-center gap-2">
              <RadioGroupItem
                value="automatico"
                id="automatico"
                className="focus:ring-2 focus:ring-primary/40 focus:ring-offset-2"
              />
              <Label
                htmlFor="automatico"
                className="cursor-pointer font-medium text-sm text-gray-900 dark:text-gray-100"
              >
                Automático (30 dias)
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem
                value="periodo"
                id="periodo"
                className="focus:ring-2 focus:ring-primary/40 focus:ring-offset-2"
              />
              <Label
                htmlFor="periodo"
                className="cursor-pointer font-medium text-sm text-gray-900 dark:text-gray-100"
              >
                Por período
              </Label>
            </div>
          </div>
        </RadioGroup>
        <p id="modo-execucao-desc" className="sr-only">
          Selecione o modo de execução: automático para calcular 30 dias automaticamente ou por período para definir datas específicas
        </p>
      </div>

      {/* Campos de Data (quando modo período) */}
      {modo === "periodo" && (
        <fieldset className="space-y-3">
          <legend className="sr-only">Campos de data para período</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="dataInicial" className="text-sm font-medium text-gray-900 dark:text-gray-100">
                Data inicial <span className="text-red-600 dark:text-red-400">*</span>
              </Label>
              <Input
                id="dataInicial"
                type="text"
                inputMode="numeric"
                placeholder="DD/MM/AAAA (ex: 01/09/2025)"
                value={dataInicial}
                onChange={(e) => setDataInicial(e.target.value)}
                required
                aria-required="true"
                aria-invalid={erroValidacao ? "true" : "false"}
                className="w-full font-mono"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dataFinal" className="text-sm font-medium text-gray-900 dark:text-gray-100">
                Data final <span className="text-red-600 dark:text-red-400">*</span>
              </Label>
              <Input
                id="dataFinal"
                type="text"
                inputMode="numeric"
                placeholder="DD/MM/AAAA (ex: 02/02/2026)"
                value={dataFinal}
                onChange={(e) => setDataFinal(e.target.value)}
                required
                aria-required="true"
                aria-invalid={erroValidacao ? "true" : "false"}
                className="w-full font-mono"
              />
            </div>
          </div>
          {(dataInicial || dataFinal) && (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => {
                  setDataInicial("")
                  setDataFinal("")
                }}
                className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:text-zinc-900 bg-zinc-100 hover:bg-zinc-200 rounded-lg transition-colors dark:text-zinc-400 dark:hover:text-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700"
                aria-label="Limpar datas"
              >
                <X className="h-3 w-3" />
                Limpar datas
              </button>
            </div>
          )}
          {erroValidacao && (
            <p
              role="alert"
              aria-live="polite"
              className="text-xs text-red-600 dark:text-red-400 mt-1"
            >
              {erroValidacao}
            </p>
          )}
        </fieldset>
      )}

      {/* Informação Automático */}
      {modo === "automatico" && (
        <div className="rounded-lg bg-zinc-50 dark:bg-zinc-800/50 p-4 space-y-2 border border-zinc-200 dark:border-zinc-700">
          <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
            Período calculado automaticamente:
          </p>
          <p className="text-xs text-zinc-600 dark:text-zinc-400">
            O sistema calculará automaticamente o período de 30 dias a partir do dia útil anterior à data atual.
          </p>
        </div>
      )}

      {/* Ações */}
      <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        {showCancel && onCancelar && (
          <button
            onClick={onCancelar}
            disabled={isLoading}
            className="inline-flex items-center justify-center rounded-lg px-4 py-2.5 font-medium text-zinc-700 bg-zinc-100 hover:bg-zinc-200 disabled:opacity-60 disabled:cursor-not-allowed dark:text-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 transition-colors"
          >
            Cancelar cálculo
          </button>
        )}
        <button
          onClick={handleExecutar}
          disabled={isLoading || !isValid}
          className="inline-flex items-center justify-center rounded-lg px-5 py-2.5 font-medium text-white bg-[#384c6d] hover:bg-[#2f3f5e] disabled:opacity-60 disabled:cursor-not-allowed transition-colors w-full sm:w-auto"
        >
          {isLoading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {loadingText || "Executando..."}
            </>
          ) : (
            "Executar cálculo"
          )}
        </button>
      </div>
    </div>
  )
}

