"""
Hardening tests: per-user AI rate limiting (429 on exceed, 200 under the limit)
and the CORS allowlist coming from settings (never a wildcard).

These use FastAPI's TestClient with the auth + DB + AI service calls stubbed, so
no real Supabase or Anthropic call is made. The AI limit is shrunk to a tiny
value via the Settings object (the same field the operator sets via env), then
restored, so the rest of the suite keeps its generous defaults.
"""
import app.main as main
import app.services.ratelimit as ratelimit
from app.auth import CurrentUser
from app.config import settings
from app.main import app
from fastapi.testclient import TestClient

import pytest


@pytest.fixture
def client(monkeypatch):
    """A TestClient with auth stubbed, the DB + AI service no-op'd, a tiny AI limit,
    and the rate-limit counters reset before and after."""
    # Stub auth: every request is the same fake user (no JWT/JWKS needed).
    fake_user = CurrentUser(id="user-123", email="t@example.com", token="fake")
    app.dependency_overrides[main.get_current_user] = lambda: fake_user

    # Stub the DB client and the AI service so the /recap/weekly body never hits
    # the network — we're testing the limiter, not the recap.
    monkeypatch.setattr(main, "user_client", lambda token: _FakeClient())

    async def _fake_recap(txns, lang="es"):
        return {"start": None, "end": None, "total": 0, "byCategory": {}, "narrative": ""}

    monkeypatch.setattr(main, "weekly_recap", _fake_recap)

    # Tiny AI limit so a handful of requests trips it; restore afterwards.
    original_ai = settings.rate_limit_ai
    settings.rate_limit_ai = 3
    ratelimit._reset()

    yield TestClient(app)

    settings.rate_limit_ai = original_ai
    ratelimit._reset()
    app.dependency_overrides.clear()


class _FakeTable:
    def select(self, *a, **k): return self
    def order(self, *a, **k): return self
    def execute(self): return type("R", (), {"data": []})()


class _FakeClient:
    def table(self, *a, **k): return _FakeTable()


def test_ai_endpoint_allows_requests_under_the_limit(client):
    # Limit is 3 — the first three AI calls all succeed.
    for _ in range(3):
        resp = client.get("/recap/weekly")
        assert resp.status_code == 200


def test_ai_endpoint_returns_429_when_limit_exceeded(client):
    for _ in range(3):
        assert client.get("/recap/weekly").status_code == 200
    # The 4th exceeds the AI limit.
    resp = client.get("/recap/weekly")
    assert resp.status_code == 429
    assert resp.json()["detail"] == "Demasiadas solicitudes, intenta de nuevo en un momento."


def test_health_is_unauthenticated_and_not_ai_limited(client):
    # /health has no AI limit; the broad general limit (120) leaves it untouched here.
    for _ in range(10):
        assert client.get("/health").status_code == 200


def test_cors_allowlist_from_settings_not_wildcard():
    # The allowlist is the explicit local-dev origins, never "*".
    origins = settings.allowed_origins
    assert "*" not in origins
    assert "http://localhost:5173" in origins
    # And it's actually wired into the running app's CORS middleware.
    cors = [m for m in app.user_middleware if m.cls.__name__ == "CORSMiddleware"]
    assert cors, "CORSMiddleware not configured"
    configured = cors[0].kwargs["allow_origins"]
    assert "*" not in configured
    assert "http://localhost:5173" in configured


def test_cors_preflight_allows_a_listed_origin():
    c = TestClient(app)
    resp = c.options(
        "/health",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "GET",
        },
    )
    assert resp.headers.get("access-control-allow-origin") == "http://localhost:5173"
