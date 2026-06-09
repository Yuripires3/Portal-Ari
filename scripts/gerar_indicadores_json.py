#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Gera data/indicadores-consolidado.json a partir de data/indicadores.xlsx.
Dados estáticos (2021 até mai/2026) — executar apenas se o Excel for atualizado.
"""

from __future__ import annotations

import json
import math
import re
import unicodedata
from pathlib import Path

import openpyxl

ROOT = Path(__file__).resolve().parent.parent
EXCEL_PATH = ROOT / "data" / "indicadores.xlsx"
JSON_PATH = ROOT / "data" / "indicadores-consolidado.json"

MESES = list(range(1, 13))

OPERADORAS_POR_ANO: dict[int, list[str]] = {
    2021: [
        "CONSOLIDADO",
        "ASSIM SAUDE",
        "SEGUROS Unimed",
        "Operadora 4",
        "Operadora 5",
        "QV Total",
        "Operadora 7",
    ],
    2022: [
        "CONSOLIDADO",
        "ASSIM SAUDE",
        "SEGUROS Unimed",
        "Leve Saude",
        "Operadora 5",
        "Operadora 6",
        "Operadora 7",
        "QV Total",
        "Operadora 9",
        "Operadora 10",
    ],
    2023: [
        "CONSOLIDADO",
        "ASSIM SAUDE",
        "SEGUROS Unimed",
        "Leve Saude",
        "NOVA SAUDE",
        "blue.",
        "Operadora 7",
        "Operadora 8",
        "QV Total",
        "Operadora 10",
    ],
    2024: [
        "Unimed Rio",
        "ASSIM SAUDE",
        "SEGUROS Unimed",
        "Leve Saude",
        "NOVA SAUDE",
        "blue.",
        "Hapvida NotreDame",
        "Oplan",
        "Operadora 9",
        "Operadora 10",
        "CONSOLIDADO",
        "AESP Odonto",
    ],
    2025: [
        "Unimed Rio",
        "ASSIM SAUDE",
        "SEGUROS Unimed",
        "Klini Saude",
        "Leve Saude",
        "Select Saude",
        "NOVA SAUDE",
        "blue.",
        "Hapvida NotreDame",
        "Oplan",
        "Operadora 11",
        "CONSOLIDADO",
        "MedSenior",
        "Amil",
        "Integral Saude",
    ],
    2026: [
        "Unimed Rio",
        "ASSIM SAUDE",
        "SEGUROS Unimed",
        "Klini Saude",
        "Leve Saude",
        "Select Saude",
        "NOVA SAUDE",
        "blue.",
        "Hapvida NotreDame",
        "Oplan",
        "Samp",
        "CONSOLIDADO",
        "MedSenior",
        "Amil",
        "Integral Saude",
        "AESP Odonto",
    ],
}

LABEL_MAP = {
    "meta orcada": "meta_orcada",
    "base vidas": "base_vidas",
    "base dental": "base_dental",
    "base saude": "base_saude",
    "vidas canceladas": "vidas_canceladas",
    "retencao": "retencao",
    "% cancelamento": "pct_cancelamento",
    "cancel. por inadimplencia": "cancel_inadimplencia",
    "cancel. solicitacao cliente": "cancel_solicitacao_cliente",
    "cancel. solicitado ops": "cancel_solicitado_ops",
    "obito": "obito",
    "falecimento": "obito",
    "falecimento (a partir de maio)": "obito",
    "exclusao de dependente": "outros",
    "exclusao de dependente (a partir de maio)": "outros",
    "outros": "outros",
    "outros (a partir de maio)": "outros",
    "faturamento emitido": "faturamento_emitido",
    "faturamento recebido": "faturamento_recebido",
    "inadimplencia": "inadimplencia",
    "inadimplencia do fechamento do mes": "inadimplencia",
    "vendas": "vendas",
    "ticket medio": "ticket_medio",
    "comissao concessionarias": "comissao_concessionarias",
    "bonificacao corretores/supervisores": "bonificacao_corretores_supervisores",
}


def norm_label(value) -> str:
    if value is None:
        return ""
    text = str(value).strip()
    text = unicodedata.normalize("NFD", text)
    text = "".join(c for c in text if unicodedata.category(c) != "Mn")
    return text.lower()


def parse_val(value):
    if value is None:
        return None
    if isinstance(value, str):
        text = value.strip()
        if text in ("-", "#REF!", "#N/A", ""):
            return None
        if text.startswith("="):
            return None
        text = re.sub(r"[R$\s%]", "", text)
        if "," in text and "." in text:
            text = text.replace(".", "").replace(",", ".")
        elif "," in text:
            text = text.replace(",", ".")
        try:
            return float(text)
        except ValueError:
            return None
    if isinstance(value, (int, float)):
        if isinstance(value, float) and (math.isnan(value) or math.isinf(value)):
            return None
        return float(value)
    return None


def parse_block(ws, header_row: int, next_header: int | None) -> dict:
    end = (next_header - 1) if next_header else header_row + 40
    rows: dict[str, dict[str, float | None]] = {}
    for row in range(header_row + 1, end + 1):
        raw = ws.cell(row, 5).value
        if raw is None:
            continue
        label = norm_label(raw)
        if label == "indicador":
            break
        key = LABEL_MAP.get(label)
        if not key:
            continue
        meses = {str(m): parse_val(ws.cell(row, 6 + i).value) for i, m in enumerate(MESES)}
        rows[key] = meses
    return rows


def ano_da_aba(nome: str) -> int:
    digits = "".join(c for c in nome if c.isdigit())
    return 2000 + int(digits[-2:])


def main() -> None:
    if not EXCEL_PATH.exists():
        raise FileNotFoundError(f"Arquivo não encontrado: {EXCEL_PATH}")

    wb = openpyxl.load_workbook(EXCEL_PATH, data_only=True)
    resultado = {"fonte": str(EXCEL_PATH.name), "anos": {}}

    for sheet_name in wb.sheetnames:
        ano = ano_da_aba(sheet_name)
        ws = wb[sheet_name]
        headers: list[int] = []
        for row in range(1, ws.max_row + 1):
            if ws.cell(row, 5).value == "Indicador" and ws.cell(row, 6).value == "Jan":
                headers.append(row)

        nomes = OPERADORAS_POR_ANO.get(ano, [])
        operadoras = []
        for index, header_row in enumerate(headers):
            next_header = headers[index + 1] if index + 1 < len(headers) else None
            indicadores = parse_block(ws, header_row, next_header)
            if not indicadores:
                continue
            nome = nomes[index] if index < len(nomes) else f"Operadora {index + 1}"
            tipo = (
                "consolidado"
                if nome.upper() in ("CONSOLIDADO", "QV TOTAL")
                else "operadora"
            )
            operadoras.append(
                {"operadora": nome, "tipo": tipo, "indicadores": indicadores}
            )

        resultado["anos"][str(ano)] = {"operadoras": operadoras}
        print(f"{ano}: {len(operadoras)} blocos")

    JSON_PATH.parent.mkdir(parents=True, exist_ok=True)
    with JSON_PATH.open("w", encoding="utf-8") as f:
        json.dump(resultado, f, ensure_ascii=False)
    print(f"Gerado: {JSON_PATH} ({JSON_PATH.stat().st_size:,} bytes)")


if __name__ == "__main__":
    main()
