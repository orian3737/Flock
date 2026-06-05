from functools import wraps
import os

import jwt
from flask import current_app, jsonify, request


SUPABASE_JWT_SECRET = os.environ.get("SUPABASE_JWT_SECRET")


def verify_supabase_token(token):
    """Verify a Supabase JWT and return its decoded payload."""
    jwt_secret = current_app.config.get("SUPABASE_JWT_SECRET") or os.environ.get("SUPABASE_JWT_SECRET")
    if not jwt_secret:
        raise ValueError("SUPABASE_JWT_SECRET is not configured")

    try:
        return jwt.decode(
            token,
            jwt_secret,
            algorithms=["HS256"],
            options={"verify_aud": False},
        )
    except jwt.ExpiredSignatureError as exc:
        raise ValueError("Token expired") from exc
    except jwt.InvalidTokenError as exc:
        raise ValueError(f"Invalid token: {exc}") from exc


def require_auth(route_handler):
    """Validate the Supabase JWT and expose request.supabase_uid."""

    @wraps(route_handler)
    def decorated(*args, **kwargs):
        auth_header = request.headers.get("Authorization", "")
        if not auth_header.startswith("Bearer "):
            return jsonify({"error": "Authorization header required"}), 401

        token = auth_header.split(" ", 1)[1].strip()
        try:
            payload = verify_supabase_token(token)
        except ValueError as exc:
            return jsonify({"error": str(exc)}), 401

        request.supabase_uid = payload.get("sub")
        return route_handler(*args, **kwargs)

    return decorated
