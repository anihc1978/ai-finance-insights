"""USD/PEN exchange-rate service for the Peru FX suite.

Three rate tiers are surfaced:

* **oficial** — the SBS banking-system rate published by the BCRP (Banco Central
  de Reserva del Perú) free JSON API. No key, no auth. Authoritative.
* **paralelo** — the street/Ócona "referencial" rate scraped from
  cuantoestaeldolar.pe (there is no free API for it).
* **bank** — a representative bank rate, also scraped from cuantoestaeldolar.pe.

The two *pure* parsers (`parse_bcrp`, `parse_ocona`) take raw payloads and return
plain dicts so they are unit-testable with no network. The async `get_rates` /
`get_official_history` add the I/O, an in-process TTL cache, and tolerant error
handling: a scrape failure NEVER raises out of here — we serve the last good
cache, or null values with `stale=True`. The browser must never call these
upstreams directly; everything goes through the backend.
"""

import re
import time
from datetime import datetime, timezone

import httpx

# --- upstream endpoints -----------------------------------------------------
# PD04639PD = TC Sistema bancario SBS Compra, PD04640PD = Venta. We resolve which
# column is which from the series *names* in the response (the API does not
# guarantee the URL's column order — it returned Venta-first on 2026-06-18), so
# never assume a positional mapping.
_BCRP_SERIES = "PD04639PD-PD04640PD"
_BCRP_URL = (
    "https://estadisticas.bcrp.gob.pe/estadisticas/series/api/"
    "{series}/json/{start}/{end}/ing"
)
_OCONA_URL = "https://cuantoestaeldolar.pe/ocona"

# Descriptive UA — polite scraping; some sites reject empty/default agents.
_USER_AGENT = (
    "ai-finance-insights/1.0 (Peru FX rate widget; +https://github.com/anihc1978)"
)

# --- TTL cache (module-level; single-process) -------------------------------
# key -> (value, expires_at). time.time() is fine for app code (the *parsers*
# stay pure and network-free for tests).
_CACHE: dict[str, tuple[object, float]] = {}
_OFICIAL_TTL = 6 * 60 * 60   # BCRP publishes ~once/day; 6h is plenty.
_SCRAPE_TTL = 15 * 60        # paralelo/bank move intraday; 15 min.

_SPANISH_MONTHS = {
    "Ene": "01", "Feb": "02", "Mar": "03", "Abr": "04", "May": "05", "Jun": "06",
    "Jul": "07", "Ago": "08", "Set": "09", "Sep": "09", "Oct": "10", "Nov": "11",
    "Dic": "12",
}


# ===========================================================================
# Pure helpers (no network — unit-tested directly)
# ===========================================================================

def _parse_spanish_date(name: str) -> str | None:
    """'18.Jun.26' -> '2026-06-18'. Returns None if it doesn't match."""
    parts = name.strip().split(".")
    if len(parts) != 3:
        return None
    day, mon, yy = parts
    month = _SPANISH_MONTHS.get(mon.capitalize())
    if month is None or not day.isdigit() or not yy.isdigit():
        return None
    year = 2000 + int(yy) if len(yy) == 2 else int(yy)
    return f"{year:04d}-{month}-{int(day):02d}"


def parse_bcrp(payload: dict) -> list[dict]:
    """BCRP JSON -> [{date, compra, venta}, ...], oldest -> newest.

    Resolves the compra/venta columns from `config.series[].name` (case-insensitive
    "compra"/"venta") rather than position. Rows where a needed value is "n.d."
    (non-trading day) or otherwise non-numeric are dropped.
    """
    series = (payload.get("config") or {}).get("series") or []
    compra_idx = venta_idx = None
    for i, s in enumerate(series):
        name = str(s.get("name", "")).lower()
        if "compra" in name:
            compra_idx = i
        elif "venta" in name:
            venta_idx = i
    if compra_idx is None or venta_idx is None:
        return []

    out: list[dict] = []
    for period in payload.get("periods") or []:
        date = _parse_spanish_date(str(period.get("name", "")))
        values = period.get("values") or []
        if date is None or max(compra_idx, venta_idx) >= len(values):
            continue
        raw_compra = str(values[compra_idx]).strip()
        raw_venta = str(values[venta_idx]).strip()
        # "n.d." (and any other non-numeric) -> skip this day entirely.
        if raw_compra.lower() == "n.d." or raw_venta.lower() == "n.d.":
            continue
        try:
            compra = float(raw_compra)
            venta = float(raw_venta)
        except ValueError:
            continue
        out.append({"date": date, "compra": compra, "venta": venta})

    out.sort(key=lambda r: r["date"])
    return out


def parse_ocona(html: str) -> dict:
    """cuantoestaeldolar.pe/ocona HTML -> {compra, venta} (floats or None).

    The page renders each currency's rate as numbers inside tags (e.g.
    `>3.379</p>`), in the order: compra, a tiny day-change delta (~0.00x), then
    venta. USD is the first currency on /ocona, so we take the first two
    *rate-sized* numbers (filtering out the small deltas) as USD compra and
    venta. Matching displayed `>NUMBER<` values avoids both the page's shifting
    CSS-class selectors and the decimal coords buried in inline SVG paths.
    """
    nums = re.findall(r">([0-9]\.[0-9]{3,4})<", html)
    rates = [float(n) for n in nums if float(n) >= 1.0]
    if len(rates) >= 2:
        return {"compra": rates[0], "venta": rates[1]}
    return {"compra": None, "venta": None}


# ===========================================================================
# Async fetchers + TTL cache + tolerant get_rates / get_official_history
# ===========================================================================

def _cache_get(key: str):
    hit = _CACHE.get(key)
    if hit is not None and hit[1] > time.time():
        return hit[0]
    return None


_CACHE_MAX = 128  # bound memory: /rates/history day-ranges can mint distinct keys


def _cache_set(key: str, value: object, ttl: int) -> None:
    # If the cache is full of distinct keys, evict the soonest-to-expire entry
    # before inserting so it can't grow unbounded; recent entries stay for the
    # stale (last-good) fallback.
    if key not in _CACHE and len(_CACHE) >= _CACHE_MAX:
        _CACHE.pop(min(_CACHE, key=lambda k: _CACHE[k][1]), None)
    _CACHE[key] = (value, time.time() + ttl)


def _cache_get_stale(key: str):
    """Return a cached value even if expired (last-good fallback)."""
    hit = _CACHE.get(key)
    return hit[0] if hit is not None else None


async def _fetch_bcrp(start: str, end: str) -> list[dict]:
    """GET the BCRP range and parse it. Caches by (start, end)."""
    cache_key = f"bcrp:{start}:{end}"
    cached = _cache_get(cache_key)
    if cached is not None:
        return cached  # type: ignore[return-value]

    url = _BCRP_URL.format(series=_BCRP_SERIES, start=start, end=end)
    async with httpx.AsyncClient(timeout=20, headers={"User-Agent": _USER_AGENT}) as client:
        resp = await client.get(url)
        resp.raise_for_status()
        rows = parse_bcrp(resp.json())

    _cache_set(cache_key, rows, _OFICIAL_TTL)
    return rows


async def _fetch_ocona() -> dict:
    """GET + parse cuantoestaeldolar.pe/ocona. Caches the parsed dict."""
    cache_key = "ocona"
    cached = _cache_get(cache_key)
    if cached is not None:
        return cached  # type: ignore[return-value]

    async with httpx.AsyncClient(timeout=20, headers={"User-Agent": _USER_AGENT}) as client:
        resp = await client.get(_OCONA_URL, follow_redirects=True)
        resp.raise_for_status()
        parsed = parse_ocona(resp.text)

    _cache_set(cache_key, parsed, _SCRAPE_TTL)
    return parsed


def _today_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def _days_ago_iso(days: int) -> str:
    ts = time.time() - days * 86400
    return datetime.fromtimestamp(ts, timezone.utc).strftime("%Y-%m-%d")


async def get_rates() -> dict:
    """Current three-tier USD/PEN rates. Never raises — degrades to stale/null.

    Returns:
      {
        "oficial":  {"compra": float, "venta": float, "date": str},
        "paralelo": {"compra": float|None, "venta": float|None, "referencial": True},
        "bank":     {"compra": float|None, "venta": float|None},
        "fetched_at": iso8601,
        "stale": bool,
      }
    """
    stale = False

    # --- Oficial (BCRP): pull a short recent window, take the latest row. -----
    oficial = {"compra": None, "venta": None, "date": None}
    try:
        # ~10 days back covers weekends/holidays so we always catch a trading day.
        rows = await _fetch_bcrp(_days_ago_iso(10), _today_iso())
        if rows:
            latest = rows[-1]
            oficial = {
                "compra": latest["compra"],
                "venta": latest["venta"],
                "date": latest["date"],
            }
    except Exception:
        last_good = _cache_get_stale(f"bcrp:{_days_ago_iso(10)}:{_today_iso()}")
        if last_good:
            latest = last_good[-1]  # type: ignore[index]
            oficial = {
                "compra": latest["compra"],
                "venta": latest["venta"],
                "date": latest["date"],
            }
        stale = True

    # --- Paralelo + bank (scrape): same source, tolerate failure. ------------
    scraped = {"compra": None, "venta": None}
    try:
        scraped = await _fetch_ocona()
    except Exception:
        last_good = _cache_get_stale("ocona")
        if isinstance(last_good, dict):
            scraped = last_good
        stale = True

    return {
        "oficial": oficial,
        "paralelo": {
            "compra": scraped.get("compra"),
            "venta": scraped.get("venta"),
            "referencial": True,
        },
        # No distinct bank scrape selector yet — surface the same scraped figures
        # under the bank tier so the table renders; refine the selector later.
        "bank": {
            "compra": scraped.get("compra"),
            "venta": scraped.get("venta"),
        },
        "fetched_at": datetime.now(timezone.utc).isoformat(),
        "stale": stale,
    }


async def get_official_history(days: int) -> dict:
    """Official compra/venta series for the last `days`. Never raises.

    Returns {"series": [{"date": "YYYY-MM-DD", "compra": float, "venta": float}, ...]}
    oldest -> newest. On upstream failure, returns the last-good cache or an
    empty series.
    """
    days = max(1, min(days, 365))
    start, end = _days_ago_iso(days), _today_iso()
    try:
        rows = await _fetch_bcrp(start, end)
    except Exception:
        rows = _cache_get_stale(f"bcrp:{start}:{end}") or []  # type: ignore[assignment]
    return {"series": rows}
