export interface OperadoraDisplay {
  nomeExibicao: string
  iniciais: string
  corMarca: string
  corFundo: string
}

const OPERADORAS_CONHECIDAS: Array<{ match: RegExp; display: OperadoraDisplay }> = [
  { match: /unimed\s*rio/i, display: { nomeExibicao: "Unimed Rio", iniciais: "UR", corMarca: "#00995D", corFundo: "#f0faf5" } },
  { match: /^assim/i, display: { nomeExibicao: "ASSIM SAÚDE", iniciais: "AS", corMarca: "#1a1a1a", corFundo: "#f5f5f5" } },
  { match: /seguros\s*unimed/i, display: { nomeExibicao: "SEGUROS Unimed", iniciais: "SU", corMarca: "#003DA5", corFundo: "#eef3fb" } },
  { match: /leve/i, display: { nomeExibicao: "Leve Saúde", iniciais: "LS", corMarca: "#00A651", corFundo: "#f0faf4" } },
  { match: /nova\s*sa[uú]de/i, display: { nomeExibicao: "NOVA SAÚDE", iniciais: "NS", corMarca: "#E31937", corFundo: "#fef2f3" } },
  { match: /^blue/i, display: { nomeExibicao: "blue.", iniciais: "BL", corMarca: "#0066CC", corFundo: "#eef5fc" } },
  { match: /hapvida|notredame/i, display: { nomeExibicao: "Hapvida NotreDame", iniciais: "HN", corMarca: "#FF6600", corFundo: "#fff8f0" } },
  { match: /oplan/i, display: { nomeExibicao: "Oplan", iniciais: "OP", corMarca: "#1B4F9B", corFundo: "#eef3fa" } },
  { match: /healthmed/i, display: { nomeExibicao: "HealthMed", iniciais: "HM", corMarca: "#2E7D32", corFundo: "#f1f8f2" } },
  { match: /[ôo]nix/i, display: { nomeExibicao: "SAÚDE ÔNIX", iniciais: "OX", corMarca: "#6A1B9A", corFundo: "#f6f0fa" } },
  { match: /medsenior|med\s*senior/i, display: { nomeExibicao: "MedSênior", iniciais: "MS", corMarca: "#4CAF50", corFundo: "#f3faf3" } },
  { match: /amil/i, display: { nomeExibicao: "Amil", iniciais: "AM", corMarca: "#00AEEF", corFundo: "#eef9fd" } },
  { match: /integral/i, display: { nomeExibicao: "Integral Saúde", iniciais: "IS", corMarca: "#1565C0", corFundo: "#eef4fb" } },
  { match: /aesp/i, display: { nomeExibicao: "AESP Odonto", iniciais: "AE", corMarca: "#F57C00", corFundo: "#fff8ee" } },
  { match: /consolidado|^qv total$/i, display: { nomeExibicao: "CONSOLIDADO", iniciais: "QV", corMarca: "#184286", corFundo: "#e8edf5" } },
  { match: /klini/i, display: { nomeExibicao: "Klini Saúde", iniciais: "KL", corMarca: "#00838F", corFundo: "#eef8f9" } },
  { match: /select/i, display: { nomeExibicao: "Select Saúde", iniciais: "SL", corMarca: "#5C6BC0", corFundo: "#f0f1fa" } },
  { match: /samp/i, display: { nomeExibicao: "Samp", iniciais: "SA", corMarca: "#C62828", corFundo: "#fdf2f2" } },
]

/** Ordem visual do Excel (de cima para baixo nos prints). */
export const PRIORIDADE_OPERADORAS = [
  "unimed rio",
  "assim",
  "seguros unimed",
  "leve",
  "nova saúde",
  "nova saude",
  "blue",
  "hapvida",
  "oplan",
  "healthmed",
  "ônix",
  "onix",
  "medsenior",
  "amil",
  "integral",
  "aesp",
]

export function resolverDisplayOperadora(nome: string): OperadoraDisplay {
  const normalizado = nome.trim()
  if (/^consolidado$/i.test(normalizado)) {
    return OPERADORAS_CONHECIDAS.find((o) => o.match.test("consolidado"))!.display
  }

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
