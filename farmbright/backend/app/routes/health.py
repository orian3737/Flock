from flask import Blueprint, jsonify
from flask_cors import CORS
from sqlalchemy import text

from app.extensions import db
from app.services.scale_service import detect_scale
from app.utils.cors import allowed_origins


health_bp = Blueprint("health", __name__)
CORS(health_bp, origins=allowed_origins())


@health_bp.get("/health")
def health():
    db_status = "connected"

    try:
        db.session.execute(text("SELECT 1"))
    except Exception:
        db_status = "not_connected"

    return jsonify(
        {
            "status": "ok",
            "db": db_status,
            "scale": "detected" if detect_scale() else "not_detected",
            "version": "1.0.0",
        }
    )
