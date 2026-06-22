"""Detect where a transaction comes from — a Peruvian bank, wallet, or AFP.

Pure Python, no I/O. Given a transaction's description and its `raw` jsonb,
return a single canonical source KEY (or None). The frontend maps that key to a
brand label + colour chip.

Priority:
1. raw.wallet — set by the Yape/Plin scanner ("yape" / "plin").
2. raw.source_key — set on import when the user tags a whole statement.
3. keyword match on the lowercased description.

Safe on missing/odd data: a non-dict `raw` or non-string description just
falls through to None.
"""

# Canonical source keys the frontend knows how to render.
CANONICAL_SOURCES = (
    "yape",
    "plin",
    "bcp",
    "interbank",
    "bbva",
    "scotiabank",
    "bn",
    "integra",
    "prima",
    "profuturo",
    "habitat",
)

# Description keyword -> canonical key. Order matters only for readability;
# the first matching keyword wins.
_KEYWORDS: tuple[tuple[str, str], ...] = (
    ("yape", "yape"),
    ("plin", "plin"),
    ("interbank", "interbank"),
    ("bcp", "bcp"),
    ("credito", "bcp"),
    ("continental", "bbva"),
    ("bbva", "bbva"),
    ("scotia", "scotiabank"),
    ("nacion", "bn"),
    ("integra", "integra"),
    ("profuturo", "profuturo"),
    ("habitat", "habitat"),
    ("prima", "prima"),
)


def detect_source(description: str, raw: dict | None) -> str | None:
    """Return the canonical source key for a transaction, or None if unknown."""
    if isinstance(raw, dict):
        wallet = raw.get("wallet")
        if wallet == "yape":
            return "yape"
        if wallet == "plin":
            return "plin"

        source_key = raw.get("source_key")
        if source_key in CANONICAL_SOURCES:
            return source_key

    if not isinstance(description, str):
        return None

    text = description.lower()
    for keyword, key in _KEYWORDS:
        if keyword in text:
            return key

    return None
