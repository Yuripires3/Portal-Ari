"use client"

import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"
import { RegrasIdadeTable } from "./_components/RegrasIdadeTable"
import { Plus, X } from "lucide-react"
import { useAuth } from "@/components/auth/auth-provider"
import { canCreateRules, canImportRules, canEditRules } from "@/lib/permissions"
import { formatDateISO } from "@/lib/date-utils"

export const OPERADORAS = [
  "UNIMED RIO",
  "UNIMED NOVA IGUAÇÚ",
  "UNIMED LESTE FLUMINENSE",
  "UNIMED FERJ",
  "SEGUROS UNIMED",
  "ASSIM SAÚDE",
  "HAPVIDA NOTREDAME SP_RJ",
  "NOVA SAUDE",
  "HEALTH-MED",
  "OPLAN SAUDE",
  "ONIX",
  "KLINI",
  "BLUE",
  "AMIL",
  "INFINITY DOCTORS"
]

const TIPOS_FAIXA = [
  "Faixa 01",
  "Faixa 02",
  "Faixa 03",
  "Faixa 04",
  "Faixa 05",
  "Faixa 06",
  "Faixa 07",
  "Faixa 08",
  "Faixa 09",
  "Faixa 10",
  "Faixa 11",
  "Faixa 12",
  "Faixa única"
]

const PRODUTOS = ["ADESAO", "PME"]

const PAGAMENTO_POR = ["Vida", "Contrato"]

const TIPO_BENEFICIARIO = ["Titular", "Dependente"]

const PARCELAS = ["1ª Parcela","2ª Parcela","Única"]

export default function RegrasIdadePage() {
  const { toast } = useToast()
  const { user } = useAuth()
  const [loading, setLoading] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [tableRefreshKey, setTableRefreshKey] = useState(0)
  
  // Permissões baseadas na classificação do usuário
  const canCreate = canCreateRules(user)
  const canImport = canImportRules(user)
  const canEdit = canEditRules(user)
  const [operadoraQuery, setOperadoraQuery] = useState("")
  const [operadoraFocused, setOperadoraFocused] = useState(false)
  const normalize = (s: string) => s
    .normalize("NFD")
    .replace(/\p{Diacritic}+/gu, "")
    .toLowerCase()

  const sortAlpha = (list: string[]) =>
    [...list].sort((a, b) => normalize(String(a)).localeCompare(normalize(String(b))))
  const distinctClean = (values: any[]) => {
    const cleaned = values
      .filter((v) => v !== null && v !== undefined)
      .map((v) => String(v).trim())
      .filter((v) => v.length > 0)
    const set = new Set<string>()
    cleaned.forEach((v) => set.add(v))
    return Array.from(set)
  }
  const sortAlphaDesc = (list: string[]) =>
    sortAlpha(list).reverse()

  const [options, setOptions] = useState({
    tiposFaixa: sortAlpha(TIPOS_FAIXA as string[]),
    produtos: sortAlpha(PRODUTOS as string[]),
    pagamentoPor: sortAlpha(PAGAMENTO_POR as string[]),
    tipoBeneficiario: sortAlphaDesc(TIPO_BENEFICIARIO as string[]),
    parcelas: sortAlpha(PARCELAS as string[]),
    planos: [] as string[],
    chavesFaixa: [] as string[],
  })
  const [planoQuery, setPlanoQuery] = useState("")
  const [planoFocused, setPlanoFocused] = useState(false)
  const [loadingPlanos, setLoadingPlanos] = useState(false)
  const [produtoQuery, setProdutoQuery] = useState("")
  const [produtoFocused, setProdutoFocused] = useState(false)

  // Lote (upload/import)
  const [batchRows, setBatchRows] = useState<any[]>([])
  const [batchColumns, setBatchColumns] = useState<string[]>([])
  const [batchLoading, setBatchLoading] = useState(false)
  const [batchMessage, setBatchMessage] = useState<string>("")
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [formData, setFormData] = useState({
    vigencia: "",
    operadora: "",
    entidade: "",
    plano: "",
    tipoBeneficiario: "",
    idadeMin: "",
    idadeMax: "",
    chaveFaixa: ""
  })

  const handleChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  // Carrega listas globais (produtos e parcelas) ao montar a página
  useEffect(() => {
    // chamar sem filtros para preencher selects globais
    refreshDependentOptions()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Helpers para importação em lote
  const readFileAsText = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result || ""))
      reader.onerror = reject
      reader.readAsText(file)
    })
  }

  // Tenta obter a lib XLSX localmente; se falhar, carrega via CDN no navegador
  const getXLSX = async (): Promise<any> => {
    try {
      // @ts-ignore
      const mod = (await import("xlsx")).default || (await import("xlsx"))
      return mod
    } catch {
      // Fallback: carregar via CDN (browser only)
      return await new Promise((resolve, reject) => {
        if (typeof window === 'undefined') return reject(new Error('No window'))
        // @ts-ignore
        if (window.XLSX) {
          // @ts-ignore
          return resolve(window.XLSX)
        }
        const script = document.createElement('script')
        script.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js'
        script.async = true
        script.onload = () => {
          try {
            // @ts-ignore
            const XLSX = window.XLSX
            if (XLSX) resolve(XLSX)
            else reject(new Error('XLSX not available'))
          } catch (e) { reject(e as any) }
        }
        script.onerror = () => reject(new Error('Failed to load XLSX from CDN'))
        document.body.appendChild(script)
      })
    }
  }

  const normalizeHeader = (key: string) => {
    const k = key.trim().toLowerCase().replace(/\s+/g, "_")
    const map: Record<string, string> = {
      vigencia: "vigencia",
      data_vigencia: "vigencia",
      operadora: "operadora",
      entidade: "entidade",
      plano: "plano",
      idade_min: "idadeMin",
      idade_minima: "idadeMin",
      idade_max: "idadeMax",
      idade_maxima: "idadeMax",
      chave_faixa: "chaveFaixa",
      faixa: "chaveFaixa",
      parcela: "parcela",
      pagamento_por: "pagamentoPor",
      pagamento: "pagamentoPor",
      tipo_beneficiario: "tipoBeneficiario",
      beneficiario: "tipoBeneficiario",
      produto: "produto",
    }
    return map[k] || key
  }

  const parseCSV = (text: string): { columns: string[]; rows: any[] } => {
    const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0)
    if (lines.length === 0) return { columns: [], rows: [] }
    const headers = lines[0].split(",").map((h) => h.trim())
    const columns = headers.map((h) => normalizeHeader(h))
    const rows = lines.slice(1).map((line) => {
      const parts = line.split(",")
      const obj: any = {}
      parts.forEach((v, i) => {
        obj[columns[i] || headers[i] || `col_${i}`] = v.trim()
      })
      return obj
    })
    return { columns, rows }
  }

  // Normalização e confronto com o "banco" (listas conhecidas)
  const normalizeText = (s: string) =>
    (s || "")
      .normalize("NFD")
      .replace(/\p{Diacritic}+/gu, "")
      .toLowerCase()
      .replace(/[^a-z0-9 ]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()

  const levenshtein = (a: string, b: string) => {
    const m = a.length, n = b.length
    const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))
    for (let i = 0; i <= m; i++) dp[i][0] = i
    for (let j = 0; j <= n; j++) dp[0][j] = j
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1
        dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost)
      }
    }
    return dp[m][n]
  }

  const findSimilar = (value: string, candidates: string[]): string => {
    const v = normalizeText(value)
    if (!v) return value
    const normalizedMap = candidates.map((c) => ({ raw: c, norm: normalizeText(c) }))
    // 1) Igualdade exata normalizada
    const exact = normalizedMap.find((c) => c.norm === v)
    if (exact) return exact.raw
    // 2) Começa com
    const starts = normalizedMap.find((c) => c.norm.startsWith(v))
    if (starts) return starts.raw
    // 3) Contém
    const contains = normalizedMap.find((c) => c.norm.includes(v))
    if (contains) return contains.raw
    // 4) Menor distância de edição
    let best = normalizedMap[0]?.raw || value
    let bestDist = Infinity
    for (const c of normalizedMap) {
      const d = levenshtein(v, c.norm)
      if (d < bestDist) {
        bestDist = d
        best = c.raw
      }
    }
    return best
  }

  const harmonizeRowWithOptions = (row: any): any => {
    const next: any = { ...row }
    // Datas (vigencia): normalizar para YYYY-MM-DD
    const normalizeDate = (val: any): string => {
      if (val === null || val === undefined) return ""
      // Excel serial number
      if (typeof val === 'number' && !Number.isNaN(val)) {
        // Excel counts from 1899-12-30 (taking into account 1900 leap bug simplificado)
        const epoch = new Date(Date.UTC(1899, 11, 30))
        const ms = epoch.getTime() + Math.round(val) * 24 * 60 * 60 * 1000
        const d = new Date(ms)
        if (!Number.isNaN(d.getTime())) return formatDateISO(d)
      }
      let s = String(val).trim()
      // Remover sinais/formatos estranhos ex.: "+045658-01"
      if (/^[+\-]/.test(s)) s = s.replace(/^([+\-])/, "")
      if (!s) return ""
      // YYYY-MM-DD
      if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
      // DD/MM/YYYY or DD-MM-YYYY
      const m1 = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/)
      if (m1) {
        const dd = String(m1[1]).padStart(2, '0')
        const mm = String(m1[2]).padStart(2, '0')
        const yyyy = m1[3]
        return `${yyyy}-${mm}-${dd}`
      }
      // MM/DD/YYYY (se vier)
      const m2 = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/)
      if (m2) {
        const mm = String(m2[1]).padStart(2, '0')
        const dd = String(m2[2]).padStart(2, '0')
        const yyyy = m2[3]
        return `${yyyy}-${mm}-${dd}`
      }
      // Somente dígitos (pode ser DDMMAAAA, AAAAMMDD, ou um serial do Excel misturado)
      const onlyDigits = s.replace(/\D+/g, "")
      // Se parecer com um serial do Excel (5 ou 6 dígitos) dentro do texto
      if (onlyDigits.length >= 5 && onlyDigits.length <= 6) {
        const serial = parseInt(onlyDigits.slice(0, 6), 10)
        if (!Number.isNaN(serial)) {
          const epoch = new Date(Date.UTC(1899, 11, 30))
          const ms = epoch.getTime() + Math.round(serial) * 24 * 60 * 60 * 1000
          const d = new Date(ms)
          if (!Number.isNaN(d.getTime())) return formatDateISO(d)
        }
      }
      // 8 dígitos: tentar AAAAMMDD ou DDMMAAAA
      if (onlyDigits.length === 8) {
        const yyyy = onlyDigits.slice(0, 4)
        const mm = onlyDigits.slice(4, 6)
        const dd = onlyDigits.slice(6, 8)
        if (parseInt(yyyy, 10) >= 1900) {
          return `${yyyy}-${mm}-${dd}`
        } else {
          const d2 = onlyDigits.slice(0, 2)
          const m2 = onlyDigits.slice(2, 4)
          const y2 = onlyDigits.slice(4, 8)
          return `${y2}-${m2}-${d2}`
        }
      }
      // Fallback: tentar Date.parse
      const d = new Date(s)
      if (!Number.isNaN(d.getTime())) return formatDateISO(d)
      return s
    }
    // Operadora: manter valor original do arquivo, apenas normalizar se houver correspondência exata (case-insensitive)
    if (next.operadora) {
      const opOriginal = String(next.operadora).trim()
      const opNormalized = normalizeText(opOriginal)
      // Buscar correspondência exata (case-insensitive e sem acentos)
      const exactMatch = OPERADORAS.find(op => normalizeText(op) === opNormalized)
      if (exactMatch) {
        // Se encontrar match exato, usar o valor padronizado da lista para manter consistência
        next.operadora = exactMatch
      }
      // Caso contrário, manter o valor original do arquivo sem alterações
    }
    // Produto, Parcela, Pagamento por, Tipo Beneficiário via options atuais
    if (next.produto && options.produtos?.length) next.produto = findSimilar(next.produto, options.produtos)
    if (next.parcela && options.parcelas?.length) next.parcela = findSimilar(next.parcela, options.parcelas)
    if (next.pagamentoPor && options.pagamentoPor?.length) next.pagamentoPor = findSimilar(next.pagamentoPor, options.pagamentoPor)
    if (next.tipoBeneficiario && options.tipoBeneficiario?.length) next.tipoBeneficiario = findSimilar(next.tipoBeneficiario, options.tipoBeneficiario)
    // Plano: quando já houver operadora escolhida no formulário, mantemos livre;
    // em lote, tentamos harmonizar minimamente se tivermos uma lista
    if (next.plano && options.planos?.length) next.plano = findSimilar(next.plano, options.planos)
    // Normalizar campos numéricos de idade
    if (next.idadeMin) next.idadeMin = String(next.idadeMin).replace(/[^\d]/g, "")
    if (next.idadeMax) next.idadeMax = String(next.idadeMax).replace(/[^\d]/g, "")
    // Data
    if (next.vigencia) next.vigencia = normalizeDate(next.vigencia)
    return next
  }

  const handleFileUpload = async (file: File) => {
    try {
      setBatchLoading(true)
      setBatchMessage("")
      let parsed: { columns: string[]; rows: any[] } = { columns: [], rows: [] }
      if (file.name.toLowerCase().endsWith(".csv")) {
        const text = await readFileAsText(file)
        parsed = parseCSV(text)
      } else if (file.name.toLowerCase().endsWith(".xlsx")) {
        try {
          const XLSX: any = await getXLSX()
          const data = await file.arrayBuffer()
          const wb = XLSX.read(data, { type: "array" })
          const ws = wb.Sheets[wb.SheetNames[0]]
          const json = XLSX.utils.sheet_to_json(ws, { defval: "" }) as any[]
          const columns = json.length > 0 ? Object.keys(json[0]).map((h) => normalizeHeader(h)) : []
          const rows = json.map((row) => {
            const obj: any = {}
            Object.entries(row).forEach(([k, v]) => {
              obj[normalizeHeader(String(k))] = String(v ?? "").trim()
            })
            return obj
          })
          parsed = { columns, rows }
        } catch (err) {
          setBatchMessage("Para arquivos XLSX, é necessário o pacote 'xlsx'. Use CSV ou instale a dependência.")
          setBatchLoading(false)
          return
        }
      } else {
        setBatchMessage("Formato não suportado. Envie CSV ou XLSX.")
        setBatchLoading(false)
        return
      }

      // Garantir colunas padrão na visualização - campos específicos para faixas de idade
      const defaultOrder = [
        "vigencia",
        "operadora",
        "entidade",
        "plano",
        "tipoBeneficiario",
        "idadeMin",
        "idadeMax",
        "chaveFaixa"
      ]
      const columnsSet = new Set<string>([...parsed.columns, ...defaultOrder])
      const columns = defaultOrder.filter((c) => columnsSet.has(c))
      setBatchColumns(columns)

      // Validação básica de obrigatórios - campos específicos para faixas de idade
      const missing: string[] = []
      ;["vigencia", "operadora", "entidade", "plano", "idadeMin", "idadeMax"].forEach((key) => {
        if (!columns.includes(key)) missing.push(key)
      })
      if (missing.length > 0) {
        setBatchMessage(`Colunas obrigatórias ausentes: ${missing.join(", ")}.`)
      }
      // Normalizar dados minimamente
      const normRows = parsed.rows.map((r) => harmonizeRowWithOptions({
        ...r,
        idadeMin: r.idadeMin ?? r.idade_min ?? "",
        idadeMax: r.idadeMax ?? r.idade_max ?? "",
        chaveFaixa: r.chaveFaixa ?? r.chave_faixa ?? "",
      }))
      setBatchRows(normRows)
    } finally {
      setBatchLoading(false)
    }
  }

  const updateBatchCell = (rowIdx: number, key: string, value: string) => {
    setBatchRows((prev) => {
      const next = [...prev]
      next[rowIdx] = { ...next[rowIdx], [key]: value }
      return next
    })
  }

  const registerBatch = async () => {
    if (batchRows.length === 0) return
    setBatchLoading(true)
    setBatchMessage("")
    let ok = 0
    let fail = 0
    const errors: string[] = []
    
    for (let idx = 0; idx < batchRows.length; idx++) {
      const row = batchRows[idx]
      try {
        // Preparar e validar payload
        const vigencia = String(row.vigencia || "").trim()
        const operadora = String(row.operadora || "").trim()
        const entidade = String(row.entidade || "").trim()
        const plano = String(row.plano || "").trim()
        const tipoBeneficiario = String(row.tipoBeneficiario || "").trim()
        const idadeMinStr = String(row.idadeMin || row.idade_min || "").trim()
        const idadeMaxStr = String(row.idadeMax || row.idade_max || "").trim()
        const chaveFaixa = String(row.chaveFaixa || row.chave_faixa || "").trim()
        
        // Validar campos obrigatórios
        if (!vigencia || !operadora || !entidade || !plano || !idadeMinStr || !idadeMaxStr) {
          const missing = []
          if (!vigencia) missing.push("vigencia")
          if (!operadora) missing.push("operadora")
          if (!entidade) missing.push("entidade")
          if (!plano) missing.push("plano")
          if (!idadeMinStr) missing.push("idadeMin")
          if (!idadeMaxStr) missing.push("idadeMax")
          throw new Error(`Linha ${idx + 1}: Campos obrigatórios ausentes: ${missing.join(", ")}`)
        }
        
        // Converter idades para números
        const idadeMin = Number(idadeMinStr.replace(/[^\d]/g, ""))
        const idadeMax = Number(idadeMaxStr.replace(/[^\d]/g, ""))
        
        if (isNaN(idadeMin) || isNaN(idadeMax)) {
          throw new Error(`Linha ${idx + 1}: Idades inválidas (mínima: ${idadeMinStr}, máxima: ${idadeMaxStr})`)
        }
        
        const payload = {
          vigencia,
          operadora,
          entidade,
          plano,
          tipoBeneficiario: tipoBeneficiario || null,
          idadeMin,
          idadeMax,
          chaveFaixa: chaveFaixa || null
        }
        
        const res = await fetch('/api/bonificacoes/regras-idade', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        })
        
        if (!res.ok) {
          let errorMsg = `HTTP ${res.status}`
          try {
            const errorData = await res.json()
            errorMsg = errorData.error || errorData.message || errorMsg
          } catch {}
          throw new Error(`Linha ${idx + 1}: ${errorMsg}`)
        }
        
        ok++
      } catch (e) {
        fail++
        const errorMsg = e instanceof Error ? e.message : String(e)
        errors.push(errorMsg)
        console.error(`Erro na linha ${idx + 1}:`, errorMsg, row)
      }
    }
    
    const summaryMsg = `Registro em lote concluído: ${ok} sucesso(s), ${fail} falha(s).`
    setBatchMessage(summaryMsg)
    
    if (errors.length > 0) {
      const errorDetails = errors.slice(0, 5).join("; ")
      const moreErrors = errors.length > 5 ? ` ... e mais ${errors.length - 5} erro(s)` : ""
      toast({ 
        title: "Importação concluída com erros", 
        description: `${summaryMsg} Erros: ${errorDetails}${moreErrors}`,
        variant: fail > 0 ? "destructive" : "default"
      })
    } else {
      toast({ title: "Concluído", description: summaryMsg })
    }
    
    // Limpar preview apenas se todos foram processados com sucesso
    if (fail === 0) {
      setBatchRows([])
      setBatchColumns([])
      try { fileInputRef.current && (fileInputRef.current.value = "") } catch {}
      // Atualizar a tabela para mostrar os novos registros
      setTableRefreshKey(prev => prev + 1)
    }
    
    setBatchLoading(false)
  }

  const downloadTemplate = async () => {
    const headers = [
      "vigencia",
      "operadora",
      "entidade",
      "plano",
      "tipoBeneficiario",
      "idadeMin",
      "idadeMax",
      "chaveFaixa"
    ]
    try {
      const XLSX: any = await getXLSX()
      const ws = XLSX.utils.aoa_to_sheet([headers])
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, "Modelo")
      const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" })
      const blob = new Blob([wbout], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = "modelo_regras_idade.xlsx"
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (e) {
      setBatchMessage("Não foi possível gerar o XLSX (falha ao carregar a biblioteca). Tente novamente.")
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      // Validação
      const operadoraValue = (formData.operadora || operadoraQuery).trim()
      const planoValue = (formData.plano || planoQuery).trim()
      const entidadeValue = (formData.entidade || "").trim()
      const vigenciaValue = (formData.vigencia || "").trim()
      const idadeMinValue = (formData.idadeMin || "").trim()
      const idadeMaxValue = (formData.idadeMax || "").trim()
      
      if (!vigenciaValue || !operadoraValue || !entidadeValue || !planoValue || 
          !idadeMinValue || !idadeMaxValue) {
        toast({
          title: "Erro de validação",
          description: "Preencha todos os campos obrigatórios (vigência, operadora, entidade, plano, idade mínima e máxima)",
          variant: "destructive"
        })
        setLoading(false)
        return
      }
      
      // Validar se os valores numéricos são válidos
      const idadeMinNum = Number(idadeMinValue)
      const idadeMaxNum = Number(idadeMaxValue)
      if (isNaN(idadeMinNum) || isNaN(idadeMaxNum)) {
        toast({
          title: "Erro de validação",
          description: "Idade mínima e máxima devem ser números válidos",
          variant: "destructive"
        })
        setLoading(false)
        return
      }

      // Preparar dados para envio - campos específicos para faixas de idade
      const payload = {
        vigencia: vigenciaValue,
        operadora: operadoraValue,
        entidade: entidadeValue,
        plano: planoValue,
        tipoBeneficiario: formData.tipoBeneficiario || null,
        idadeMin: idadeMinNum,
        idadeMax: idadeMaxNum,
        chaveFaixa: formData.chaveFaixa || null
      }

      // Chamada para API
      const response = await fetch('/api/bonificacoes/regras-idade', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload)
      })

      if (!response.ok) {
        let errorMessage = 'Erro ao registrar bonificação'
        try {
          const errorData = await response.json()
          errorMessage = errorData.error || errorMessage
        } catch {
          errorMessage = `Erro HTTP ${response.status}: ${response.statusText}`
        }
        throw new Error(errorMessage)
      }

      const result = await response.json()

      toast({
        title: "Sucesso!",
        description: `Regra de idade registrada com sucesso.`
      })

      // Limpar formulário
      setFormData({
        vigencia: "",
        operadora: "",
        entidade: "",
        plano: "",
        tipoBeneficiario: "",
        idadeMin: "",
        idadeMax: "",
        chaveFaixa: ""
      })
      setPlanoQuery("")
      
      // Atualizar a tabela para mostrar o novo registro
      setTableRefreshKey(prev => prev + 1)

    } catch (error) {
      console.error("Erro ao registrar:", error)
      toast({
        title: "Erro",
        description: error instanceof Error ? error.message : "Erro ao registrar regra de idade",
        variant: "destructive"
      })
    } finally {
      setLoading(false)
    }
  }

  // Sugestões de operadora baseadas no que está sendo digitado
  // normalize already defined above

  const operadoraSuggestions = operadoraQuery.trim()
    ? OPERADORAS.filter(op => {
        const q = normalize(operadoraQuery)
        const n = normalize(op)
        return n.startsWith(q) || n.split(/\s+/).some(w => w.startsWith(q))
      })
    : []

  // Atualiza opções dependentes consultando a API, agregando todas as páginas
  const refreshDependentOptions = async (partial?: Partial<typeof formData>) => {
    const current = { ...formData, ...(partial || {}) }

    const buildParams = () => {
      const p = new URLSearchParams()
      if (current.operadora) p.append("operadora", current.operadora)
      // tipo_faixa não existe na tabela registro_bonificacao_idades, removido
      if (current.tipoBeneficiario) p.append("tipo_beneficiario", current.tipoBeneficiario)
      return p
    }

    const fetchAll = async (params: URLSearchParams) => {
      params.set("page", "1")
      params.set("pageSize", "500")
      params.set("sort", "registro")
      params.set("order", "desc")
      const first = await fetch(`/api/bonificacoes/regras-idade?${params.toString()}`)
      if (!first.ok) throw new Error(`HTTP ${first.status}`)
      const firstJson = await first.json()
      let rows: any[] = firstJson?.data || []
      const totalPages = firstJson?.pagination?.totalPages || 1
      if (totalPages > 1) {
        const rest = await Promise.all(
          Array.from({ length: totalPages - 1 }, (_, i) => i + 2).map(async (pg) => {
            const p2 = new URLSearchParams(params)
            p2.set("page", String(pg))
            try {
              const r = await fetch(`/api/bonificacoes/regras-idade?${p2.toString()}`)
              return await r.json()
            } catch {
              return { data: [] }
            }
          })
        )
        rest.forEach((r: any) => { if (r?.data?.length) rows = rows.concat(r.data) })
      }
      return rows
    }

    try {
      // Buscar listas dependentes com filtros atuais
      const rowsAll = await fetchAll(buildParams())

      // Para planos, usar SOMENTE a operadora (todas as páginas)
      let planos: string[] = []
      if (current.operadora) {
        const pPlan = new URLSearchParams()
        pPlan.append("operadora", current.operadora)
        const rowsPlan = await fetchAll(pPlan)
        // Extrair planos de diferentes formatos possíveis (plano, Plano, PLANO)
        planos = Array.from(new Set(
          rowsPlan
            .map((r: any) => r.plano || r.Plano || r.PLANO)
            .filter((p: any) => p !== null && p !== undefined && String(p).trim() !== "")
        ))
          .map((p: any) => String(p).trim())
          .sort((a, b) => String(a).localeCompare(String(b)))
      }

      // Buscar todas as chaves de faixa disponíveis no banco (sem filtros)
      const paramsAll = new URLSearchParams()
      paramsAll.set("page", "1")
      paramsAll.set("pageSize", "500")
      paramsAll.set("sort", "registro")
      paramsAll.set("order", "desc")
      const allRes = await fetch(`/api/bonificacoes/regras-idade?${paramsAll.toString()}`)
      let allChavesFaixa: string[] = []
      if (allRes.ok) {
        const allJson = await allRes.json()
        let allRows: any[] = allJson?.data || []
        const totalPagesAll = allJson?.pagination?.totalPages || 1
        if (totalPagesAll > 1) {
          const restAll = await Promise.all(
            Array.from({ length: totalPagesAll - 1 }, (_, i) => i + 2).map(async (pg) => {
              const p2 = new URLSearchParams(paramsAll)
              p2.set("page", String(pg))
              try {
                const r = await fetch(`/api/bonificacoes/regras-idade?${p2.toString()}`)
                return await r.json()
              } catch {
                return { data: [] }
              }
            })
          )
          restAll.forEach((r: any) => { if (r?.data?.length) allRows = allRows.concat(r.data) })
        }
        allChavesFaixa = Array.from(new Set(
          allRows
            .map((r: any) => r.chave_faixa || r.chaveFaixa)
            .filter((c: any) => c !== null && c !== undefined && String(c).trim() !== "")
        ))
          .map((c: any) => String(c).trim())
      }

      const uniq = (arr: any[]) => distinctClean(arr) as string[]

      setOptions({
        // Campos específicos para faixas de idade - não inclui tipo_faixa que não existe na tabela
        tiposFaixa: [], // Não usado para regras de idade, mas mantido para compatibilidade
        produtos: [], // Não faz parte da tabela registro_bonificacao_idades
        pagamentoPor: [], // Não faz parte da tabela registro_bonificacao_idades
        tipoBeneficiario: sortAlphaDesc(uniq(rowsAll.map(r => r.tipo_beneficiario)).length ? uniq(rowsAll.map(r => r.tipo_beneficiario)) : TIPO_BENEFICIARIO),
        parcelas: [], // Não faz parte da tabela registro_bonificacao_idades
        planos: sortAlpha(planos),
        chavesFaixa: sortAlpha(allChavesFaixa),
      })
    } catch {
      setOptions({
        tiposFaixa: [], // Não usado para regras de idade
        produtos: [], // Não faz parte da tabela registro_bonificacao_idades
        pagamentoPor: [], // Não faz parte da tabela registro_bonificacao_idades
        tipoBeneficiario: sortAlphaDesc(TIPO_BENEFICIARIO),
        parcelas: [], // Não faz parte da tabela registro_bonificacao_idades
        planos: [],
        chavesFaixa: [],
      })
    }
  }

  return (
    <div className="px-4 py-6 lg:pl-8 lg:pr-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Gerenciamento de Regras de Idade</h1>
        <p className="text-muted-foreground mt-1">
          {canEdit 
            ? "Gerencie regras de idade. Cadastre, edite e visualize regras." 
            : "Visualize regras de idade cadastradas."}
        </p>
      </div>

      {/* Botões de ação - apenas se tiver permissão */}
      {canCreate && (
        <div className="flex flex-col gap-4">
          {/* Botão de Cadastrar Nova Regra */}
          <div className="flex justify-end">
            <Button variant={showForm ? "outline" : "default"} onClick={() => setShowForm(v => !v)}>
              {showForm ? (
                <>
                  <X className="h-4 w-4 mr-2" /> Cancelar
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4 mr-2" /> Cadastrar nova regra
                </>
              )}
            </Button>
          </div>

          {/* Seção de Importação em Lote - só aparece quando showForm for true */}
          {showForm && (
            <Card className="border shadow-sm bg-white">
              <CardHeader>
                <CardTitle>Importar regras em lote</CardTitle>
                <CardDescription>Arquivo XLSX.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-3 flex-wrap">
                  <input
                    ref={fileInputRef}
                    className="hidden"
                    type="file"
                    accept=".csv,.xlsx,.xls"
                    onChange={(e) => {
                      const f = e.target.files?.[0]
                      if (f) void handleFileUpload(f)
                    }}
                  />
                  <Button type="button" variant="outline" onClick={downloadTemplate}>
                    Baixar modelo
                  </Button>
                  <Button 
                    type="button" 
                    variant="default"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={batchLoading}
                  >
                    Importar em lote
                  </Button>
                  {batchRows.length > 0 && (
                    <Button 
                      type="button" 
                      variant="outline"
                      onClick={() => { 
                        setBatchRows([])
                        setBatchColumns([])
                        setBatchMessage("")
                        if (fileInputRef.current) fileInputRef.current.value = ""
                      }}
                    >
                      <X className="h-4 w-4 mr-2" /> Cancelar
                    </Button>
                  )}
                  {batchLoading && <span className="text-sm text-muted-foreground">Carregando...</span>}
                  {batchMessage && <span className="text-sm">{batchMessage}</span>}
                </div>

                {/* Preview de importação em lote */}
                {batchRows.length > 0 && (
                  <div className="space-y-3 mt-4">
                    <div className="overflow-x-auto border rounded-md">
                      <table className="w-full text-sm">
                        <thead>
                          <tr style={{ background: '#333b5f', color: '#ffffff' }}>
                            {batchColumns.map((c) => (
                              <th key={c} className="px-3 py-2 text-left whitespace-nowrap" style={{ color: '#ffffff' }}>{c}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {batchRows.map((row, idx) => (
                            <tr key={idx} className="border-t">
                              {batchColumns.map((c) => (
                                <td key={c} className="px-3 py-1 min-w-[160px]">
                                  <Input
                                    value={row[c] ?? ''}
                                    onChange={(e) => updateBatchCell(idx, c, e.target.value)}
                                  />
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" type="button" onClick={() => { setBatchRows([]); setBatchColumns([]); setBatchMessage("") }}>Limpar tabela</Button>
                      <Button type="button" onClick={registerBatch} disabled={batchLoading}>Registrar regras</Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Formulário de cadastro - apenas se tiver permissão */}
      {canCreate && showForm && (
        <Card className="border shadow-sm bg-white">
          <CardHeader>
            <CardTitle>Nova regra</CardTitle>
            <CardDescription>Preencha os campos abaixo para registrar uma nova regra</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-8">
            {/* Seção: Dados da Regra */}
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-medium text-foreground">Dados da regra</h3>
                <p className="text-xs text-muted-foreground">Defina vigência, operadora, entidade e plano</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                {/* Vigência */}
                <div className="space-y-2">
                  <Label htmlFor="vigencia">Início Vigência *</Label>
                  <Input
                    id="vigencia"
                    type="date"
                    value={formData.vigencia}
                    onChange={(e) => handleChange("vigencia", e.target.value)}
                    required
                  />
                </div>

                {/* Operadora (Autocomplete) */}
                <div className="space-y-2">
                  <Label htmlFor="operadora">Operadora *</Label>
                  <div className="relative">
                    <Input
                      id="operadora"
                      value={formData.operadora || operadoraQuery}
                      onFocus={() => setOperadoraFocused(true)}
                      onBlur={() => setTimeout(() => setOperadoraFocused(false), 150)}
                      onChange={(e) => {
                        setOperadoraQuery(e.target.value)
                        handleChange("operadora", "")
                        handleChange("plano", "")
                        refreshDependentOptions({ operadora: "" })
                      }}
                      placeholder="Digite para buscar operadora"
                      required
                    />
                    {(formData.operadora || operadoraQuery) && (
                      <button
                        type="button"
                        aria-label="Limpar operadora"
                        onClick={() => {
                          setOperadoraQuery("")
                          handleChange("operadora", "")
                          handleChange("plano", "")
                          setOperadoraFocused(true)
                          refreshDependentOptions({ operadora: "" })
                        }}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        ×
                      </button>
                    )}
                    {operadoraFocused && operadoraSuggestions.length > 0 && (
                      <div className="absolute z-10 mt-1 w-full max-h-56 overflow-auto rounded-md border bg-popover text-popover-foreground shadow">
                        {operadoraSuggestions.map(op => (
                          <button
                            key={op}
                            type="button"
                            onClick={async () => {
                              handleChange("operadora", op)
                              setOperadoraQuery(op)
                              setOperadoraFocused(false)
                              // Limpar plano anterior quando trocar operadora
                              handleChange("plano", "")
                              setPlanoQuery("")
                              setLoadingPlanos(true)
                              try {
                                // Aguardar o carregamento dos planos
                                await refreshDependentOptions({ operadora: op })
                              } finally {
                                setLoadingPlanos(false)
                              }
                            }}
                            className="block w-full text-left px-3 py-2 hover:bg-accent hover:text-accent-foreground"
                          >
                            {op}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground">Escolha a operadora para habilitar os demais campos</p>
                </div>

                {/* Entidade */}
                <div className="space-y-2">
                  <Label htmlFor="entidade">Entidade *</Label>
                  <Input
                    id="entidade"
                    value={formData.entidade}
                    onChange={(e) => handleChange("entidade", e.target.value)}
                    required
                  />
                </div>

                {/* Plano */}
                <div className="space-y-2">
                    <Label htmlFor="plano">Plano *</Label>
                  <div className="relative">
                    {(() => {
                      // Verificar se a operadora existe no banco (está na lista OPERADORAS)
                      const operadoraAtual = formData.operadora || operadoraQuery
                      const operadoraExisteNoBanco = operadoraAtual && OPERADORAS.some(op => normalize(op) === normalize(operadoraAtual))
                      
                      // Se a operadora não existe no banco, permitir digitação livre
                      const permitirDigitaçãoLivre = operadoraAtual && !operadoraExisteNoBanco
                      
                      if (permitirDigitaçãoLivre) {
                        // Modo de digitação livre quando operadora não está no banco
                        return (
                          <Input
                            id="plano"
                            value={formData.plano || planoQuery}
                            onChange={(e) => {
                              const valor = e.target.value
                              setPlanoQuery(valor)
                              handleChange("plano", valor)
                            }}
                            placeholder="Digite o plano"
                            required
                          />
                        )
                      }
                      
                      // Modo normal: busca planos do banco quando operadora existe
                      return (
                        <Input
                          id="plano"
                          value={formData.plano || planoQuery}
                          onFocus={async () => {
                            setPlanoFocused(true)
                            // Garantir que os planos sejam carregados quando o campo recebe foco e há operadora selecionada
                            if (formData.operadora) {
                              setLoadingPlanos(true)
                              try {
                                // Sempre recarregar os planos para garantir que estão atualizados
                                await refreshDependentOptions({ operadora: formData.operadora })
                              } finally {
                                setLoadingPlanos(false)
                              }
                            }
                          }}
                          onBlur={() => setTimeout(() => setPlanoFocused(false), 150)}
                          onChange={(e) => {
                            setPlanoQuery(e.target.value)
                            handleChange("plano", "")
                          }}
                          placeholder={!formData.operadora ? "Selecione a operadora" : "Digite para buscar plano"}
                          required
                          disabled={!formData.operadora || loadingPlanos}
                        />
                      )
                                         })()}
                    {(() => {
                      const operadoraAtual = formData.operadora || operadoraQuery
                      const operadoraExisteNoBanco = operadoraAtual && OPERADORAS.some(op => normalize(op) === normalize(operadoraAtual))
                      const permitirDigitaçãoLivre = operadoraAtual && !operadoraExisteNoBanco
                      
                      if (!permitirDigitaçãoLivre) {
                        return (
                          <>
                            {(formData.plano || planoQuery) && (
                              <button
                                type="button"
                                aria-label="Limpar plano"
                                onClick={() => {
                                  setPlanoQuery("")
                                  handleChange("plano", "")
                                  setPlanoFocused(true)
                                }}
                                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                              >
                                ×
                              </button>
                            )}
                            {planoFocused && formData.operadora && (() => {
                              // Se não há query, mostra todos os planos disponíveis
                              // Se há query, filtra os planos
                              const planosDisponiveis = options.planos || []
                              const q = normalize(planoQuery)
                              const list = planoQuery.trim() 
                                ? planosDisponiveis.filter(p => {
                                    const n = normalize(String(p))
                                    return n.startsWith(q) || n.split(/\s+/).some(w => w.startsWith(q))
                                  })
                                : planosDisponiveis
                              
                              // Sempre mostrar o dropdown se houver planos disponíveis e o campo estiver focado
                              if (list.length > 0) {
                                return (
                                  <div className="absolute z-10 mt-1 w-full max-h-56 overflow-auto rounded-md border bg-popover text-popover-foreground shadow">
                                    {list.map((p, idx) => (
                                      <button
                                        key={`${p}-${idx}`}
                                        type="button"
                                        onClick={() => {
                                          handleChange("plano", String(p))
                                          setPlanoQuery(String(p))
                                          setPlanoFocused(false)
                                        }}
                                        className="block w-full text-left px-3 py-2 hover:bg-accent hover:text-accent-foreground"
                                      >
                                        {String(p)}
                                      </button>
                                    ))}
                                  </div>
                                )
                              }
                              // Se não há planos mas o campo está focado e há operadora, mostrar mensagem
                              if (planosDisponiveis.length === 0) {
                                return (
                                  <div className="absolute z-10 mt-1 w-full rounded-md border bg-popover text-popover-foreground shadow p-2 text-sm text-muted-foreground">
                                    {loadingPlanos ? "Carregando planos..." : "Nenhum plano encontrado para esta operadora"}
                                  </div>
                                )
                              }
                              return null
                            })()}
                          </>
                        )
                      }
                      return null
                    })()}
                  </div>
                </div>
              </div>
            </div>

            {/* Seção: Faixa de Idade */}
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-medium text-foreground">Faixa de Idade</h3>
                <p className="text-xs text-muted-foreground">Defina a faixa etária (idade mínima e máxima)</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="idadeMin">Idade Mínima *</Label>
                <Input
                  id="idadeMin"
                  type="number"
                  step="1"
                  min="0"
                  max="150"
                  value={formData.idadeMin}
                  onChange={(e) => handleChange("idadeMin", e.target.value)}
                  placeholder="0"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="idadeMax">Idade Máxima *</Label>
                <Input
                  id="idadeMax"
                  type="number"
                  step="1"
                  min="0"
                  max="150"
                  value={formData.idadeMax}
                  onChange={(e) => handleChange("idadeMax", e.target.value)}
                  placeholder="150"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="chaveFaixa">Chave da Faixa</Label>
                <Select 
                  value={formData.chaveFaixa} 
                  onValueChange={(value: string) => {
                    handleChange("chaveFaixa", value)
                  }}
                >
                  <SelectTrigger id="chaveFaixa">
                    <SelectValue placeholder="Selecione a chave da faixa" />
                  </SelectTrigger>
                  <SelectContent>
                    {options.chavesFaixa.map((chave) => (
                      <SelectItem key={chave} value={chave}>
                        {chave}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              </div>
            </div>



            {/* Grid: Tipo de Beneficiário */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="tipoBeneficiario">Tipo de Beneficiário</Label>
                <Select 
                  value={formData.tipoBeneficiario} 
                  onValueChange={async (value: string) => {
                    handleChange("tipoBeneficiario", value)
                    await refreshDependentOptions({ tipoBeneficiario: value })
                  }}
                >
                  <SelectTrigger id="tipoBeneficiario">
                    <SelectValue placeholder="Selecione o tipo de beneficiário" />
                  </SelectTrigger>
                  <SelectContent>
                    {options.tipoBeneficiario.map((tipo) => (
                      <SelectItem key={tipo} value={tipo}>
                        {tipo}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

              {/* Botões do formulário */}
              {batchRows.length === 0 && (
                <div className="flex justify-end space-x-4 pt-4 border-t">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setFormData({
                        vigencia: "",
                        operadora: "",
                        entidade: "",
                        plano: "",
                        tipoBeneficiario: "",
                        idadeMin: "",
                        idadeMax: "",
                        chaveFaixa: ""
                      })
                      setPlanoQuery("")
                      setPlanoFocused(false)
                      setOperadoraQuery("")
                      setOperadoraFocused(false)
                      setOptions({
                        tiposFaixa: TIPOS_FAIXA,
                        tipoBeneficiario: TIPO_BENEFICIARIO,
                        planos: [],
                        produtos: [],
                        pagamentoPor: [],
                        parcelas: [],
                        chavesFaixa: []
                      })
                    }}
                    disabled={loading}
                  >
                    Limpar
                  </Button>
                  <Button
                    type="submit"
                    disabled={loading}
                    onClick={() => {
                      // Após salvar, atualizar opções conforme filtros atuais (se salvar com sucesso, o toast/limpeza já ocorre)
                      setTimeout(() => refreshDependentOptions(), 0)
                    }}
                  >
                    {loading ? "Registrando..." : "Registrar"}
                  </Button>
                </div>
              )}
            </form>
          </CardContent>
        </Card>
      )}

      {/* Tabela de regras - sempre visível */}
      <RegrasIdadeTable 
        readOnly={!canEdit}
        title="Regras de Idade"
        description={canEdit 
          ? "Visualize, filtre e edite regras de idade." 
          : "Histórico de regras cadastradas"}
        refreshKey={tableRefreshKey}
      />
    </div>
  )
}
