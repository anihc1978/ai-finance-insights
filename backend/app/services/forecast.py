"""Pure-Python next-month spend forecast — no LLM.

Given ordered monthly spend totals (oldest -> newest), project next month's spend
with a recency-weighted average nudged by the recent trend. Returns a
non-negative float. Doing this in plain Python (not via Claude) keeps the number
deterministic and testable — and shows we don't reach for an LLM where simple
math will do.
"""


def forecast_next_month(monthly_spend: list[float]) -> float:
    """Project next month's spend from recent monthly totals.

    `monthly_spend` is oldest -> newest. Uses up to the last 6 months, weighting
    recent months more heavily, then applies half of the average month-over-month
    delta as a damped trend.
    """
    spends = [float(s) for s in monthly_spend if s is not None]
    if not spends:
        return 0.0
    if len(spends) == 1:
        return round(spends[0], 2)

    recent = spends[-6:]

    # Recency-weighted average: weights 1, 2, 3, ... for oldest -> newest in the window.
    weights = list(range(1, len(recent) + 1))
    weighted_avg = sum(s * w for s, w in zip(recent, weights)) / sum(weights)

    # Average month-over-month change across the window; apply half as a damped trend.
    deltas = [recent[i] - recent[i - 1] for i in range(1, len(recent))]
    avg_delta = sum(deltas) / len(deltas) if deltas else 0.0

    projection = weighted_avg + 0.5 * avg_delta
    return round(max(projection, 0.0), 2)
