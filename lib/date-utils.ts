interface DateParts {
  year: number
  month: number
  day: number
}

export function getDateParts(value: string | Date | null | undefined): DateParts | null {
  if (!value) return null

  if (value instanceof Date) {
    return {
      year: value.getUTCFullYear(),
      month: value.getUTCMonth() + 1,
      day: value.getUTCDate(),
    }
  }

  const raw = String(value).trim()
  if (!raw) return null

  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (isoMatch) {
    return {
      year: Number(isoMatch[1]),
      month: Number(isoMatch[2]),
      day: Number(isoMatch[3]),
    }
  }

  const parsed = new Date(raw)
  if (Number.isNaN(parsed.getTime())) return null

  return {
    year: parsed.getUTCFullYear(),
    month: parsed.getUTCMonth() + 1,
    day: parsed.getUTCDate(),
  }
}

export function formatDateISO(value: string | Date | null | undefined): string {
  const parts = getDateParts(value)
  if (!parts) return ""
  const { year, month, day } = parts
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
}

export function formatDateBR(value: string | Date | null | undefined): string {
  const parts = getDateParts(value)
  if (!parts) return ""
  const day = String(parts.day).padStart(2, "0")
  const month = String(parts.month).padStart(2, "0")
  const year = parts.year
  return `${day}/${month}/${year}`
}

/**
 * Converte data em DD/MM/YYYY (input do usuário BR) para YYYY-MM-DD (API).
 * Se já estiver em YYYY-MM-DD, devolve como está.
 */
export function dataBRParaISO(value: string | null | undefined): string {
  const s = String(value ?? "").trim()
  if (!s) return ""
  if (s.includes("/")) {
    const partes = s.split("/")
    if (partes.length === 3) {
      const [d, m, y] = partes.map(Number)
      if (d >= 1 && d <= 31 && m >= 1 && m <= 12 && y >= 1900 && y <= 2100) {
        return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`
      }
    }
    return s
  }
  return s
}

function sanitizeDateInput(value: string | Date | null | undefined): string {
  if (!value) return ""
  if (value instanceof Date) {
    const year = value.getFullYear()
    const month = String(value.getMonth() + 1).padStart(2, "0")
    const day = String(value.getDate()).padStart(2, "0")
    const hours = String(value.getHours()).padStart(2, "0")
    const minutes = String(value.getMinutes()).padStart(2, "0")
    const seconds = String(value.getSeconds()).padStart(2, "0")
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`
  }

  let normalized = String(value).trim()
  if (!normalized) return ""

  normalized = normalized.replace("T", " ").replace("Z", "").replace(/\s+/g, " ")

  const dateOnlyMatch = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (dateOnlyMatch) {
    return normalized
  }

  const dateTimeMatch = normalized.match(/^(\d{4})-(\d{2})-(\d{2})\s(\d{2})(?::(\d{2}))?(?::(\d{2}))?$/)
  if (dateTimeMatch) {
    const [ , year, month, day, hour, minute = "00", second = "00" ] = dateTimeMatch
    return `${year}-${month}-${day} ${hour}:${minute}:${second}`
  }

  const parsed = new Date(normalized)
  if (!Number.isNaN(parsed.getTime())) {
    const year = parsed.getFullYear()
    const month = String(parsed.getMonth() + 1).padStart(2, "0")
    const day = String(parsed.getDate()).padStart(2, "0")
    const hours = String(parsed.getHours()).padStart(2, "0")
    const minutes = String(parsed.getMinutes()).padStart(2, "0")
    const seconds = String(parsed.getSeconds()).padStart(2, "0")
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`
  }

  return normalized
}

export function toStartOfDaySQL(value: string | Date | null | undefined): string {
  const normalized = sanitizeDateInput(value)
  if (!normalized) return ""

  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    return `${normalized} 00:00:00`
  }

  return normalized
}

export function toEndOfDaySQL(value: string | Date | null | undefined): string {
  const normalized = sanitizeDateInput(value)
  if (!normalized) return ""

  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    return `${normalized} 23:59:59`
  }

  if (/^\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}$/.test(normalized)) {
    return `${normalized}:59`
  }

  return normalized
}

export function formatDateTimeLocal(
  value: string | number | Date,
  timeZone: string = process.env.APP_TIMEZONE || process.env.TZ || "America/Sao_Paulo"
): string {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ""

  const formatter = new Intl.DateTimeFormat("sv-SE", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  })

  const parts = formatter.formatToParts(date)
  const getPart = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value || "00"

  const year = getPart("year")
  const month = getPart("month")
  const day = getPart("day")
  const hour = getPart("hour")
  const minute = getPart("minute")
  const second = getPart("second")

  return `${year}-${month}-${day} ${hour}:${minute}:${second}`
}

