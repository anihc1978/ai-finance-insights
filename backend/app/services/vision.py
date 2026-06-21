"""Claude vision helper — turn an image into a parsed JSON dict.

WHY a thin shared helper: both the Yape/Plin receipt scanner and the AFP
statement reader do the same dance — base64-encode the image, send it to Claude
with a persona + instruction, then json.loads the answer (tolerating code
fences). Only the model, persona, and instruction differ, so they live in the
callers; the mechanics live here once.

This never raises: a bad image, a network blip, or unparseable output all
degrade to an empty dict so the route can decide how to handle "nothing read".
"""

import base64
import json

from anthropic import AsyncAnthropic

from app.config import settings


def _strip_fences(text: str) -> str:
    """Tolerate ```json ... ``` fences the model may wrap its answer in."""
    text = text.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[1] if "\n" in text else text
        if text.endswith("```"):
            text = text[: text.rfind("```")]
    return text.strip()


async def extract_from_image(
    image_bytes: bytes,
    media_type: str,
    model: str,
    system: str,
    instruction: str,
) -> dict:
    """Run one Claude vision call and return the parsed JSON object.

    `media_type` is e.g. "image/png" / "image/jpeg". Returns {} on any failure
    (call error or unparseable output) — never raises.
    """
    try:
        data = base64.standard_b64encode(image_bytes).decode("ascii")
        client = AsyncAnthropic(api_key=settings.anthropic_api_key)
        message = await client.messages.create(
            model=model,
            max_tokens=1024,
            system=system,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image",
                            "source": {
                                "type": "base64",
                                "media_type": media_type,
                                "data": data,
                            },
                        },
                        {"type": "text", "text": instruction},
                    ],
                }
            ],
        )
    except Exception:
        # Network/API failure — caller treats {} as "couldn't read the image".
        return {}

    text = "".join(block.text for block in message.content if block.type == "text")
    try:
        parsed = json.loads(_strip_fences(text))
    except json.JSONDecodeError:
        return {}
    return parsed if isinstance(parsed, dict) else {}
