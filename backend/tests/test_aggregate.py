"""Unit tests for pure aggregation. No network, no DB — inline sample data."""

from app.services.aggregate import aggregate, latest_month_with_data

# A small, deterministic transaction set spanning two months.
# Negative = spend, positive = income; "date" is 'YYYY-MM-DD'.
SAMPLE = [
    {"date": "2026-01-05", "amount": -50.0, "category": "Groceries"},
    {"date": "2026-01-10", "amount": -30.0, "category": "Dining"},
    {"date": "2026-01-12", "amount": -20.0, "category": "Groceries"},
    {"date": "2026-01-15", "amount": 2000.0, "category": "Income"},
    {"date": "2026-02-03", "amount": -100.0, "category": "Shopping"},
    {"date": "2026-02-20", "amount": 1500.0, "category": "Income"},
]


def test_total_spend_is_absolute_value_of_negatives():
    agg = aggregate(SAMPLE, "2026-01")
    assert agg["totalSpend"] == 100.0  # 50 + 30 + 20


def test_total_income_is_sum_of_positives():
    agg = aggregate(SAMPLE, "2026-01")
    assert agg["totalIncome"] == 2000.0


def test_by_category_is_for_target_month_and_sorted_desc():
    agg = aggregate(SAMPLE, "2026-01")
    # Groceries (50+20=70) should outrank Dining (30); income is excluded from spend categories.
    assert agg["byCategory"] == [
        {"category": "Groceries", "amount": 70.0},
        {"category": "Dining", "amount": 30.0},
    ]


def test_month_filtering_changes_totals():
    agg = aggregate(SAMPLE, "2026-02")
    assert agg["totalSpend"] == 100.0
    assert agg["totalIncome"] == 1500.0
    assert agg["byCategory"] == [{"category": "Shopping", "amount": 100.0}]


def test_month_over_month_covers_all_months_oldest_first():
    agg = aggregate(SAMPLE, "2026-01")
    assert agg["monthOverMonth"] == [
        {"month": "2026-01", "spend": 100.0},
        {"month": "2026-02", "spend": 100.0},
    ]


def test_missing_category_defaults_to_other():
    txns = [{"date": "2026-03-01", "amount": -40.0, "category": None}]
    agg = aggregate(txns, "2026-03")
    assert agg["byCategory"] == [{"category": "Other", "amount": 40.0}]


def test_latest_month_with_data():
    assert latest_month_with_data(SAMPLE) == "2026-02"


def test_latest_month_with_data_empty():
    assert latest_month_with_data([]) is None
