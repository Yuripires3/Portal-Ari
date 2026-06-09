export interface OperadoraDisplay {
  nomeExibicao: string
  iniciais: string
  corMarca: string
  corFundo: string
}

const OPERADORAS_CONHECIDAS: Array<{ match: RegExp; display: OperadoraDisplay }> = [
  {
    match: /unimed\s*rio/i,
    display: {
      nomeExibicao: "Unimed Rio",
      iniciais: "UR",
      corMarca: "#00995D",
      corFundo: "#f0faf5",
    },
  },
  {
    match: /assim/i,
    display: {
      nomeExibicao: "ASSIM SAÚDE",
      iniciais: "AS",
      corMarca: "#1a1a1a",
      corFundo: "#f5f5f5",
    },
  },
  {
    match: /seguros\s*unimed/i,
    display: {
      nomeExibicao: "SEGUROS Unimed",
      iniciais: "SU",
      corMarca: "#003DA5",
      corFundo: "#eef3fb",
    },
  },
]

/** Ordem visual do Excel (operadoras principais primeiro). */
export const PRIORIDADE_OPERADORAS = [
  "unimed rio",
  "assim saúde",
  "assim saude",
  "seguros unimed",
]

export function resolverDisplayOperadora(nome: string): OperadoraDisplay {
  const normalizado = nome.trim()
  for (const item of OPERADORAS_CONHECIDAS) {
    if (item.match.test(normalizado)) return item.display
  }

  const palavras = normalizado.split(/\s+/).filter(Boolean)
  const iniciais = palavras
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("")

  return {
    nomeExibicao: normalizado,
    iniciais: iniciais || "?",
    corMarca: "#184286",
    corFundo: "#f4f7fb",
  }
}

export function prioridadeOperadora(nome: string): number {
  const lower = nome.toLowerCase()
  const idx = PRIORIDADE_OPERADORAS.findIndex((p) => lower.includes(p))
  return idx === -1 ? 1000 : idx
}
