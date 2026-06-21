"""Conversational money assistant — a Claude tool-use loop over the user's data.

WHY tool-use (and not just stuffing every transaction into the prompt): the
model should answer ONLY from this user's real figures, but we don't want to
ship the whole ledger on every turn. Instead we give Claude three read-only
tools that query the passed RLS-scoped Supabase client, and let it pull exactly
the slice it needs (a month summary, a filtered transaction list, the list of
months that have data). The numbers it cites therefore come from the database,
not from the model's imagination.

The tools reuse `aggregate.aggregate` so a chat "summary" matches the numbers
the dashboard shows. Everything here runs as the logged-in user because the
caller hands us a client already scoped by their JWT (RLS).
"""

import json

from anthropic import AsyncAnthropic

from app.config import CURRENCY_SYMBOLS, INSIGHTS_MODEL, settings
from app.services.aggregate import aggregate, latest_month_with_data

# Hard cap on the agentic loop so a misbehaving model can't spin forever.
_MAX_ROUNDS = 5

_TOOLS = [
    {
        "name": "get_spending_summary",
        "description": (
            "Get this user's spending summary for one month: total spend, total "
            "income, and spend broken down by category. Use this for questions "
            "about totals or where money went in a month. Omit `month` to use the "
            "latest month that has data."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "month": {
                    "type": "string",
                    "description": "Month as 'YYYY-MM'. Optional; defaults to the latest month with data.",
                }
            },
        },
    },
    {
        "name": "list_transactions",
        "description": (
            "List this user's individual transactions, newest first. Use this to "
            "answer questions about specific purchases or to inspect a category. "
            "All filters are optional and combine (AND)."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "month": {
                    "type": "string",
                    "description": "Only transactions in this 'YYYY-MM' month.",
                },
                "category": {
                    "type": "string",
                    "description": "Only transactions with this exact category.",
                },
                "search": {
                    "type": "string",
                    "description": "Only transactions whose description contains this text (case-insensitive).",
                },
                "limit": {
                    "type": "integer",
                    "description": "Max rows to return (default 20).",
                },
            },
        },
    },
    {
        "name": "get_months_available",
        "description": (
            "List the months (as 'YYYY-MM') that have any transaction data, oldest "
            "first. Use this when the user asks what periods exist or before "
            "picking a month to summarize."
        ),
        "input_schema": {"type": "object", "properties": {}},
    },
]


def _system_prompt(currency: str) -> str:
    """Persona: answer ONLY from tool data; format money in the user's currency."""
    symbol = CURRENCY_SYMBOLS.get(currency, "$")
    return (
        "You are a friendly, concise personal-finance assistant. You help one user "
        "understand their own spending. Answer ONLY using the data returned by your "
        "tools — never invent transactions, totals, or trends. If the tools show no "
        "relevant data, say so plainly and suggest what the user could ask instead. "
        f"Format every money amount with the '{symbol}' symbol (the user's currency "
        f"is {currency}). Keep replies short and specific, citing real category "
        "names and amounts. Do NOT give investment advice."
    )


def _all_transactions(client) -> list[dict]:
    """Pull this user's transactions (RLS-scoped) for the aggregation helpers."""
    return (
        client.table("transactions")
        .select("date, amount, category, description")
        .order("date", desc=False)
        .execute()
    ).data or []


def _tool_get_spending_summary(client, month: str | None) -> dict:
    """Reuse aggregate.aggregate so chat numbers match the dashboard's."""
    txns = _all_transactions(client)
    if not txns:
        return {"month": month, "message": "No transactions on record."}
    target = month or latest_month_with_data(txns)
    if not target:
        return {"month": month, "message": "No transactions on record."}
    agg = aggregate(txns, target)
    return {
        "month": target,
        "totalSpend": agg["totalSpend"],
        "totalIncome": agg["totalIncome"],
        "byCategory": agg["byCategory"],
    }


def _tool_list_transactions(
    client,
    month: str | None,
    category: str | None,
    search: str | None,
    limit: int | None,
) -> dict:
    """Filtered transaction list, newest first. Month filter is a 'YYYY-MM' prefix."""
    capped = max(1, min(int(limit) if limit else 20, 100))
    query = (
        client.table("transactions")
        .select("date, description, amount, category")
        .order("date", desc=True)
    )
    if category:
        query = query.eq("category", category)
    if search:
        query = query.ilike("description", f"%{search}%")
    if month:
        # 'date' is 'YYYY-MM-DD'; a [month-01, month-31] range keeps it index-friendly.
        query = query.gte("date", f"{month}-01").lte("date", f"{month}-31")
    rows = (query.limit(capped).execute()).data or []
    return {"count": len(rows), "transactions": rows}


def _tool_get_months_available(client) -> dict:
    """Distinct 'YYYY-MM' months that have data, oldest first."""
    txns = _all_transactions(client)
    months = sorted({str(t["date"])[:7] for t in txns})
    return {"months": months}


def _run_tool(client, name: str, args: dict) -> dict:
    """Dispatch a tool call to its handler; unknown tools degrade to an error dict."""
    if name == "get_spending_summary":
        return _tool_get_spending_summary(client, args.get("month"))
    if name == "list_transactions":
        return _tool_list_transactions(
            client,
            args.get("month"),
            args.get("category"),
            args.get("search"),
            args.get("limit"),
        )
    if name == "get_months_available":
        return _tool_get_months_available(client)
    return {"error": f"Unknown tool: {name}"}


async def build_chat_reply(client, currency: str, message: str, history: list) -> dict:
    """Run the Claude tool-use loop for one chat turn and return {reply: str}.

    `client` is an RLS-scoped Supabase client (queries hit only this user's rows).
    `history` is the prior conversation as [{role: user|assistant, content: str}].
    """
    anthropic = AsyncAnthropic(api_key=settings.anthropic_api_key)
    system = _system_prompt(currency)

    # Start from the prior turns, then append this message. As the loop runs we
    # append the model's tool_use turns and our tool_result turns in between.
    messages: list = [
        {"role": m["role"], "content": m["content"]}
        for m in history
        if m.get("role") in ("user", "assistant") and m.get("content")
    ]
    messages.append({"role": "user", "content": message})

    for _ in range(_MAX_ROUNDS):
        response = await anthropic.messages.create(
            model=INSIGHTS_MODEL,
            max_tokens=1024,
            system=system,
            tools=_TOOLS,
            messages=messages,
        )

        if response.stop_reason != "tool_use":
            text = "".join(b.text for b in response.content if b.type == "text").strip()
            return {"reply": text}

        # Answer each tool call. Only echo the assistant turn + tool_results when
        # there's at least one tool_use block — a degenerate "tool_use" stop_reason
        # with no tool_use blocks would otherwise send an empty content array, which
        # the API rejects. In that case, fall through to a final plain-text answer.
        tool_results = []
        for block in response.content:
            if block.type != "tool_use":
                continue
            result = _run_tool(client, block.name, block.input or {})
            tool_results.append(
                {
                    "type": "tool_result",
                    "tool_use_id": block.id,
                    "content": json.dumps(result, ensure_ascii=False),
                }
            )
        if not tool_results:
            break
        messages.append({"role": "assistant", "content": response.content})
        messages.append({"role": "user", "content": tool_results})

    # Hit the round cap without a final answer — ask once more for plain text.
    final = await anthropic.messages.create(
        model=INSIGHTS_MODEL,
        max_tokens=1024,
        system=system,
        messages=messages,
    )
    text = "".join(b.text for b in final.content if b.type == "text").strip()
    return {"reply": text or "Sorry, I couldn't work that out from your data."}
