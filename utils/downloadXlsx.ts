export function downloadXlsxFromObjects(
  rows: Record<string, any>[],
  filename = "arquivo.xlsx",
  xlsxInstance?: any
) {
  if (!rows || rows.length === 0) return

  const XLSX =
    xlsxInstance ??
    (typeof window !== "undefined" ? (window as any).XLSX : null)

  if (!XLSX) {
    throw new Error("XLSX não está carregado. Chame getXLSX() antes de exportar.")
  }

  const worksheet = XLSX.utils.json_to_sheet(rows)

  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, "Dados")

  const headerRange = XLSX.utils.decode_range(worksheet["!ref"] || "A1")
  for (let col = headerRange.s.c; col <= headerRange.e.c; col++) {
    const headerCellAddress = XLSX.utils.encode_cell({ r: headerRange.s.r, c: col })
    const headerCell = worksheet[headerCellAddress]
    if (headerCell) {
      headerCell.v = String(headerCell.v ?? "").toUpperCase().replace(/\s+/g, " ")
      headerCell.s = {
        font: { bold: true, color: { rgb: "000000" } },
        fill: { patternType: "solid", fgColor: { rgb: "FFCC00" } },
        alignment: { horizontal: "center", vertical: "center" }
      }
    }
  }

  const computeWidth = (value: any): number => {
    if (value === null || value === undefined) return 0
    const str = String(value)
    return Math.min(Math.max(str.length + 2, 12), 60)
  }

  const colWidths: number[] = []
  for (let col = headerRange.s.c; col <= headerRange.e.c; col++) {
    let maxLen = computeWidth(worksheet[XLSX.utils.encode_cell({ r: headerRange.s.r, c: col })]?.v)
    for (let row = headerRange.s.r + 1; row <= headerRange.e.r; row++) {
      const cellAddress = XLSX.utils.encode_cell({ r: row, c: col })
      const cell = worksheet[cellAddress]
      maxLen = Math.max(maxLen, computeWidth(cell?.v))
    }
    colWidths.push(maxLen)
  }
  worksheet["!cols"] = colWidths.map((wch) => ({ wch }))

  const xlsxBuffer = XLSX.write(workbook, { bookType: "xlsx", type: "array" })

  const blob = new Blob([xlsxBuffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;charset=utf-8;",
  })

  const link = document.createElement("a")
  link.href = URL.createObjectURL(blob)
  link.download = filename
  link.click()
  setTimeout(() => URL.revokeObjectURL(link.href), 200)
}

