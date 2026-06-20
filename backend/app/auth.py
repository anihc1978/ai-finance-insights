"""
Auth: verify the Supabase-issued JWT on every protected request.

THE FLOW (worth understanding — this is the architecture the role asks about):
  1. User logs in on the React frontend via Supabase Auth.
  2. Supabase returns a JWT (a signed token proving who they are).
  3. The frontend sends that token on every API call:  Authorization: Bearer <jwt>
  4. THIS module verifies the token's signature.

Modern Supabase signs tokens ASYMMETRICALLY (ES256): it signs with a PRIVATE
key it never shares, and publishes the matching PUBLIC key as a JWKS at
{SUPABASE_URL}/auth/v1/.well-known/jwks.json. We verify with that public key —
no shared secret needed. PyJWKClient fetches + caches the public keys and picks
the right one by the token's `kid` header.

(The older approach used a single shared HS256 secret — simpler, but Supabase
now defaults to asymmetric signing for new projects, which is more secure: the
backend never needs to hold a signing secret.)
"""
from dataclasses import dataclass

import jwt  # PyJWT
from jwt import PyJWKClient
from jwt.exceptions import PyJWKClientError
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from app.config import settings

# Extracts the "Authorization: Bearer <token>" header for us.
bearer_scheme = HTTPBearer(auto_error=True)

# Supabase publishes its public signing keys here; PyJWKClient fetches + caches them.
_jwks_client = PyJWKClient(f"{settings.supabase_url}/auth/v1/.well-known/jwks.json")


@dataclass
class CurrentUser:
    id: str
    email: str | None
    token: str   # the raw JWT — used to build a user-scoped Supabase client (RLS)


def get_current_user(
    creds: HTTPAuthorizationCredentials = Depends(bearer_scheme),
) -> CurrentUser:
    """
    FastAPI dependency. Put it on any route via Depends() to require auth.
    Returns a CurrentUser on success; raises 401 on any failure.
    """
    token = creds.credentials
    try:
        # Pick the right public key (matched by the token's `kid`), then verify.
        signing_key = _jwks_client.get_signing_key_from_jwt(token)
        payload = jwt.decode(
            token,
            signing_key.key,
            algorithms=["ES256"],
            audience="authenticated",   # Supabase sets this aud claim
        )
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token expired",
        )
    except (jwt.InvalidTokenError, PyJWKClientError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token",
        )

    user_id = payload.get("sub")  # Supabase puts the user's id in "sub"
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token missing subject",
        )

    return CurrentUser(id=user_id, email=payload.get("email"), token=token)
