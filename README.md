# AI Finance Insights

**An AI-powered personal-finance app built for how Peruvians actually manage money** — soles (S/), Yape/Plin transfers, AFP pension tracking, and a live USD/PEN exchange rate — with a bilingual Claude assistant that answers in the user's own language.

🔗 **Live demo:** [ai-finance-insights.netlify.app](https://ai-finance-insights.netlify.app) &nbsp;·&nbsp; _(private beta — invite only)_

![Stack](https://img.shields.io/badge/FastAPI-Python%203.12-009688)
![Frontend](https://img.shields.io/badge/React%2018-TypeScript%20%2B%20Vite-3178c6)
![Data](https://img.shields.io/badge/Supabase-Postgres%20%2B%20RLS-3ecf8e)
![AI](https://img.shields.io/badge/Anthropic-Claude-d97757)
![Tests](https://img.shields.io/badge/backend%20tests-55%20passing-brightgreen)

---

## Why this exists

Most budgeting apps assume a US/EU financial life: dollars, credit cards, 401(k)s. That is not how money works in Peru, where daily spending runs through **Yape and Plin** mobile transfers, salaries are in **soles**, retirement savings sit in an **AFP**, and the **USD/PEN** rate matters to anyone saving or importing.

AI Finance Insights is a real, deployed product built solo to fit that reality — and to serve real beta testers across Peru and the US. It pairs a hardened FastAPI + Supabase backend with a Claude assistant that reads your transactions, explains your spending, and replies in Spanish or English depending on who's asking.

## Features

- **AI chat & insights** — ask about your money in plain language; Claude answers grounded in your actual transactions, with a narrative recap, flags, and highlights.
- **Auto-categorization + learned rules** — transactions are categorized automatically; correct one and the app **learns a rule** so it stays right next time.
- **Yape/Plin receipt scanning** — snap a transfer receipt and Claude vision extracts the amount, merchant, and date into a ready-to-save transaction.
- **Spend calendar** — a month-at-a-glance heat view of where the money went, day by day.
- **Budgets & goals** — set category budgets with live gauges and track savings goals.
- **AFP pension tracking** — surface pension contributions the way Peruvian users think about them.
- **Multi-currency (PEN / USD / EUR) + FX** — hold and view balances across currencies with an up-to-date exchange rate.
- **Bilingual ES/EN** — the UI and the AI both switch language; the assistant replies in whichever language the user is using.
- **Dark / light mode** and a **mobile-first** layout — it's built to live on a phone.

## Tech stack & architecture

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + TypeScript, Vite, deployed on Netlify |
| Backend | FastAPI (Python 3.12), Uvicorn, containerized and deployed on Render |
| Data & Auth | Supabase — Postgres, Auth, and Row-Level Security |
| AI | Anthropic Claude (chat, insights, and vision-based receipt scanning) |

**How auth and data isolation work (JWT → FastAPI → RLS):**

1. The user logs in on the React frontend via **Supabase Auth**, which issues a signed **JWT**.
2. The frontend sends that token on every API call (`Authorization: Bearer <jwt>`).
3. FastAPI verifies the token's signature against Supabase's published **JWKS public keys** (modern Supabase signs asymmetrically with ES256 — the backend never holds a signing secret).
4. The backend then talks to Postgres using a **Supabase client scoped to that user's JWT**, so **Row-Level Security enforces per-user data isolation at the database layer** — even a bug in the API code cannot leak another user's rows.

**AI is proxied server-side.** The Anthropic API key lives only in the backend environment — it never touches the browser. All Claude calls (chat, insights, vision) go through FastAPI, which also applies **per-user rate limiting** and a **CORS allowlist**.

## Engineering highlights

- **Row-Level Security** enforced in Postgres — data isolation guaranteed at the database, not just in application code.
- **Server-side key handling** — the Anthropic key is never exposed to the client; the browser only ever calls our own API.
- **Hardened API** — CORS origin allowlist plus in-memory per-user rate limiting (separate, stricter limits on AI endpoints).
- **i18n architecture** — a single `X-Lang` header drives language for the natural-language AI outputs, while category keys and amounts stay language-neutral.
- **55 backend tests** covering categorization, rules-learning, budgets, forecasting, FX, language switching, and API hardening.

## Local development

Two apps: a React frontend and a FastAPI backend, both talking to a Supabase project.

### 1. Supabase

Create a Supabase project and run the schema (creates tables + Row-Level Security policies):

```bash
# In the Supabase SQL editor, run:
supabase/schema.sql
```

### 2. Backend (FastAPI)

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt        # or: uv pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Copy `backend/.env.example` to `backend/.env` and fill in the values (names only — never commit real secrets):

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `ANTHROPIC_API_KEY`
- `ALLOWED_ORIGINS` (CORS allowlist — append your frontend origin in production)
- rate-limit settings (optional; sensible defaults)

### 3. Frontend (React + Vite)

```bash
cd frontend
npm install
npm run dev
```

Copy `frontend/.env.example` to `frontend/.env` and set:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_API_BASE` (e.g. `http://localhost:8000`)

> Deployment (Netlify frontend + Render backend + Supabase) is documented in [`DEPLOY.md`](./DEPLOY.md).

## Screenshots

> _Screenshots coming soon._

## License

© 2026 Eduardo. All rights reserved. Public for portfolio/demo purposes — not licensed for reuse.
