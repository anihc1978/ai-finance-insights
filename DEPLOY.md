# DEPLOY.md — AI Finance Insights (beta)

A precise, ordered runbook to take this app from source to a working beta you can
share with 3–5 testers. Follow the steps **in order** — later steps depend on
URLs you obtain in earlier ones.

## Architecture (what goes where)

| Piece | Hosts on | What it is |
|-------|----------|------------|
| **Database + Auth** | Supabase (already cloud) | Postgres with row-level security + email login |
| **Backend API** | Render or Railway (always-on) | FastAPI app, `uvicorn app.main:app` |
| **Frontend** | Netlify or Vercel (static) | Vite/React build → `dist/` |

## Who provides the secrets

**You (the operator) provide and paste every key yourself.** This document
never contains real keys, and Claude/the assistant never enters, tests, or
transmits them. The three secrets you will set are:

- `ANTHROPIC_API_KEY` — from the Anthropic Console (server-side only).
- `SUPABASE_URL` and `SUPABASE_ANON_KEY` — from your Supabase project
  (Project Settings → API). The anon key is publishable; row-level security is
  what protects each user's data.

> **Exact env var names matter.** The names below are read directly by the code
> (`backend/app/config.py`, `frontend/src/lib/supabase.ts`, `frontend/src/lib/api.ts`).
> Type them exactly — a typo means the app fails to start or can't reach the API.

---

## Step 0 — One-time: run the database schema

1. Open your Supabase project → **SQL Editor** → **New query**.
2. Open `supabase/schema.sql` from this repo, copy its **entire** contents, paste
   into the editor, and click **Run**.
3. Confirm it succeeds with no errors. This creates all tables **including the
   `category_rules` table** (the learned merchant → category auto-categorization
   rules) and enables row-level security on every table.

> Re-running is safe: the schema uses `create table if not exists` and
> `drop policy if exists` so it is idempotent.

---

## Step 1 — Set an Anthropic spend cap (do this BEFORE deploying)

1. Go to the **Anthropic Console** → **Billing / Limits**.
2. Set a **monthly spend cap** (e.g. a small amount for a beta — you can raise it
   later). This is your safety net against runaway cost.
3. Create / copy the **API key** you will use as `ANTHROPIC_API_KEY`. Keep it in
   your password manager — you'll paste it into the backend host in Step 2, never
   into a file in this repo.

---

## Step 2 — Deploy the BACKEND (Render or Railway)

The backend ships with `backend/Dockerfile` (honours the platform's `$PORT`),
`backend/Procfile`, and a root `render.yaml` Blueprint.

### Option A — Render (Blueprint)

1. Push this repo to GitHub (or connect the existing repo) at **render.com**.
2. **New → Blueprint**, point it at the repo. Render reads `render.yaml`.
3. When prompted, fill in the environment variables (they are declared
   `sync: false`, so Render asks you for each value):
   - `ANTHROPIC_API_KEY` = your Anthropic key (Step 1)
   - `SUPABASE_URL` = your Supabase project URL
   - `SUPABASE_ANON_KEY` = your Supabase anon (publishable) key
   - `ALLOWED_ORIGINS` = leave as the local-dev default for now
     (`http://localhost:5173,http://localhost:3000,http://127.0.0.1:5173`).
     You will set the real frontend origin in **Step 4**.
4. Deploy. When it's live, **copy the backend URL**, e.g.
   `https://ai-finance-insights.onrender.com`. You need it in Step 3.

### Option B — Render/Railway (manual, from the Dockerfile)

1. Create a new **Web Service** and point it at the `backend/` directory using
   **Docker** as the environment (it builds `backend/Dockerfile`).
   - Railway: it auto-detects the Dockerfile (or uses `backend/Procfile`).
   - The container runs `uvicorn app.main:app --host 0.0.0.0 --port $PORT`, so the
     host's injected `$PORT` is honoured automatically — do not hardcode a port.
2. Add the same four env vars as in Option A:
   `ANTHROPIC_API_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `ALLOWED_ORIGINS`.
3. Deploy and **copy the backend URL**.

> Quick check: opening the backend URL's health/docs route (e.g. `/docs`) in a
> browser should load. If the service crashes at boot, a required env var
> (`SUPABASE_URL` / `SUPABASE_ANON_KEY`) is missing — config validation fails
> fast on purpose.

---

## Step 3 — Deploy the FRONTEND (Netlify or Vercel)

The frontend ships with `frontend/netlify.toml` (build + SPA redirect). The build
command is `npm run build` and the publish directory is `dist`.

### Netlify

1. At **app.netlify.com → Add new site → Import an existing project**, pick this
   repo and set the **base directory** to `frontend`. `netlify.toml` supplies the
   build command (`npm run build`), publish dir (`dist`), and the SPA redirect.
2. Under **Site settings → Environment variables**, add:
   - `VITE_API_BASE` = the backend URL from Step 2 (e.g.
     `https://ai-finance-insights.onrender.com`) — **no trailing slash**.
   - `VITE_SUPABASE_URL` = your Supabase project URL
   - `VITE_SUPABASE_ANON_KEY` = your Supabase anon key
3. Trigger a deploy. **Copy the frontend URL**, e.g.
   `https://ai-finance-insights.netlify.app`.

### Vercel (alternative)

Vercel auto-detects Vite. Set the **Root Directory** to `frontend`, then add the
same three env vars (`VITE_API_BASE`, `VITE_SUPABASE_URL`,
`VITE_SUPABASE_ANON_KEY`). Build = `npm run build`, output = `dist`.

> **Why these names:** the React app reads `import.meta.env.VITE_API_BASE`
> (`src/lib/api.ts`) and `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`
> (`src/lib/supabase.ts`). Vite only exposes variables prefixed `VITE_`, and they
> are baked in **at build time** — so changing one requires a **rebuild/redeploy**,
> not just a restart.

---

## Step 4 — Point the backend's CORS at the frontend, then redeploy

The backend only accepts requests from origins in its allowlist (it never uses
`*`). Until you do this, the deployed frontend's API calls will be blocked by CORS.

1. Go back to your backend host (Render/Railway) → **Environment**.
2. Set `ALLOWED_ORIGINS` to include your **frontend URL** from Step 3, plus local
   dev for convenience, comma-separated and **no trailing slashes**:
   ```
   ALLOWED_ORIGINS=https://ai-finance-insights.netlify.app,http://localhost:5173
   ```
3. **Redeploy / restart** the backend so the new value takes effect.

> Match the origin exactly — scheme + host, no path, no trailing slash
> (`https://your-app.netlify.app`, not `https://your-app.netlify.app/`).

---

## Step 5 — Configure Supabase Auth

1. Supabase → **Authentication → Providers → Email**: ensure **Email signup is
   enabled**. (For a small private beta you can leave email confirmation on or
   off — off is faster to test, on is more realistic.)
2. Supabase → **Authentication → URL Configuration**:
   - **Site URL** = your frontend URL (e.g.
     `https://ai-finance-insights.netlify.app`).
   - **Redirect URLs** = add the same frontend URL. This ensures magic-link /
     confirmation emails return testers to the live app, not localhost.

---

## Step 6 — Test end-to-end on a PHONE with a fresh account

Use a real phone (this is a beta for real people on mobile):

1. Open the **frontend URL** in your phone browser.
2. **Sign up** with a brand-new email and confirm (if confirmation is on).
3. **Scan a Yape/Plin receipt** (or import a sample CSV) and confirm the
   transaction is saved and **auto-categorized**.
4. Open the **chat / insights** and ask a question — confirm you get an AI answer
   (this exercises `ANTHROPIC_API_KEY` end-to-end).
5. If anything fails:
   - **CORS / network error** → re-check Step 4 (`ALLOWED_ORIGINS` exactly matches
     the frontend origin) and that the backend redeployed.
   - **Can't log in / email link goes to localhost** → re-check Step 5 (Site URL /
     Redirect URLs).
   - **AI calls fail** → re-check `ANTHROPIC_API_KEY` on the backend and that your
     spend cap isn't exhausted.

---

## Step 7 — Invite 3–5 trusted testers

Share the frontend URL with 3–5 people you trust. Ask each to sign up with their
own email, add or scan a few transactions, and try the chat. Each user's data is
isolated by Supabase row-level security. Watch your Anthropic spend and Render/
Railway logs during the first days.

---

## Environment variables — single source of truth

These names are read by the code; set them with **placeholder-free real values**
in the host dashboards (never commit real keys).

### Backend (Render/Railway) — see `backend/.env.example`

| Variable | Provided by | Notes |
|----------|-------------|-------|
| `ANTHROPIC_API_KEY` | You (Anthropic Console) | Server-side secret. Set a spend cap. |
| `SUPABASE_URL` | You (Supabase) | Project URL. Required — boot fails without it. |
| `SUPABASE_ANON_KEY` | You (Supabase) | Anon/publishable key. Required. |
| `ALLOWED_ORIGINS` | You | Comma-separated origin allowlist (your frontend URL + local dev). |

> Optional backend vars (`SUPABASE_JWT_SECRET`, `RATE_LIMIT_*`) have safe defaults
> — leave them unset for a normal beta.

### Frontend (Netlify/Vercel) — see `frontend/.env.example`

| Variable | Provided by | Notes |
|----------|-------------|-------|
| `VITE_API_BASE` | You | The backend URL from Step 2. No trailing slash. |
| `VITE_SUPABASE_URL` | You (Supabase) | Same project URL as the backend. |
| `VITE_SUPABASE_ANON_KEY` | You (Supabase) | Same anon key as the backend. |

> `VITE_*` vars are baked in at build time — change one ⇒ redeploy the frontend.
