"""Unit tests for merchant categorization rules.

normalize_merchant is pure. apply_rules/learn_rule touch a Supabase-style client,
so we use a tiny fake (no network, no real DB) and a "table missing" fake to prove
graceful degradation: a missing category_rules table must never crash — apply_rules
returns {} (AI-only) and learn_rule is a silent no-op.
"""

from app.services.rules import apply_rules, learn_rule, normalize_merchant


# ---- normalize_merchant ----------------------------------------------------

def test_normalize_strips_digits_and_location():
    # Both forms of the same merchant collapse to the same key.
    assert normalize_merchant("STARBUCKS LIMA 0423") == "starbucks"
    assert normalize_merchant("Starbucks Miraflores") == "starbucks"


def test_normalize_lowercases_and_collapses_spaces():
    assert normalize_merchant("  UBER   Trip  ") == "uber trip"


def test_normalize_drops_punctuation_and_dates():
    assert normalize_merchant("NETFLIX.COM 2026-06-01") == "netflix com"


def test_normalize_keeps_first_three_meaningful_tokens():
    assert normalize_merchant("Plaza Vea Supermercado Surco Express") == "plaza vea supermercado"


def test_normalize_empty_and_only_noise():
    assert normalize_merchant("") == ""
    assert normalize_merchant("12345 ----") == ""


def test_normalize_only_stopwords_falls_back_to_cleaned():
    # All stopwords — we still return a stable (non-empty) key rather than "".
    assert normalize_merchant("Yape Pago") == "yape pago"


def test_normalize_handles_spanish_accents():
    assert normalize_merchant("Farmacía Inkafarma 99") == "farmacía inkafarma"


# ---- fakes -----------------------------------------------------------------

class _FakeQuery:
    """Records upserts; returns canned rows on select; .execute() yields .data."""

    def __init__(self, table):
        self._table = table

    def select(self, *_a, **_k):
        return self

    def upsert(self, row, **_k):
        self._table.upserts.append(row)
        return self

    def execute(self):
        return type("Res", (), {"data": self._table.rows})()


class _FakeTable:
    def __init__(self, rows):
        self.rows = rows
        self.upserts = []


class _FakeClient:
    """Serves one table's rows; .table(name) returns a query over it."""

    def __init__(self, rows):
        self._t = _FakeTable(rows)

    def table(self, _name):
        return _FakeQuery(self._t)

    @property
    def upserts(self):
        return self._t.upserts


class _BrokenClient:
    """Every DB call raises — simulates the category_rules table not existing yet."""

    def table(self, _name):
        raise RuntimeError('relation "category_rules" does not exist')


# ---- apply_rules -----------------------------------------------------------

def test_apply_rules_matches_normalized_descriptions():
    client = _FakeClient([
        {"match_key": "starbucks", "category": "Dining"},
        {"match_key": "uber trip", "category": "Transport"},
    ])
    txns = [
        {"id": "1", "description": "STARBUCKS LIMA 0423"},
        {"id": "2", "description": "Uber Trip 99"},
        {"id": "3", "description": "Some Unknown Shop"},
    ]
    out = apply_rules(client, txns)
    assert out == {"1": "Dining", "2": "Transport"}  # id 3 unmatched -> left for AI


def test_apply_rules_empty_txns_short_circuits():
    assert apply_rules(_BrokenClient(), []) == {}


def test_apply_rules_degrades_gracefully_when_table_missing():
    # Must NOT raise — returns {} so the caller proceeds with AI-only.
    out = apply_rules(_BrokenClient(), [{"id": "1", "description": "Starbucks"}])
    assert out == {}


def test_apply_rules_no_rules_returns_empty():
    assert apply_rules(_FakeClient([]), [{"id": "1", "description": "Starbucks"}]) == {}


# ---- learn_rule ------------------------------------------------------------

def test_learn_rule_upserts_normalized_key():
    client = _FakeClient([])
    learn_rule(client, "STARBUCKS LIMA 0423", "Dining", user_id="u-1")
    assert client.upserts == [
        {"match_key": "starbucks", "category": "Dining", "user_id": "u-1"}
    ]


def test_learn_rule_skips_blank_key_or_category():
    client = _FakeClient([])
    learn_rule(client, "12345 ----", "Dining", user_id="u-1")  # blank key
    learn_rule(client, "Starbucks", "", user_id="u-1")          # blank category
    assert client.upserts == []


def test_learn_rule_degrades_gracefully_when_table_missing():
    # Must NOT raise even though every DB call throws.
    learn_rule(_BrokenClient(), "Starbucks", "Dining", user_id="u-1")
