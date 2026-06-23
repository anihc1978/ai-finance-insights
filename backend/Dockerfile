# AI Finance Insights — backend container.
# Deploys to any container host (Render, Railway, Fly, Cloud Run). The host
# injects a PORT env var; uvicorn binds to it. Secrets (ANTHROPIC_API_KEY,
# SUPABASE_URL, SUPABASE_ANON_KEY, ALLOWED_ORIGINS) are set in the host's
# dashboard — NEVER baked into this image.
FROM python:3.12-slim

# Faster, cleaner Python in containers.
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# Install deps first so layer caching kicks in when only app code changes.
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy the application package.
COPY app ./app

# Local default; the platform overrides PORT at runtime.
ENV PORT=8000
EXPOSE 8000

# Honor the platform-provided $PORT (shell form so the var expands).
CMD uvicorn app.main:app --host 0.0.0.0 --port $PORT
