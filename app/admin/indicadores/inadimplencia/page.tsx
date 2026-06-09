import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { AlertCircle } from "lucide-react"

export default function IndicadoresInadimplenciaPage() {
  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Indicadores — Inadimplência</h1>
        <p className="text-muted-foreground mt-1">Análise detalhada de inadimplência por operadora e período.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-muted-foreground" />
            Em breve
          </CardTitle>
          <CardDescription>
            Esta página será implementada em uma próxima etapa. O indicador de inadimplência do fechamento do mês
            já está disponível na visão Consolidado.
          </CardDescription>
        </CardHeader>
        <CardContent />
      </Card>
    </div>
  )
}
