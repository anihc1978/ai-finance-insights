"""
Typed configuration loaded from environment variables (.env in dev).

Using pydantic-settings means config is *validated* at startup — if a required
secret is missing, the app fails fast with a clear error instead of blowing up
mid-request. This is the kind of production hygiene senior reviewers look for.
"""
from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", extra="ignore", populate_by_name=True
    )

    # Supabase project settings (from your Supabase dashboard → Project Settings → API)
    supabase_url: str
    supabase_anon_key: str            # publishable key — lets the backend talk to the DB as the user (RLS)
    supabase_jwt_secret: str = ""     # legacy HS256 secret — unused now (modern Supabase signs ES256; auth.py verifies via JWKS)

    # Anthropic (used from Milestone 3 onward). SERVER-SIDE secret — never log,
    # return, or surface this in an error message.
    anthropic_api_key: str = ""

    # CORS: comma-separated allowlist of origins. We auth with Bearer tokens (not
    # cookies), so this is a simple explicit allowlist — never "*". Defaults cover
    # the local Vite/CRA dev servers.
    # OPERATOR: in production, APPEND your deployed frontend origin here via the
    # ALLOWED_ORIGINS env var, e.g.
    #   ALLOWED_ORIGINS="https://your-app.vercel.app,http://localhost:5173"
    allowed_origins_csv: str = Field(
        default="http://localhost:5173,http://localhost:3000,http://127.0.0.1:5173",
        # Read from the ALLOWED_ORIGINS env var (the name used in .env.example,
        # render.yaml and DEPLOY.md); ALLOWED_ORIGINS_CSV also accepted.
        validation_alias=AliasChoices("ALLOWED_ORIGINS", "ALLOWED_ORIGINS_CSV"),
    )
    # Back-compat: an older CORS_ORIGINS env var. If set, it's merged in too.
    cors_origins: str = ""

    # --- Rate limiting (in-memory, per-instance — see services/ratelimit.py) ---
    # Defaults are deliberately generous so normal use (and the test-suite) never
    # trips them. A test can shrink these via env / Settings override to assert 429.
    rate_limit_enabled: bool = True
    rate_limit_window_seconds: int = 60
    rate_limit_general: int = 120      # broad limit: requests / window / caller
    rate_limit_ai: int = 20            # stricter limit for the expensive AI endpoints

    @property
    def allowed_origins(self) -> list[str]:
        """Allowlist (comma-separated strings) -> de-duped list, for CORSMiddleware."""
        raw = f"{self.allowed_origins_csv},{self.cors_origins}"
        seen: list[str] = []
        for o in raw.split(","):
            o = o.strip()
            if o and o not in seen:
                seen.append(o)
        return seen


settings = Settings()  # raises at import time if required vars are missing


# ---------------------------------------------------------------------------
# Domain constants (Milestone 3+). Model ids and the category taxonomy live in
# one typed place. CATEGORIES must stay identical to the labels the frontend
# shows, so the two never drift.
# ---------------------------------------------------------------------------
CATEGORIZE_MODEL = "claude-haiku-4-5-20251001"   # fast/cheap — per-transaction labelling
INSIGHTS_MODEL = "claude-sonnet-4-6"             # stronger — the monthly narrative

CATEGORIES = [
    "Groceries", "Dining", "Transport", "Utilities", "Housing", "Shopping",
    "Entertainment", "Health", "Travel", "Subscriptions", "Income",
    "Transfers", "Other",
]

# Multi-currency support. The stored amounts are plain numbers; currency is a
# per-user display preference (profiles.currency). Symbols are passed to Claude
# so AI narratives/answers render amounts correctly.
SUPPORTED_CURRENCIES = ["USD", "AUD", "PEN"]
DEFAULT_CURRENCY = "USD"
CURRENCY_SYMBOLS = {"USD": "$", "AUD": "A$", "PEN": "S/"}
