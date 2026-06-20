"""
AI Finance Insights — FastAPI entrypoint.

Run locally:  uvicorn app.main:app --reload --port 8000
"""
import io

import pandas as pd
from fastapi import FastAPI, Depends, UploadFile, File, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware

from app.auth import get_current_user, CurrentUser
from app.config import settings
from app.db import user_client
from app.services.aggregate import latest_month_with_data
from app.services.categorizer import categorize
from app.services.insights import build_insight

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
    user: CurrentUser = Depends(get_current_user),
):
    """Receive a CSV, parse it, and store each row as one of the user's transactions."""
    contents = await file.read()                       # raw bytes of the uploaded CSV
    df = pd.read_csv(io.BytesIO(contents), dtype=str)  # parse; dtype=str keeps values JSON-safe

    rows = [
        {
            "user_id": user.id,
            "date": str(r["date"]),
            "description": str(r["description"]),
            "amount": float(r["amount"]),
            "raw": r.to_dict(),
        }
        for _, r in df.iterrows()
    ]

    user_client(user.token).table("transactions").insert(rows).execute()
    return {"imported": len(rows)}


@app.get("/transactions")
def list_transactions(user: CurrentUser = Depends(get_current_user)):
    """Return the user's transactions, newest first (RLS scopes it to them)."""
    res = (
        user_client(user.token)
        .table("transactions")
        .select("id, date, description, amount, category")
        .order("date", desc=True)
        .execute()
    )
    return {"transactions": res.data}


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
