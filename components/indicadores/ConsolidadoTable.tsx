"use client"

import { MESES_LABELS, MESES_NUMEROS } from "@/lib/indicadores/constants"
import type { ConsolidadoOperadora, MesNumero } from "@/lib/indicadores/types"
import { formatIndicadorValor } from "@/utils/format"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

interface ConsolidadoTableProps {
  operadora: ConsolidadoOperadora
  mesesVisiveis?: MesNumero[]
}

export function ConsolidadoTable({ operadora, mesesVisiveis = MESES_NUMEROS }: ConsolidadoTableProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">{operadora.operadora}</CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full min-w-[900px] border-collapse text-sm">
          <thead>
            <tr className="border-b bg-muted/40">
              <th className="sticky left-0 z-10 bg-muted/40 px-3 py-2 text-left font-medium min-w-[220px]">
                Indicador
              </th>
              {mesesVisiveis.map((mes) => (
                <th key={mes} className="px-2 py-2 text-right font-medium whitespace-nowrap">
                  {MESES_LABELS[mes]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {operadora.linhas.map((linha) => (
              <tr key={linha.key} className="border-b hover:bg-muted/20">
                <td className="sticky left-0 z-10 bg-background px-3 py-1.5 font-medium text-muted-foreground">
                  {linha.label}
                </td>
                {mesesVisiveis.map((mes) => (
                  <td key={mes} className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap">
                    {formatIndicadorValor(linha.valores[mes], linha.formato)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  )
}
