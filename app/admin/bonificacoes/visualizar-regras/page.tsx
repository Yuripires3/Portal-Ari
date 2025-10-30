import { RegrasTable } from "./_components/RegrasTable"

export default function VisualizarRegrasPage() {
  return (
    <div className="p-6 space-y-6 max-w-[1800px] mx-auto">
      <div>
        <h1 className="text-3xl font-bold">Regras de Bonificação</h1>
        <p className="text-muted-foreground mt-1">Consulta somente leitura das regras cadastradas</p>
      </div>

      <RegrasTable readOnly />
    </div>
  )
}
