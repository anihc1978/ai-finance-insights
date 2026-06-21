"""Scan a Peruvian Yape/Plin transfer receipt (constancia) into a transaction.

WHY haiku (CATEGORIZE_MODEL): these screenshots are high-volume and the layout
is simple and consistent, so the cheap vision-capable model is the right tool.
A receipt is one transfer — we pull the amount, who/which way, when, and the
operation id (used downstream to dedupe re-scans of the same screenshot).

Like the other services this never raises: a missing field comes back null and
the route decides what to do with a half-read receipt.
"""

from app.config import CATEGORIZE_MODEL
from app.services.vision import extract_from_image

_SYSTEM = (
    "You read Peruvian Yape and Plin money-transfer receipts (constancias de "
    "transferencia), written in Spanish. You return only structured data, never "
    "prose. You never invent a value that is not visible in the image."
)

_INSTRUCTION = (
    "This image is a Yape or Plin transfer receipt. Extract exactly these fields "
    "as a single JSON object:\n"
    '- "amount": the transferred amount as a positive number in soles (no "S/", '
    "no thousands separators)\n"
    '- "direction": "enviado" if the user sent the money, "recibido" if they '
    "received it\n"
    '- "counterparty": the name of the other person/business in the transfer\n'
    '- "date": the transfer date as "YYYY-MM-DD"\n'
    '- "time": the transfer time as a string, or null if not shown\n'
    '- "operation_id": the operation/constancia number (número de operación), or '
    "null if not shown\n"
    '- "wallet": "yape", "plin", or "other" — infer from the branding (Yape is '
    "purple/morado; Plin is shown per-bank)\n"
    '- "description": a short human label for the transfer\n'
    "Use null for any field you cannot read. Respond ONLY with the JSON object, "
    "no markdown."
)


async def scan_receipt(image_bytes: bytes, media_type: str) -> dict:
    """Read one Yape/Plin receipt image. Returns the extracted dict (or {})."""
    return await extract_from_image(
        image_bytes,
        media_type,
        model=CATEGORIZE_MODEL,
        system=_SYSTEM,
        instruction=_INSTRUCTION,
    )
