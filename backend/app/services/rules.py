"""Merchant-based categorization rules (Origin-style "apply to all like this").

WHY: AI categorization is great for first-contact, but recurring merchants
("Starbucks", "Uber", "Netflix") should become *deterministic* — free, instant,
and consistent. We normalize each description to a stable merchant key and store
a per-user rule {match_key -> category}. On every categorize pass we apply rules
FIRST (no AI cost), then learn a rule from each AI result so the next occurrence
is deterministic.

GRACEFUL DEGRADATION: the `category_rules` table may not be migrated yet in the
live DB. Every DB touch here is wrapped in try/except — a missing table or any
query error logs and degrades to AI-only categorization. Rules NEVER crash a
request.
"""

import logging
import re

logger = logging.getLogger(__name__)

# Tokens that carry no merchant identity — branch cities, payment rails, filler.
# Stripped so "STARBUCKS LIMA" and "Starbucks Miraflores" collapse to "starbucks".
_STOPWORDS = {
    "lima", "miraflores", "surco", "callao", "peru", "pe",
    "yape", "plin", "pago", "compra", "transferencia", "transfer",
    "the", "de", "del", "la", "el", "los", "las", "y", "a", "to", "from",
    "sa", "sac", "eirl", "srl", "inc", "llc", "ltd", "co",
}

# Strip anything that isn't a letter/space: digits, dates, punctuation, symbols.
_NON_WORD = re.compile(r"[^a-záéíóúüñ\s]+", re.IGNORECASE)
_SPACES = re.compile(r"\s+")


def normalize_merchant(description: str) -> str:
    """Reduce a raw description to a stable merchant key.

    Lowercase, drop digits/dates/punctuation, collapse whitespace, drop generic
    stopwords, and keep the first ~3 meaningful tokens. Both
    "STARBUCKS LIMA 0423" and "Starbucks Miraflores" -> "starbucks".
    Returns "" when nothing meaningful remains (callers treat "" as "no rule").
    """
    if not description:
        return ""

    cleaned = _NON_WORD.sub(" ", description.lower())
    cleaned = _SPACES.sub(" ", cleaned).strip()
    if not cleaned:
        return ""

    tokens = [t for t in cleaned.split(" ") if t and t not in _STOPWORDS]
    if not tokens:
        # Everything was a stopword — fall back to the raw cleaned tokens so we
        # still produce *some* stable key rather than nothing.
        tokens = cleaned.split(" ")

    return " ".join(tokens[:3])


def apply_rules(client, txns: list[dict]) -> dict[str, str]:
    """Return {txn_id: category} for txns whose merchant key matches a saved rule.

    `txns` = [{id, description}, ...]. Fetches the user's category_rules (RLS
    scopes them to the caller) and matches each txn's normalized description.
    Graceful: a missing table or any query error logs and returns {} so the
    caller proceeds with AI-only categorization.
    """
    if not txns:
        return {}

    try:
        rows = client.table("category_rules").select("match_key, category").execute().data or []
    except Exception as exc:  # noqa: BLE001 — table may not exist yet; degrade to AI-only
        logger.warning("apply_rules: could not read category_rules (degrading to AI-only): %s", exc)
        return {}

    rule_map = {r["match_key"]: r["category"] for r in rows if r.get("match_key")}
    if not rule_map:
        return {}

    matched: dict[str, str] = {}
    for txn in txns:
        key = normalize_merchant(txn.get("description", ""))
        if key and key in rule_map:
            matched[str(txn["id"])] = rule_map[key]
    return matched


def learn_rule(client, description: str, category: str, user_id: str | None = None) -> None:
    """Upsert a merchant rule so this category sticks for similar future movements.

    Keyed on (user_id, match_key) — the DB UNIQUE constraint makes this an upsert.
    `user_id` is written explicitly (matching every other write in this app) so the
    row satisfies the table's NOT NULL + RLS insert check; callers pass user.id.
    Graceful: a blank key, missing table, or any query error logs and no-ops.
    """
    key = normalize_merchant(description)
    if not key or not category:
        return

    row = {"match_key": key, "category": category}
    if user_id is not None:
        row["user_id"] = user_id

    try:
        client.table("category_rules").upsert(
            row,
            on_conflict="user_id,match_key",
        ).execute()
    except Exception as exc:  # noqa: BLE001 — table may not exist yet; learning is best-effort
        logger.warning("learn_rule: could not upsert category_rule (best-effort, skipping): %s", exc)
