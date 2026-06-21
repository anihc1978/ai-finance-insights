"""Scan a Peruvian AFP estado de cuenta (private-pension statement).

WHY sonnet (INSIGHTS_MODEL): there is no API for AFP balances, so the user
photographs their paper/PDF statement. These statements are dense and the
balance is the number that matters, so we spend the stronger vision model on
accuracy rather than the cheap one. One statement -> one balance snapshot the
UI reviews before saving into afp_records.

Like the other services this never raises: a missing field comes back null.
"""

from app.config import INSIGHTS_MODEL
from app.services.vision import extract_from_image

_SYSTEM = (
    "You read Peruvian AFP (private-pension) account statements — estados de "
    "cuenta from Integra, Prima, Profuturo, or Habitat — written in Spanish. You "
    "return only structured data, never prose. You never invent a value that is "
    "not visible in the image."
)

_INSTRUCTION = (
    "This image is a Peruvian AFP estado de cuenta. Extract exactly these fields "
    "as a single JSON object:\n"
    '- "as_of": the statement date (fecha de corte / al) as "YYYY-MM-DD"\n'
    '- "balance": the total accumulated fund balance (fondo acumulado / saldo '
    "total) as a number in soles (no \"S/\", no thousands separators)\n"
    '- "fund_type": the fund type as a short string, e.g. "Fondo 0", "Fondo 1", '
    '"Fondo 2", "Fondo 3", or null if not shown\n'
    '- "contributed": the contribution for the period (aporte) as a number in '
    "soles, or null if not shown\n"
    '- "afp_name": the AFP name (Integra, Prima, Profuturo, or Habitat), or null '
    "if not shown\n"
    "Use null for any field you cannot read. Respond ONLY with the JSON object, "
    "no markdown."
)


async def scan_afp(image_bytes: bytes, media_type: str) -> dict:
    """Read one AFP statement image. Returns the extracted dict (or {})."""
    return await extract_from_image(
        image_bytes,
        media_type,
        model=INSIGHTS_MODEL,
        system=_SYSTEM,
        instruction=_INSTRUCTION,
    )
