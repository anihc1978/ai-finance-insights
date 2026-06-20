"""Batch transaction categorization with Claude (haiku).

WHY one batched call: labelling each transaction with its own request would be
slow and expensive. We hand Claude the whole list once and ask for a single JSON
object mapping each id -> category. Any id Claude omits, or any category outside
our fixed taxonomy, falls back to "Other" so the caller always gets a clean map.
"""

import json

from anthropic import AsyncAnthropic

from app.config import CATEGORIES, CATEGORIZE_MODEL, settings

# A set for O(1) "is this a real category?" checks below.
_CATEGORY_SET = set(CATEGORIES)

_SYSTEM = (
    "You are a precise personal-finance transaction categorizer. "
    "Assign each transaction to exactly one category from this fixed list:\n"
    + ", ".join(CATEGORIES)
    + ".\n"
    "Rules: positive amounts that look like salary/refunds are usually Income. "
    "Movements between a user's own accounts are Transfers. Recurring charges like "
    "Netflix/Spotify/gym are Subscriptions. If genuinely unsure, use Other. "
    "Respond ONLY with a JSON object mapping each transaction id (string) to its "
    "category string. No prose, no markdown."
)


def _strip_fences(text: str) -> str:
    """Tolerate ```json ... ``` fences the model may wrap its answer in."""
    text = text.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[1] if "\n" in text else text
        if text.endswith("```"):
            text = text[: text.rfind("```")]
    return text.strip()


async def categorize(items: list[dict]) -> dict[str, str]:
    """Categorize transactions. `items` = [{id, description}]. Returns {id: category}."""
    if not items:
        return {}

    client = AsyncAnthropic(api_key=settings.anthropic_api_key)
    lines = [{"id": str(it["id"]), "description": it.get("description", "")} for it in items]

    message = await client.messages.create(
        model=CATEGORIZE_MODEL,
        max_tokens=2000,
        system=_SYSTEM,
        messages=[
            {
                "role": "user",
                "content": (
                    "Categorize these transactions. Return JSON {id: category}.\n\n"
                    + json.dumps(lines, ensure_ascii=False)
                ),
            }
        ],
    )

    text = "".join(block.text for block in message.content if block.type == "text")
    try:
        parsed = json.loads(_strip_fences(text))
    except json.JSONDecodeError:
        # If Claude returns something unparseable, every id falls back to "Other" below.
        parsed = {}

    # Build the result from OUR ids, not Claude's — guarantees one entry per input
    # and rejects any hallucinated category not in the taxonomy.
    result: dict[str, str] = {}
    for it in items:
        txn_id = str(it["id"])
        category = parsed.get(txn_id)
        result[txn_id] = category if category in _CATEGORY_SET else "Other"
    return result
