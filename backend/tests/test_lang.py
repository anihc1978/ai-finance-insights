"""
Language toggle: the X-Lang request header flows through to the AI services.

The frontend sends `X-Lang: es|en` on every request; the backend's get_lang
dependency reads it (default "es") and passes it to the natural-language AI
outputs. Here we stub auth + the DB + the recap service and assert that the
header value reaches weekly_recap, and that anything unexpected falls back to
"es".
"""
import app.main as main
from app.auth import CurrentUser
from app.main import app, get_lang
from fastapi.testclient import TestClient

import pytest


class _FakeTable:
    def select(self, *a, **k): return self
    def order(self, *a, **k): return self
    def execute(self): return type("R", (), {"data": []})()


class _FakeClient:
    def table(self, *a, **k): return _FakeTable()


@pytest.fixture
def client(monkeypatch):
    fake_user = CurrentUser(id="user-123", email="t@example.com", token="fake")
    app.dependency_overrides[main.get_current_user] = lambda: fake_user
    monkeypatch.setattr(main, "user_client", lambda token: _FakeClient())
    yield TestClient(app)
    app.dependency_overrides.clear()


def test_x_lang_header_flows_to_recap(client, monkeypatch):
    seen = {}

    async def _fake_recap(txns, lang="es"):
        seen["lang"] = lang
        return {"start": None, "end": None, "total": 0, "byCategory": [], "narrative": ""}

    monkeypatch.setattr(main, "weekly_recap", _fake_recap)

    assert client.get("/recap/weekly", headers={"X-Lang": "en"}).status_code == 200
    assert seen["lang"] == "en"


def test_x_lang_defaults_to_es_when_absent(client, monkeypatch):
    seen = {}

    async def _fake_recap(txns, lang="es"):
        seen["lang"] = lang
        return {"start": None, "end": None, "total": 0, "byCategory": [], "narrative": ""}

    monkeypatch.setattr(main, "weekly_recap", _fake_recap)

    assert client.get("/recap/weekly").status_code == 200
    assert seen["lang"] == "es"


def test_get_lang_falls_back_to_es_on_unknown_value():
    class _Req:
        headers = {"x-lang": "fr"}

    assert get_lang(_Req()) == "es"


def test_get_lang_reads_en():
    class _Req:
        headers = {"x-lang": "EN"}

    assert get_lang(_Req()) == "en"
