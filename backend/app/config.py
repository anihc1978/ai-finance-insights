"""
Typed configuration loaded from environment variables (.env in dev).

Using pydantic-settings means config is *validated* at startup — if a required
secret is missing, the app fails fast with a clear error instead of blowing up
mid-request. This is the kind of production hygiene senior reviewers look for.
"""
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Supabase project settings (from your Supabase dashboard → Project Settings → API)
    supabase_url: str
    supabase_anon_key: str            # publishable key — lets the backend talk to the DB as the user (RLS)
    supabase_jwt_secret: str = ""     # legacy HS256 secret — unused now (modern Supabase signs ES256; auth.py verifies via JWKS)

    # Anthropic (used from Milestone 3 onward)
    anthropic_api_key: str = ""

    # CORS: comma-separated list of allowed origins. Override in production via the
    # CORS_ORIGINS env var, e.g. "https://your-app.vercel.app,http://localhost:5173".
    cors_origins: str = "http://localhost:5173"

    @property
    def allowed_origins(self) -> list[str]:
        """cors_origins (comma-separated string) -> list, for CORSMiddleware."""
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


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
