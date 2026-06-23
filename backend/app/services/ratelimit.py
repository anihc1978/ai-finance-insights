"""
Lightweight in-memory rate limiting — no Redis, no extra deps.

A hand-rolled fixed-window counter keyed by the authenticated user id (falling
back to the client IP for unauthenticated callers). Two FastAPI dependencies are
exported:

  * ``general_rate_limit`` — a broad limit applied to every route.
  * ``ai_rate_limit``      — a stricter limit for the expensive endpoints that
                             each make a Claude call (/chat, /insights, etc.).

On exceed each raises HTTP 429 with a friendly Spanish message.

⚠️ This state lives in THIS process only: it resets on restart and is NOT shared
across replicas. That's fine for a single-instance public beta. When we scale to
multiple instances, move the counters to Redis (or a shared store) so the limit
is global rather than per-instance.
"""
import threading
import time

from fastapi import Depends, HTTPException, Request, status

from app.auth import CurrentUser, get_current_user
from app.config import settings

_TOO_MANY = "Demasiadas solicitudes, intenta de nuevo en un momento."

# bucket key -> (window_start_epoch, count_in_window). Guarded by _lock because
# Starlette can run sync dependencies on a threadpool.
_buckets: dict[str, tuple[float, int]] = {}
_lock = threading.Lock()


def _hit(key: str, limit: int) -> bool:
    """Record one request for `key`; return True if it's within `limit`.

    Fixed window of `settings.rate_limit_window_seconds`: the first request in a
    window starts the clock; the window resets once it elapses.
    """
    window = settings.rate_limit_window_seconds
    now = time.monotonic()
    with _lock:
        start, count = _buckets.get(key, (now, 0))
        if now - start >= window:
            start, count = now, 0  # window elapsed → reset
        count += 1
        _buckets[key] = (start, count)
        return count <= limit


def _caller_key(request: Request, user: CurrentUser | None) -> str:
    """Identity for the limit: the user id when authenticated, else the client IP."""
    if user is not None:
        return f"user:{user.id}"
    client = request.client
    return f"ip:{client.host if client else 'unknown'}"


def _check(request: Request, user: CurrentUser | None, limit: int, tier: str) -> None:
    if not settings.rate_limit_enabled:
        return
    key = f"{tier}:{_caller_key(request, user)}"
    if not _hit(key, limit):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=_TOO_MANY,
        )


def general_rate_limit(request: Request) -> None:
    """Broad per-caller limit. Unauthenticated-friendly: keys by IP when there's
    no usable Bearer token, so it can guard public/unauthed routes too."""
    user = None
    auth = request.headers.get("authorization", "")
    if auth.lower().startswith("bearer "):
        try:
            from app.auth import bearer_scheme  # local import avoids cycle at import time
            from fastapi.security import HTTPAuthorizationCredentials

            creds = HTTPAuthorizationCredentials(
                scheme="Bearer", credentials=auth.split(" ", 1)[1]
            )
            user = get_current_user(creds)
        except Exception:
            user = None  # bad/expired token → fall back to IP; the route's own auth 401s
    _check(request, user, settings.rate_limit_general, "general")


def ai_rate_limit(
    request: Request,
    user: CurrentUser = Depends(get_current_user),
) -> None:
    """Stricter limit for the expensive AI endpoints. Runs after get_current_user,
    so it's always keyed by the authenticated user id."""
    _check(request, user, settings.rate_limit_ai, "ai")


def _reset() -> None:
    """Clear all counters. For tests only."""
    with _lock:
        _buckets.clear()
