from flask import Blueprint, jsonify, request
from flask_cors import CORS
from sqlalchemy.exc import IntegrityError

from app.extensions import db
from app.models import User
from app.utils.cors import allowed_origins
from app.utils.jwt_middleware import require_auth


users_bp = Blueprint("users", __name__, url_prefix="/api/users")
CORS(users_bp, origins=allowed_origins())


def _user_json(user):
    return {
        "id": user.id,
        "supabase_uid": user.supabase_uid,
        "email": user.email,
        "display_name": user.display_name,
        "farm_name": user.farm_name,
        "preferences": user.preferences or {},
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


@users_bp.put("/<int:user_id>")
@require_auth
def update_user(user_id):
    user = db.session.get(User, user_id)
    if not user:
        return jsonify({"message": "User not found."}), 404

    data = request.get_json(silent=True) or {}
    if "farm_name" in data:
        farm_name = (data.get("farm_name") or "").strip()
        if not farm_name:
            return jsonify({"message": "Farm name cannot be blank."}), 400
        user.farm_name = farm_name

    if "display_name" in data:
        user.display_name = (data.get("display_name") or "").strip() or None

    db.session.commit()
    return jsonify(_user_json(user)), 200


@users_bp.put("/<int:user_id>/preferences")
@require_auth
def update_preferences(user_id):
    user = db.session.get(User, user_id)
    if not user:
        return jsonify({"message": "User not found."}), 404

    data = request.get_json(silent=True) or {}
    current_preferences = user.preferences or {}
    current_preferences.update(data)
    user.preferences = current_preferences
    db.session.commit()
    return jsonify(_user_json(user)), 200
