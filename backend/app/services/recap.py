"""Weekly spend recap: the latest 7-day window of data + a short AI narrative.

Window + totals are pure Python; one Claude (sonnet) call writes a 2-3 sentence
Peruvian-Spanish summary and tolerates failure (empty narrative, never 500). If
there are no transactions (or no spend in the window) we skip the AI entirely.
"""

import json
from collections import defaultdict
from datetime import date, timedelta

from anthropic import AsyncAnthropic

from app.config import INSIGHTS_MODEL, settings

_EMPTY = {"start": None, "end": None, "total": 0, "byCategory": [], "narrative": ""}


def _parse_date(value):
    try:
        y, m, d = (int(p) for p in str(value)[:10].split("-"))
        return date(y, m, d)
    except (ValueError, TypeError):
        return None


async def weekly_recap(transactions: list[dict]) -> dict:
    dates = [d for d in (_parse_date(t.get("date")) for t in transactions) if d]
    if not dates:
        return dict(_EMPTY)

    end = max(dates)
    start = end - timedelta(days=6)

    by_cat: dict[str, float] = defaultdict(float)
    total = 0.0
    for t in transactions:
        d = _parse_date(t.get("date"))
        if not d or not (start <= d <= end):
            continue
        try:
            amount = float(t.get("amount"))
        except (TypeError, ValueError):
            continue
        if amount < 0:
            spend = -amount
            total += spend
            by_cat[t.get("category") or "Other"] += spend

    by_category = sorted(
        ({"category": c, "amount": round(a, 2)} for c, a in by_cat.items()),
        key=lambda r: r["amount"],
        reverse=True,
    )
    total = round(total, 2)

    base = {
        "start": start.isoformat(),
        "end": end.isoformat(),
        "total": total,
        "byCategory": by_category,
        "narrative": "",
    }
    if total <= 0:
        return base

    try:
        client = AsyncAnthropic(api_key=settings.anthropic_api_key)
        msg = await client.messages.create(
            model=INSIGHTS_MODEL,
            max_tokens=300,
            system=(
                "Eres un asistente de finanzas peruano. Escribe un resumen MUY breve "
                "(2-3 frases) en español peruano natural (de 'tú') de la última semana "
                "de gastos: qué impulsó el gasto, la categoría principal y cualquier "
                "salto notable. Usa el símbolo 'S/' para los montos. No inventes nada; "
                "usa solo los datos dados. Responde solo el texto, sin JSON."
            ),
            messages=[
                {
                    "role": "user",
                    "content": "Resumen semanal:\n"
                    + json.dumps(
                        {"total": total, "byCategory": by_category, "start": base["start"], "end": base["end"]},
                        ensure_ascii=False,
                    ),
                }
            ],
        )
        base["narrative"] = "".join(b.text for b in msg.content if b.type == "text").strip()
    except Exception:
        base["narrative"] = ""

    return base
