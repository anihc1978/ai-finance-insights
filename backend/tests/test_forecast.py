"""Unit tests for the pure forecast function. No network, no DB."""

from app.services.forecast import forecast_next_month


def test_empty_returns_zero():
    assert forecast_next_month([]) == 0.0


def test_single_month_returns_that_month():
    # With only one data point there's no trend to compute — just echo it.
    assert forecast_next_month([120.0]) == 120.0


def test_flat_history_projects_same_value():
    # Constant spend -> no trend -> projection equals the level.
    assert forecast_next_month([100.0, 100.0, 100.0]) == 100.0


def test_upward_trend_nudges_projection_up():
    # A rising series should forecast ABOVE the same numbers with no trend.
    # The recency-weighted average of [100,200,300] is 233.33; the upward trend
    # nudges the projection above that baseline.
    rising = forecast_next_month([100.0, 200.0, 300.0])
    assert rising > 233.33


def test_downward_trend_nudges_projection_down():
    # A falling series should forecast BELOW its recency-weighted baseline.
    # [300,200,100] has the same weighted average (166.67); the downward trend
    # pulls the projection beneath it.
    falling = forecast_next_month([300.0, 200.0, 100.0])
    assert falling < 166.67


def test_trend_direction_orders_forecasts():
    # Same magnitudes, opposite order: the rising series must out-forecast the falling one.
    assert forecast_next_month([100.0, 200.0, 300.0]) > forecast_next_month([300.0, 200.0, 100.0])


def test_never_negative():
    # A steep downward trend must clamp at 0, never go negative.
    assert forecast_next_month([50.0, 30.0, 10.0]) >= 0.0


def test_ignores_none_values():
    # None entries are skipped, not treated as 0.
    assert forecast_next_month([None, 100.0]) == 100.0
