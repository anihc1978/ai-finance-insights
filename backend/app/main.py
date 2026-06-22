"""
AI Finance Insights — FastAPI entrypoint.

Run locally:  uvicorn app.main:app --reload --port 8000
"""
import io
import json
from datetime import datetime

import pandas as pd
from anthropic import AsyncAnthropic
from fastapi import FastAPI, Depends, UploadFile, File, Form, HTTPException, status
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware

from app.auth import get_current_user, CurrentUser
from app.config import (
    CURRENCY_SYMBOLS,
    DEFAULT_CURRENCY,
    INSIGHTS_MODEL,
    SUPPORTED_CURRENCIES,
    settings,
)
from app.db import user_client
from app.services.aggregate import latest_month_with_data
from app.services.budgets import (
    average_monthly_spend_by_category,
    spend_by_category_for_month,
)
from app.services.afp import scan_afp
from app.services.categorizer import categorize
from app.services.chat import build_chat_reply
from app.services.fx import get_official_history, get_rates
from app.services.insights import build_insight
from app.services.recap import weekly_recap
from app.services.scanner import scan_receipt
from app.services.source import detect_source
from app.services.subscriptions import detect_subscriptions

app = FastAPI(title="AI Finance Insights API")

# Allow the React dev server (Vite default port 5173) to call this API.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,   # ["http://localhost:5173"] in dev; CORS_ORIGINS in prod
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    """Public liveness probe — no auth required."""
    return {"status": "ok"}


@app.get("/me")
def me(user: CurrentUser = Depends(get_current_user)):
    """
    Protected route. Depends(get_current_user) runs FIRST: it verifies the
    Supabase JWT and returns the user, or raises 401.
    """
    return {"user_id": user.id, "email": user.email}


@app.post("/transactions/import")
async def import_transactions(
    file: UploadFile = File(...),
    currency: str = Form("PEN"),
    source: str = Form(""),
    user: CurrentUser = Depends(get_current_user),
):
    """Receive a CSV, parse it, and store each row as one of the user's transactions.

    Every row in one import shares a single `currency` tag (PEN or USD). Anything
    other than USD falls back to the PEN default, so a bad/missing value can never
    write an invalid currency.

    An optional `source` tags the whole statement (e.g. "bcp", "yape") so every
    row's `raw.source_key` lets detect_source label it with a brand chip.
    """
    currency = currency if currency in ("PEN", "USD") else "PEN"

    contents = await file.read()  # raw bytes of the uploaded CSV
    try:
        df = pd.read_csv(io.BytesIO(contents), dtype=str)  # dtype=str keeps values JSON-safe
        rows = []
        for _, r in df.iterrows():
            raw = r.to_dict()
            if source:
                raw["source_key"] = source
            rows.append(
                {
                    "user_id": user.id,
                    "date": str(r["date"]),
                    "description": str(r["description"]),
                    "amount": float(r["amount"]),
                    "currency": currency,
                    "raw": raw,
                }
            )
    except (KeyError, ValueError, pd.errors.ParserError, pd.errors.EmptyDataError) as exc:
        # A bad/empty CSV or a non-numeric amount shouldn't 500 — tell the user.
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="No pudimos leer el CSV. Verifica que tenga las columnas date, description y amount.",
        ) from exc

    if not rows:
        return {"imported": 0}

    user_client(user.token).table("transactions").insert(rows).execute()
    return {"imported": len(rows)}


class TransactionBody(BaseModel):
    date: str
    description: str
    amount: float
    category: str | None = None
    currency: str | None = None


class TransactionPatchBody(BaseModel):
    date: str | None = None
    description: str | None = None
    amount: float | None = None
    category: str | None = None
    currency: str | None = None


@app.post("/transactions")
def create_transaction(body: TransactionBody, user: CurrentUser = Depends(get_current_user)):
    """Add one transaction manually (negative amount = gasto, positive = ingreso).

    Currency is coerced to PEN unless USD is explicitly given, matching the import
    route, so a bad value can never write an invalid currency.
    """
    currency = body.currency if body.currency == "USD" else "PEN"
    res = (
        user_client(user.token)
        .table("transactions")
        .insert(
            {
                "user_id": user.id,
                "date": body.date,
                "description": body.description,
                "amount": body.amount,
                "category": body.category,
                "currency": currency,
                "raw": {"source": "manual"},
            }
        )
        .execute()
    )
    return {"transaction": res.data[0]}


@app.patch("/transactions/{txn_id}")
def update_transaction(
    txn_id: str,
    body: TransactionPatchBody,
    user: CurrentUser = Depends(get_current_user),
):
    """Update any of a transaction's editable fields. 404 if it doesn't exist."""
    updates = body.model_dump(exclude_unset=True)
    if "currency" in updates:
        updates["currency"] = updates["currency"] if updates["currency"] == "USD" else "PEN"
    if not updates:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No fields to update",
        )

    res = (
        user_client(user.token)
        .table("transactions")
        .update(updates)
        .eq("id", txn_id)
        .execute()
    )
    if not res.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Transaction not found",
        )
    return {"transaction": res.data[0]}


@app.delete("/transactions/{txn_id}")
def delete_transaction(txn_id: str, user: CurrentUser = Depends(get_current_user)):
    """Remove one transaction."""
    user_client(user.token).table("transactions").delete().eq("id", txn_id).execute()
    return {"deleted": True}


@app.get("/transactions")
def list_transactions(user: CurrentUser = Depends(get_current_user)):
    """Return the user's transactions, newest first (RLS scopes it to them).

    Each row gets a `source` key (a brand chip the frontend renders) computed
    from its description + raw; the bulky raw itself is dropped from the response.
    """
    res = (
        user_client(user.token)
        .table("transactions")
        .select("id, date, description, amount, category, currency, raw")
        .order("date", desc=True)
        .execute()
    )
    transactions = []
    for row in res.data or []:
        source = detect_source(row.get("description"), row.get("raw"))
        row.pop("raw", None)
        transactions.append({**row, "source": source})
    return {"transactions": transactions}


@app.post("/transactions/categorize")
async def categorize_transactions(user: CurrentUser = Depends(get_current_user)):
    """
    Label every still-uncategorized transaction via one Claude call.

    We pull only the rows where category IS NULL, ask the categorizer for a
    {id: category} map, then write each label back. Returns how many we set so
    the UI can report progress.
    """
    client = user_client(user.token)

    todo = (
        client.table("transactions")
        .select("id, description")
        .is_("category", "null")
        .execute()
    ).data or []

    if not todo:
        return {"categorized": 0}

    labels = await categorize(todo)
    for txn_id, category in labels.items():
        client.table("transactions").update({"category": category}).eq("id", txn_id).execute()

    return {"categorized": len(labels)}


@app.get("/insights")
async def get_insights(
    month: str | None = None,
    user: CurrentUser = Depends(get_current_user),
):
    """
    Monthly spending summary + AI narrative for `month` (default: latest month
    with data). 404s when the user has no transactions to analyze.
    """
    client = user_client(user.token)

    all_txns = (
        client.table("transactions")
        .select("date, amount, category, description")
        .order("date", desc=False)
        .execute()
    ).data or []

    if not all_txns:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No transactions to analyze",
        )

    target_month = month or latest_month_with_data(all_txns)
    if not target_month:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No transactions to analyze",
        )

    insight = await build_insight(all_txns, target_month)

    # Best-effort cache: persist the narrative + forecast for this (user, period).
    # Wrapped in try/except so a schema mismatch (e.g. a missing column) can never
    # break the response the frontend depends on.
    try:
        client.table("insights").upsert(
            {
                "user_id": user.id,
                "period": target_month,
                "summary": insight["narrative"],
                "forecast": insight["forecastNextMonth"],
            },
            on_conflict="user_id,period",
        ).execute()
    except Exception:
        pass

    return insight


@app.get("/subscriptions")
def get_subscriptions(user: CurrentUser = Depends(get_current_user)):
    """Detect recurring subscriptions from the user's transactions (pure Python).

    Computed on the fly from spend rows — no schema/table of its own. The detector
    groups by normalized description and flags monthly-cadence (or known-keyword)
    charges, returning {subscriptions, monthly_total}.
    """
    txns = (
        user_client(user.token)
        .table("transactions")
        .select("date, description, amount, category")
        .order("date", desc=False)
        .execute()
    ).data or []

    return detect_subscriptions(txns)


@app.get("/recap/weekly")
async def get_weekly_recap(user: CurrentUser = Depends(get_current_user)):
    """A short AI recap of the latest 7-day window in the user's transactions.

    The window/totals are pure Python; one Claude call writes the narrative (and
    tolerates failure). Returns {start, end, total, byCategory, narrative}.
    """
    txns = (
        user_client(user.token)
        .table("transactions")
        .select("date, description, amount, category")
        .order("date", desc=False)
        .execute()
    ).data or []

    return await weekly_recap(txns)


# ---------------------------------------------------------------------------
# Peru FX: USD/PEN exchange rates. Official from the BCRP free API; paralelo +
# bank scraped from cuantoestaeldolar.pe. The fx service caches and tolerates
# upstream failures (never 500s), so these routes just proxy it behind auth.
# ---------------------------------------------------------------------------


@app.get("/rates")
async def rates(user: CurrentUser = Depends(get_current_user)):
    """Current oficial / paralelo / banco USD-PEN rates (cached, stale-tolerant)."""
    return await get_rates()


@app.get("/rates/history")
async def rates_history(
    days: int = 30,
    user: CurrentUser = Depends(get_current_user),
):
    """Official USD-PEN series over the last `days` business days (for the chart)."""
    return await get_official_history(days)


# ---------------------------------------------------------------------------
# Phase 2: profile (display currency), AI chat, budgets, and savings goals.
# Same conventions as above — every route is auth-guarded and talks to the DB
# through user_client(user.token), so RLS scopes all reads/writes to the caller.
# ---------------------------------------------------------------------------


class ProfileBody(BaseModel):
    currency: str


class ChatBody(BaseModel):
    message: str
    history: list[dict] = []


class BudgetBody(BaseModel):
    category: str
    monthly_limit: float


class GoalBody(BaseModel):
    name: str
    target_amount: float
    target_date: str | None = None


class GoalPatchBody(BaseModel):
    name: str | None = None
    target_amount: float | None = None
    saved_amount: float | None = None
    target_date: str | None = None


class AfpBody(BaseModel):
    as_of: str
    balance: float
    fund_type: str | None = None
    contributed: float | None = None
    afp_name: str | None = None
    source: str | None = None


@app.get("/profile")
def get_profile(user: CurrentUser = Depends(get_current_user)):
    """Return the user's display currency, creating the row (default USD) if absent."""
    client = user_client(user.token)
    rows = client.table("profiles").select("currency").eq("user_id", user.id).execute().data or []
    if rows:
        return {"currency": rows[0]["currency"]}

    client.table("profiles").insert(
        {"user_id": user.id, "currency": DEFAULT_CURRENCY}
    ).execute()
    return {"currency": DEFAULT_CURRENCY}


@app.put("/profile")
def update_profile(body: ProfileBody, user: CurrentUser = Depends(get_current_user)):
    """Set the user's display currency (must be in SUPPORTED_CURRENCIES)."""
    if body.currency not in SUPPORTED_CURRENCIES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported currency: {body.currency}",
        )

    user_client(user.token).table("profiles").upsert(
        {"user_id": user.id, "currency": body.currency},
        on_conflict="user_id",
    ).execute()
    return {"currency": body.currency}


@app.post("/chat")
async def chat(body: ChatBody, user: CurrentUser = Depends(get_current_user)):
    """Conversational money assistant: a Claude tool-use loop over the user's data."""
    client = user_client(user.token)

    rows = client.table("profiles").select("currency").eq("user_id", user.id).execute().data or []
    currency = rows[0]["currency"] if rows else DEFAULT_CURRENCY

    return await build_chat_reply(client, currency, body.message, body.history)


@app.get("/budgets")
def get_budgets(user: CurrentUser = Depends(get_current_user)):
    """Per-category monthly limits with spend-so-far for the CURRENT calendar month."""
    client = user_client(user.token)

    budgets = (
        client.table("budgets").select("category, monthly_limit").execute().data or []
    )
    txns = (
        client.table("transactions").select("date, amount, category").execute().data or []
    )

    this_month = datetime.now().strftime("%Y-%m")
    spent = spend_by_category_for_month(txns, this_month)

    return {
        "budgets": [
            {
                "category": b["category"],
                "monthly_limit": float(b["monthly_limit"]),
                "spent": spent.get(b["category"], 0.0),
            }
            for b in budgets
        ]
    }


@app.put("/budgets")
def upsert_budget(body: BudgetBody, user: CurrentUser = Depends(get_current_user)):
    """Create or update the monthly limit for a category."""
    user_client(user.token).table("budgets").upsert(
        {"user_id": user.id, "category": body.category, "monthly_limit": body.monthly_limit},
        on_conflict="user_id,category",
    ).execute()
    return {"category": body.category, "monthly_limit": body.monthly_limit}


@app.delete("/budgets/{category}")
def delete_budget(category: str, user: CurrentUser = Depends(get_current_user)):
    """Remove the budget for one category."""
    user_client(user.token).table("budgets").delete().eq("category", category).execute()
    return {"deleted": True}


@app.post("/budgets/suggest")
async def suggest_budgets(user: CurrentUser = Depends(get_current_user)):
    """AI Budget Builder: average monthly spend per category, refined by Claude.

    The averages are deterministic Python; Claude only nudges them to friendlier
    round numbers. Any JSON trouble falls back to the raw computed averages so the
    caller always gets usable suggestions.
    """
    client = user_client(user.token)
    txns = (
        client.table("transactions").select("date, amount, category").execute().data or []
    )

    averages = average_monthly_spend_by_category(txns)
    if not averages:
        return {"suggestions": []}

    fallback = [
        {"category": c, "suggested_limit": round(a, 2)} for c, a in averages.items()
    ]

    try:
        anthropic = AsyncAnthropic(api_key=settings.anthropic_api_key)
        message = await anthropic.messages.create(
            model=INSIGHTS_MODEL,
            max_tokens=1024,
            system=(
                "You are a personal-budgeting assistant. Given a user's average monthly "
                "spend per category, suggest a sensible monthly budget limit for each — "
                "usually a clean round number at or slightly below the average to encourage "
                "saving. Keep every category from the input. Respond ONLY as JSON: "
                '{"suggestions": [{"category": str, "suggested_limit": number}, ...]}. '
                "No prose, no markdown."
            ),
            messages=[
                {
                    "role": "user",
                    "content": "Average monthly spend by category:\n\n"
                    + json.dumps(averages, ensure_ascii=False),
                }
            ],
        )
        text = "".join(block.text for block in message.content if block.type == "text").strip()
        if text.startswith("```"):
            text = text.split("\n", 1)[1] if "\n" in text else text
            if text.endswith("```"):
                text = text[: text.rfind("```")]
        parsed = json.loads(text.strip())
        suggestions = [
            {"category": str(s["category"]), "suggested_limit": float(s["suggested_limit"])}
            for s in parsed.get("suggestions", [])
            if s.get("category") and s.get("suggested_limit") is not None
        ]
        return {"suggestions": suggestions or fallback}
    except Exception:
        return {"suggestions": fallback}


@app.get("/goals")
def get_goals(user: CurrentUser = Depends(get_current_user)):
    """Return the user's savings goals."""
    res = (
        user_client(user.token)
        .table("goals")
        .select("id, name, target_amount, saved_amount, target_date")
        .order("created_at", desc=False)
        .execute()
    )
    return {"goals": res.data}


@app.post("/goals")
def create_goal(body: GoalBody, user: CurrentUser = Depends(get_current_user)):
    """Create a savings goal (saved_amount starts at 0 per the schema default)."""
    res = (
        user_client(user.token)
        .table("goals")
        .insert(
            {
                "user_id": user.id,
                "name": body.name,
                "target_amount": body.target_amount,
                "target_date": body.target_date,
            }
        )
        .execute()
    )
    return {"goal": res.data[0]}


@app.patch("/goals/{goal_id}")
def update_goal(
    goal_id: str,
    body: GoalPatchBody,
    user: CurrentUser = Depends(get_current_user),
):
    """Update any of a goal's fields (e.g. add to savings). 404 if it doesn't exist."""
    updates = body.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No fields to update",
        )

    res = (
        user_client(user.token)
        .table("goals")
        .update(updates)
        .eq("id", goal_id)
        .execute()
    )
    if not res.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Goal not found",
        )
    return {"goal": res.data[0]}


@app.delete("/goals/{goal_id}")
def delete_goal(goal_id: str, user: CurrentUser = Depends(get_current_user)):
    """Remove a savings goal."""
    user_client(user.token).table("goals").delete().eq("id", goal_id).execute()
    return {"deleted": True}


# ---------------------------------------------------------------------------
# Peru: Claude-vision capture. Yape/Plin receipt screenshots become PEN
# transactions (deduped by Yape/Plin operation id), and AFP (private-pension)
# paper statements become afp_records the user reviews before saving.
# ---------------------------------------------------------------------------

# Image content types the vision services accept; anything else falls back to PNG.
_SCAN_MEDIA_TYPES = {"image/png", "image/jpeg", "image/gif", "image/webp"}
_MAX_IMAGE_BYTES = 8 * 1024 * 1024  # 8 MB per uploaded image
_MAX_SCAN_FILES = 25                 # max receipts per /scan-receipts request


@app.post("/scan-receipts")
async def scan_receipts(
    files: list[UploadFile] = File(...),
    user: CurrentUser = Depends(get_current_user),
):
    """Scan one or more Yape/Plin receipt screenshots into PEN transactions.

    Each image is read by Claude vision (scan_receipt) into a {amount, direction,
    counterparty, ...} dict, turned into a transaction row (amount negative when
    money was sent), and deduped against the user's existing transactions by the
    Yape/Plin operation id so re-uploading the same screenshot can't double-count.
    """
    if len(files) > _MAX_SCAN_FILES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"Demasiados archivos (máximo {_MAX_SCAN_FILES} por carga).",
        )

    client = user_client(user.token)

    # Dedupe (best-effort): skip a scanned receipt already stored — by Yape/Plin
    # operation id when present, else by (date, amount, counterparty).
    existing = (
        client.table("transactions").select("id, date, amount, raw").execute().data or []
    )
    seen_ops = {
        (r.get("raw") or {}).get("operation_id")
        for r in existing
        if (r.get("raw") or {}).get("operation_id")
    }
    seen_keys = {
        (r.get("date"), round(float(r.get("amount") or 0), 2), (r.get("raw") or {}).get("counterparty"))
        for r in existing
    }

    rows: list[dict] = []
    items: list[dict] = []
    skipped = 0

    for file in files:
        if file.size and file.size > _MAX_IMAGE_BYTES:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail="Imagen demasiado grande (máximo 8 MB).",
            )
        contents = await file.read()
        media_type = file.content_type if file.content_type in _SCAN_MEDIA_TYPES else "image/png"

        receipt = await scan_receipt(contents, media_type)
        if not receipt or receipt.get("amount") is None:
            continue

        magnitude = abs(float(receipt["amount"]))
        amount = -magnitude if receipt.get("direction") == "enviado" else magnitude
        operation_id = receipt.get("operation_id")
        key = (receipt.get("date"), round(amount, 2), receipt.get("counterparty"))

        if (operation_id and operation_id in seen_ops) or (not operation_id and key in seen_keys):
            skipped += 1
            continue
        if operation_id:
            seen_ops.add(operation_id)  # also dedupe within this same batch
        seen_keys.add(key)

        rows.append(
            {
                "user_id": user.id,
                "date": receipt.get("date"),
                "description": receipt.get("counterparty") or receipt.get("description") or "Yape/Plin",
                "amount": amount,
                "category": None,
                "currency": "PEN",
                "raw": {
                    "source": "yape_plin_scan",
                    "operation_id": operation_id,
                    "wallet": receipt.get("wallet"),
                    "counterparty": receipt.get("counterparty"),
                    "direction": receipt.get("direction"),
                },
            }
        )
        items.append(
            {
                "amount": amount,
                "description": receipt.get("counterparty") or receipt.get("description") or "Yape/Plin",
                "date": receipt.get("date"),
                "wallet": receipt.get("wallet"),
            }
        )

    if rows:
        client.table("transactions").insert(rows).execute()

    return {"imported": len(rows), "skipped_duplicates": skipped, "items": items}


@app.post("/afp/scan")
async def afp_scan(
    file: UploadFile = File(...),
    user: CurrentUser = Depends(get_current_user),
):
    """Read one AFP estado-de-cuenta image into a draft record (NOT saved).

    Returns the extracted {as_of, balance, fund_type, contributed, afp_name} so
    the UI can review/correct it before POSTing to /afp.
    """
    if file.size and file.size > _MAX_IMAGE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="Imagen demasiado grande (máximo 8 MB).",
        )
    contents = await file.read()
    media_type = file.content_type if file.content_type in _SCAN_MEDIA_TYPES else "image/png"
    return await scan_afp(contents, media_type)


@app.get("/afp")
def get_afp(user: CurrentUser = Depends(get_current_user)):
    """Return the user's AFP records, oldest first (for the balance-over-time chart)."""
    res = (
        user_client(user.token)
        .table("afp_records")
        .select("id, as_of, balance, fund_type, contributed, afp_name, source")
        .order("as_of", desc=False)
        .execute()
    )
    return {"records": res.data}


@app.post("/afp")
def create_afp(body: AfpBody, user: CurrentUser = Depends(get_current_user)):
    """Save one AFP record (from the scan review form or manual entry)."""
    res = (
        user_client(user.token)
        .table("afp_records")
        .insert(
            {
                "user_id": user.id,
                "as_of": body.as_of,
                "balance": body.balance,
                "fund_type": body.fund_type,
                "contributed": body.contributed,
                "afp_name": body.afp_name,
                "source": body.source or "manual",
            }
        )
        .execute()
    )
    return {"record": res.data[0]}


@app.delete("/afp/{record_id}")
def delete_afp(record_id: str, user: CurrentUser = Depends(get_current_user)):
    """Remove one AFP record."""
    user_client(user.token).table("afp_records").delete().eq("id", record_id).execute()
    return {"deleted": True}
