# app/db.py
# ---------------------------------------------------------------------------
# Supabase database access. We build a client that acts AS the logged-in user
# (by attaching their JWT), so Postgres Row-Level Security automatically scopes
# every query to that user's own rows — even if our API code has a bug.
# ---------------------------------------------------------------------------
from supabase import create_client, Client

from app.config import settings


def user_client(token: str) -> Client:
    """A Supabase client scoped to one user via their JWT (RLS enforced)."""
    client = create_client(settings.supabase_url, settings.supabase_anon_key)
    client.postgrest.auth(token)  # run requests as this user → RLS applies
    return client
