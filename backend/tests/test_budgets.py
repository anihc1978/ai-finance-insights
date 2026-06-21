"""Unit tests for pure budget math. No network, no DB — inline sample data."""

from app.services.budgets import (
    average_monthly_spend_by_category,
    spend_by_category_for_month,
)

# Negative = spend, positive = income; "date" is 'YYYY-MM-DD'.
SAMPLE = [
    {"date": "2026-01-05", "amount": -50.0, "category": "Groceries"},
    {"date": "2026-01-10", "amount": -30.0, "category": "Dining"},
    {"date": "2026-01-12", "amount": -20.0, "category": "Groceries"},
    {"date": "2026-01-15", "amount": 2000.0, "category": "Income"},
    {"date": "2026-02-03", "amount": -100.0, "category": "Groceries"},
    {"date": "2026-02-20", "amount": 1500.0, "category": "Income"},
]


def test_spend_by_category_sums_negatives_for_the_month():
    spent = spend_by_category_for_month(SAMPLE, "2026-01")
    assert spent == {"Groceries": 70.0, "Dining": 30.0}  # 50+20 groceries, 30 dining


def test_spend_by_category_excludes_income_and_other_months():
    spent = spend_by_category_for_month(SAMPLE, "2026-02")
    assert spent == {"Groceries": 100.0}  # income ignored, Jan excluded


def test_spend_by_category_empty_month():
    assert spend_by_category_for_month(SAMPLE, "2026-09") == {}


def test_spend_by_category_uncategorized_defaults_to_other():
    txns = [{"date": "2026-03-01", "amount": -40.0, "category": None}]
    assert spend_by_category_for_month(txns, "2026-03") == {"Other": 40.0}


def test_average_divides_by_distinct_spend_months():
    avg = average_monthly_spend_by_category(SAMPLE)
    # Two distinct spend months (Jan, Feb). Groceries: (70 + 100) / 2 = 85.
    assert avg["Groceries"] == 85.0
    # Dining only in Jan: 30 / 2 = 15 (denominator is distinct months, not months seen).
    assert avg["Dining"] == 15.0


def test_average_excludes_income():
    avg = average_monthly_spend_by_category(SAMPLE)
    assert "Income" not in avg


def test_average_empty_input():
    assert average_monthly_spend_by_category([]) == {}


def test_average_no_spend_only_income():
    txns = [{"date": "2026-01-01", "amount": 500.0, "category": "Income"}]
    assert average_monthly_spend_by_category(txns) == {}


def test_average_single_month_single_category():
    txns = [
        {"date": "2026-01-01", "amount": -10.0, "category": "Transport"},
        {"date": "2026-01-15", "amount": -10.0, "category": "Transport"},
    ]
    assert average_monthly_spend_by_category(txns) == {"Transport": 20.0}
