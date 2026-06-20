"""Pure-Python aggregation of transactions into the numbers the dashboard shows.

No LLM, no I/O here — just arithmetic over a list of transaction dicts. Keeping
this pure is what lets us unit-test it without a network or a database.

Spend is expressed as a POSITIVE magnitude (the absolute value of negative
amounts); income is the sum of positive amounts. `t["date"]` is 'YYYY-MM-DD',
so its first 7 chars give the 'YYYY-MM' month key.
"""

from collections import defaultdict


def _month_key(iso_date: str) -> str:
    """'YYYY-MM-DD' -> 'YYYY-MM'."""
    return iso_date[:7]


def aggregate(transactions: list[dict], month: str) -> dict:
    """Compute totals, per-category spend, and a month-over-month spend series.

    `month` selects which month's totals/byCategory to report; monthOverMonth
    covers every month present (oldest -> newest) so the frontend can chart trend.
    """
    spend_by_month: dict[str, float] = defaultdict(float)
    income_by_month: dict[str, float] = defaultdict(float)
    by_category: dict[str, float] = defaultdict(float)

    for t in transactions:
        amount = float(t["amount"])
        mkey = _month_key(t["date"])
        if amount < 0:
            spend_by_month[mkey] += -amount
            if mkey == month:
                category = t.get("category") or "Other"
                by_category[category] += -amount
        else:
            income_by_month[mkey] += amount

    months_sorted = sorted(spend_by_month.keys() | income_by_month.keys())
    month_over_month = [
        {"month": m, "spend": round(spend_by_month.get(m, 0.0), 2)} for m in months_sorted
    ]

    by_category_list = sorted(
        ({"category": c, "amount": round(a, 2)} for c, a in by_category.items()),
        key=lambda r: r["amount"],
        reverse=True,
    )

    return {
        "totalSpend": round(spend_by_month.get(month, 0.0), 2),
        "totalIncome": round(income_by_month.get(month, 0.0), 2),
        "byCategory": by_category_list,
        "monthOverMonth": month_over_month,
    }


def latest_month_with_data(transactions: list[dict]) -> str | None:
    """The most recent 'YYYY-MM' that has any transactions, or None when empty."""
    months = {_month_key(t["date"]) for t in transactions}
    return max(months) if months else None
