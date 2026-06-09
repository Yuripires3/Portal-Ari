/**
 * Service do Consolidado — lê dados estáticos gerados a partir de data/indicadores.xlsx.
 * O Excel (2021–mai/2026) é a fonte de verdade; regenere com: python scripts/gerar_indicadores_json.py
 */
export {
  buscarAnosDisponiveisEstaticos as buscarAnosDisponiveis,
  buscarConsolidadoEstatico as buscarConsolidado,
} from "./static-data-service"
