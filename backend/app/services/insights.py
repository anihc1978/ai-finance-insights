"""Assemble the GET /insights response: aggregation + forecast + AI narrative.

The numbers (totals, byCategory, monthOverMonth, forecast) are pure Python from
aggregate.py and forecast.py. Only the plain-English narrative and the
anomaly/subscription flags come from Claude (sonnet). This split keeps the
trustworthy figures deterministic and uses the LLM only for the part it's good
at — explaining the data in words.
"""

import json

from anthropic import AsyncAnthropic

from app.config import INSIGHTS_MODEL, settings
from app.services.aggregate import aggregate
from app.services.forecast import forecast_next_month

_NARRATIVE_SYSTEM = (
    "Eres un analista de finanzas personales amigable. A partir del resumen mensual de "
    "gastos de una persona, escribe un relato conciso en español peruano natural (3 a 5 "
    "oraciones), con tono cercano y de confianza, sobre en qué se fue su dinero y los "
    "cambios notables frente a meses anteriores. Luego enumera alertas cortas, ESPECÍFICAS "
    "y contextuales (como un asesor financiero): cada alerta debe citar el comercio o la "
    "categoría concreta y el monto aproximado, y de ser posible la fecha (p. ej. 'Gasto "
    "inusual en restaurantes: S/ 420, +34% vs el mes pasado'); incluye también patrones "
    "recurrentes que notes (p. ej. 'Cafetería ~3 veces por semana, ~S/ 90 al mes') y "
    "cualquier salto fuerte entre meses. Evita alertas genéricas. "
    "Usa el símbolo 'S/' para los soles peruanos. Sé específico con los nombres de "
    "las categorías y los montos aproximados. NO des consejos de inversión. "
    "Además, incluye 'highlights': exactamente 3 puntos cortos (estilo 'Esto encontramos'), "
    "cada uno con un título breve y un detalle de una línea, en español peruano natural y "
    "con tono cercano. El primero sobre los ingresos, el segundo sobre los gastos y el "
    'tercero sobre el margen o ahorro. Por ejemplo: {"title": "Ingresos estables", '
    '"detail": "Ganas alrededor de S/ X al mes."}. '
    "Responde ÚNICAMENTE como JSON: "
    '{"narrative": str, "flags": [str, ...], "highlights": [{"title": str, "detail": str}, ...]}. '
    "Sin markdown."
)


def _strip_fences(text: str) -> str:
    """Tolerate ```json ... ``` fences the model may wrap its answer in."""
    text = text.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[1] if "\n" in text else text
        if text.endswith("```"):
            text = text[: text.rfind("```")]
    return text.strip()


async def _narrative_and_flags(
    month: str, agg: dict, forecast: float
) -> tuple[str, list[str], list[dict]]:
    """One Claude call that turns the aggregated numbers into prose + flags + highlights."""
    client = AsyncAnthropic(api_key=settings.anthropic_api_key)
    summary_payload = {
        "month": month,
        "totalSpend": agg["totalSpend"],
        "totalIncome": agg["totalIncome"],
        "byCategory": agg["byCategory"],
        "monthOverMonth": agg["monthOverMonth"],
        "forecastNextMonth": forecast,
    }
    message = await client.messages.create(
        model=INSIGHTS_MODEL,
        max_tokens=1200,
        system=_NARRATIVE_SYSTEM,
        messages=[
            {
                "role": "user",
                "content": "Here is the monthly summary:\n\n"
                + json.dumps(summary_payload, ensure_ascii=False),
            }
        ],
    )
    text = "".join(block.text for block in message.content if block.type == "text")
    try:
        parsed = json.loads(_strip_fences(text))
        narrative = str(parsed.get("narrative", "")).strip()
        flags = [str(f) for f in parsed.get("flags", []) if str(f).strip()]
        highlights = [
            {"title": str(h.get("title", "")).strip(), "detail": str(h.get("detail", "")).strip()}
            for h in parsed.get("highlights", [])
            if isinstance(h, dict) and str(h.get("title", "")).strip()
        ]
    except json.JSONDecodeError:
        # Degrade gracefully: use the raw text as the narrative, no flags/highlights.
        narrative = _strip_fences(text)
        flags = []
        highlights = []
    return narrative, flags, highlights


async def build_insight(transactions: list[dict], month: str) -> dict:
    """Build the full GET /insights response for `month` from all transactions."""
    agg = aggregate(transactions, month)
    monthly_spend = [row["spend"] for row in agg["monthOverMonth"]]
    forecast = forecast_next_month(monthly_spend)
    narrative, flags, highlights = await _narrative_and_flags(month, agg, forecast)

    return {
        "month": month,
        "totalSpend": agg["totalSpend"],
        "totalIncome": agg["totalIncome"],
        "byCategory": agg["byCategory"],
        "monthOverMonth": agg["monthOverMonth"],
        "narrative": narrative,
        "flags": flags,
        "highlights": highlights,
        "forecastNextMonth": forecast,
    }
