"""Unit tests for the pure FX parsers. No network, no DB — inline fixtures.

parse_bcrp turns the BCRP JSON payload into a clean ascending history series of
{date, compra, venta}, filtering non-trading days ("n.d.") and converting the
Spanish short date "DD.Mon.YY" to ISO "YYYY-MM-DD". parse_ocona pulls the
paralelo compra/venta floats out of a cuantoestaeldolar.pe HTML snippet.
"""

from app.services.fx import parse_bcrp, parse_ocona

# Real BCRP shape: note the series come back as [Venta, Compra] (NOT compra-first),
# so values must be mapped by series NAME, not by position. One non-trading day
# ("n.d.") must be dropped. Dates are the Spanish short form "DD.Mon.YY".
BCRP_PAYLOAD = {
    "config": {
        "title": "Tipo de cambio",
        "series": [
            {"name": "Tipo de cambio - TC Sistema bancario SBS (S/ por US$) - Venta", "dec": "3"},
            {"name": "Tipo de cambio - TC Sistema bancario SBS (S/ por US$) - Compra", "dec": "3"},
        ],
    },
    "periods": [
        {"name": "15.Jun.26", "values": ["3.387", "3.375"]},
        {"name": "16.Jun.26", "values": ["3.382", "3.376"]},
        {"name": "17.Jun.26", "values": ["n.d.", "n.d."]},   # non-trading day -> filtered out
        {"name": "18.Jun.26", "values": ["3.388", "3.381"]},
    ],
}


def test_parse_bcrp_filters_non_trading_days():
    series = parse_bcrp(BCRP_PAYLOAD)
    # The "n.d." row (17 Jun) must be dropped; the other three remain.
    assert len(series) == 3
    assert all(row["date"] != "2026-06-17" for row in series)


def test_parse_bcrp_converts_spanish_dates_to_iso():
    series = parse_bcrp(BCRP_PAYLOAD)
    dates = [row["date"] for row in series]
    assert dates == ["2026-06-15", "2026-06-16", "2026-06-18"]


def test_parse_bcrp_maps_compra_and_venta_by_series_name():
    # Maps by series NAME, not position: Venta is first in the payload here.
    series = parse_bcrp(BCRP_PAYLOAD)
    latest = series[-1]  # 18 Jun
    assert latest["compra"] == 3.381
    assert latest["venta"] == 3.388
    assert isinstance(latest["compra"], float)
    assert isinstance(latest["venta"], float)


def test_parse_bcrp_returns_full_history_in_ascending_order():
    series = parse_bcrp(BCRP_PAYLOAD)
    dates = [row["date"] for row in series]
    assert dates == sorted(dates)
    # Spot-check the first (earliest) trading day's values.
    assert series[0] == {"date": "2026-06-15", "compra": 3.375, "venta": 3.387}


def test_parse_bcrp_empty_periods():
    payload = {"config": {"series": [{"name": "x - Venta"}, {"name": "x - Compra"}]}, "periods": []}
    assert parse_bcrp(payload) == []


def test_parse_bcrp_all_non_trading_days():
    payload = {
        "config": {
            "series": [{"name": "x - Venta"}, {"name": "x - Compra"}],
        },
        "periods": [{"name": "17.Jun.26", "values": ["n.d.", "n.d."]}],
    }
    assert parse_bcrp(payload) == []


# A trimmed cuantoestaeldolar.pe / ocona snippet. The parser should find the
# paralelo compra and venta floats regardless of surrounding markup.
OCONA_HTML = """
<html><body>
  <section class="exchange-house">
    <h2>Dólar paralelo Ocoña</h2>
    <div class="rates">
      <div class="buy">
        <span class="label">Compra</span>
        <span class="value">3.379</span>
      </div>
      <div class="sell">
        <span class="label">Venta</span>
        <span class="value">3.381</span>
      </div>
    </div>
    <p class="note">Tipo de cambio referencial</p>
  </section>
</body></html>
"""


def test_parse_ocona_extracts_compra_and_venta():
    rates = parse_ocona(OCONA_HTML)
    assert rates["compra"] == 3.379
    assert rates["venta"] == 3.381
    assert isinstance(rates["compra"], float)
    assert isinstance(rates["venta"], float)
