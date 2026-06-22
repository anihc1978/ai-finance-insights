"""Recurring-subscription detection from transaction history (no AI).

We never store subscriptions; we infer them on the fly from spend rows. A
description is treated as a subscription if it recurs on a roughly monthly cadence
with similar amounts, OR if it matches a well-known subscription brand. Returns
each one's monthly cost + an estimated next charge so the UI can show a
recurring-charges dashboard. All parsing is defensive — odd/empty data never
raises.
"""

import re
from collections import defaultdict
from datetime import date, timedelta
from statistics import median

# Known subscription brands — a single occurrence is enough to flag these.
_KEYWORDS = (
    "netflix", "spotify", "disney", "hbo", "max", "prime", "apple", "itunes",
    "icloud", "youtube", "google", "gym", "smartfit", "gold", "claro",
    "movistar", "entel", "bitel", "microsoft", "office", "openai", "chatgpt",
    "claude", "canva", "dropbox", "adobe", "paramount", "crunchyroll", "deezer",
    "notion", "linkedin", "audible",
)


def _normalize(description: str) -> str:
    """Lowercase, drop digits/punctuation, collapse spaces — for grouping."""
    s = re.sub(r"[0-9]+", " ", (description or "").lower())
    s = re.sub(r"[^a-záéíóúñ ]+", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def _parse_date(value):
    try:
        y, m, d = (int(p) for p in str(value)[:10].split("-"))
        return date(y, m, d)
    except (ValueError, TypeError):
        return None


def detect_subscriptions(transactions: list[dict]) -> dict:
    """Group spend rows by merchant and flag the recurring ones."""
    groups: dict[str, list[dict]] = defaultdict(list)
    for t in transactions:
        try:
            amount = float(t.get("amount"))
        except (TypeError, ValueError):
            continue
        if amount >= 0:  # only spend (negative amounts)
            continue
        key = _normalize(t.get("description", ""))
        if not key:
            continue
        groups[key].append(
            {
                "desc": (t.get("description") or "").strip(),
                "amount": -amount,  # positive magnitude
                "date": _parse_date(t.get("date")),
                "category": t.get("category"),
            }
        )

    subs: list[dict] = []
    for key, rows in groups.items():
        rows = [r for r in rows if r["date"]]
        if not rows:
            continue
        rows.sort(key=lambda r: r["date"])
        amounts = [r["amount"] for r in rows]
        is_known = any(kw in key for kw in _KEYWORDS)

        recurring = False
        if len(rows) >= 2:
            gaps = [(rows[i]["date"] - rows[i - 1]["date"]).days for i in range(1, len(rows))]
            monthly = [g for g in gaps if 20 <= g <= 40]
            med_amt = median(amounts)
            similar = med_amt > 0 and (max(amounts) - min(amounts)) <= 0.25 * med_amt + 1
            recurring = bool(monthly) and len(monthly) >= max(1, len(gaps) // 2) and similar

        if not (recurring or is_known):
            continue

        last = rows[-1]
        subs.append(
            {
                "name": last["desc"].title() or key.title(),
                "amount": round(median(amounts), 2),
                "occurrences": len(rows),
                "last_date": last["date"].isoformat(),
                "next_estimated": (last["date"] + timedelta(days=30)).isoformat(),
                "category": last["category"],
            }
        )

    subs.sort(key=lambda s: s["amount"], reverse=True)
    return {"subscriptions": subs, "monthly_total": round(sum(s["amount"] for s in subs), 2)}
