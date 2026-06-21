"""Pure-Python budget math over a list of transaction dicts.

No LLM, no I/O — just arithmetic, so this is unit-testable without a network or a
database. Spend is the absolute value of negative amounts; income (positive
amounts) is ignored here. `t["date"]` is 'YYYY-MM-DD', so its first 7 chars give
the 'YYYY-MM' month key.
"""

from collections import defaultdict


def spend_by_category_for_month(transactions: list[dict], month: str) -> dict[str, float]:
    """Sum of spend (abs of negatives) per category for the given 'YYYY-MM' month.

    Used by GET /budgets to show how much of each limit is used so far this
    calendar month. Uncategorized rows fall under "Other", matching aggregate.py.
    """
    by_category: dict[str, float] = defaultdict(float)
    for t in transactions:
        amount = float(t["amount"])
        if amount < 0 and t["date"][:7] == month:
            category = t.get("category") or "Other"
            by_category[category] += -amount
    return {c: round(a, 2) for c, a in by_category.items()}


def average_monthly_spend_by_category(transactions: list[dict]) -> dict[str, float]:
    """Average monthly spend per category across every month that has any spend.

    The denominator is the count of DISTINCT months with at least one spend
    transaction (not calendar months elapsed), so a category seen in 2 of 2
    months averages over 2. Feeds the AI Budget Builder's starting suggestions.
    """
    spend_by_month_category: dict[str, dict[str, float]] = defaultdict(lambda: defaultdict(float))
    spend_months: set[str] = set()

    for t in transactions:
        amount = float(t["amount"])
        if amount < 0:
            mkey = t["date"][:7]
            category = t.get("category") or "Other"
            spend_by_month_category[mkey][category] += -amount
            spend_months.add(mkey)

    months_count = len(spend_months)
    if months_count == 0:
        return {}

    totals: dict[str, float] = defaultdict(float)
    for month_categories in spend_by_month_category.values():
        for category, amount in month_categories.items():
            totals[category] += amount

    return {c: round(a / months_count, 2) for c, a in totals.items()}
