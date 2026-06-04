from flask import Blueprint, jsonify, request
from flask_cors import CORS
from sqlalchemy.exc import IntegrityError

from app.extensions import db
from app.models import User


users_bp = Blueprint("users", __name__, url_prefix="/api/users")
CORS(users_bp, origins=["http://localhost:5173"])


def _user_json(user):
    return {
        "id": user.id,
        "supabase_uid": user.supabase_uid,
        "email": user.email,
        "farm_name": user.farm_name,
        "created_at": user.created_at.isoformat() if user.created_at else None,
    }


@users_bp.post("")
def create_user():
    data = request.get_json(silent=True) or {}
    supabase_uid = (data.get("supabase_uid") or "").strip()
    email = (data.get("email") or "").strip()
    farm_name = (data.get("farm_name") or "").strip()

    missing = [
        field
        for field, value in {
            "supabase_uid": supabase_uid,
            "email": email,
            "farm_name": farm_name,
        }.items()
        if not value
    ]
    if missing:
        return jsonify({"message": f"Missing required field(s): {', '.join(missing)}"}), 400

    existing = User.query.filter_by(supabase_uid=supabase_uid).first()
    if existing:
        return jsonify(_user_json(existing)), 200

    user = User(supabase_uid=supabase_uid, email=email, farm_name=farm_name)
    db.session.add(user)

    try:
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        existing = User.query.filter_by(supabase_uid=supabase_uid).first()
        if existing:
            return jsonify(_user_json(existing)), 200
        return jsonify({"message": "A user with this email already exists."}), 409

    return jsonify(_user_json(user)), 201


@users_bp.get("/by-uid/<supabase_uid>")
def get_user_by_uid(supabase_uid):
    user = User.query.filter_by(supabase_uid=supabase_uid).first()
    if not user:
        return jsonify({"message": "User not found."}), 404
    return jsonify(_user_json(user)), 200
