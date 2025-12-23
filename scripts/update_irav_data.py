
#!/usr/bin/env python3

"""
Descarga el CSV oficial del INE para la tabla 72975 (IRAV) y genera public_free/irav_data.json
Uso:
  python scripts/update_irav_data.py

Nota:
- Este script requiere acceso a Internet (en tu entorno, GitHub Action o local).
- CSV fuente (INE): https://www.ine.es/jaxiT3/files/t/csv_bd/72975.csv
"""
from __future__ import annotations
import csv
import json
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

CSV_URL = "https://www.ine.es/jaxiT3/files/t/csv_bd/72975.csv"

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public_free" / "irav_data.json"

def fetch_csv(url: str) -> str:
    with urllib.request.urlopen(url) as r:
        raw = r.read()
    # INE suele servir UTF-8 con BOM
    return raw.decode("utf-8-sig", errors="replace")

def parse(csv_text: str) -> list[dict]:
    # El CSV de INE suele tener ';' como separador en algunas distribuciones.
    # Intentamos autodetección básica.
    delimiter = ';' if ';' in csv_text.splitlines()[0] else '\t' if '\t' in csv_text.splitlines()[0] else ','
    reader = csv.reader(csv_text.splitlines(), delimiter=delimiter)
    rows = list(reader)
    if not rows or len(rows) < 2:
        return []
    header = [h.strip() for h in rows[0]]
    # Buscamos columnas típicas: Periodo, Total o valor
    # Ejemplo esperado: ["Tipo de dato","Periodo","Total"]
    try:
        idx_period = header.index("Periodo")
    except ValueError:
        # fallback
        idx_period = 1
    # valor suele ser la última columna
    idx_value = len(header)-1

    out = []
    for r in rows[1:]:
        if len(r) <= idx_value:
            continue
        period = r[idx_period].strip()
        val_raw = r[idx_value].strip().replace(",", ".")
        try:
            value = float(val_raw)
        except ValueError:
            continue
        if not period:
            continue
        out.append({"period": period, "value": value})
    # Orden cronológico ascendente si el periodo es YYYYMMM
    def key(x):
        p = x["period"]
        y = int(p[:4]); m = int(p[5:])
        return (y, m)
    out.sort(key=key)
    return out

def main():
    csv_text = fetch_csv(CSV_URL)
    series = parse(csv_text)
    payload = {
        "source": CSV_URL,
        "updated_utc": datetime.now(timezone.utc).isoformat().replace("+00:00","Z"),
        "series": series,
    }
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"OK: {OUT} ({len(series)} filas)")

if __name__ == "__main__":
    main()
