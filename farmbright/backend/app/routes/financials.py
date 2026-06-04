from datetime import date

from flask import Blueprint, jsonify, request
from flask_cors import CORS

from app.extensions import db
from app.models import AnimalClass, Flock, Revenue, User
from app.services.financial_service import (
    current_month_range,
    get_farm_summary,
    get_flock_pl,
    get_user_flock_pl,
)


financials_bp = Blueprint("financials", __name__, url_prefix="/api/financials")
CORS(financials_bp, origins=["http://localhost:5173"])


@financials_bp.get("/summary/<int:user_id>")
def summary(user_id):
    if not db.session.get(User, user_id):
        return jsonify({"message": "User not found."}), 404
    start_date, end_date = _request_dates()
    return jsonify(get_farm_summary(user_id, start_date, end_date))


@financials_bp.get("/flocks/<int:user_id>")
def flock_summaries(user_id):
    if not db.session.get(User, user_id):
        return jsonify({"message": "User not found."}), 404
    start_date, end_date = _request_dates()
    return jsonify(get_user_flock_pl(user_id, start_date, end_date))


@financials_bp.get("/flock/<int:flock_id>")
def flock_detail(flock_id):
    start_date, end_date = _request_dates()
    data = get_flock_pl(flock_id, start_date, end_date)
    if not data:
        return jsonify({"message": "Flock not found."}), 404
    return jsonify(data)


@financials_bp.post("/revenue")
def create_revenue():
    data = request.get_json(silent=True) or {}
    required_error = _required(data, ["user_id", "date", "amount", "source"])
    if required_error:
        return required_error

    user = db.session.get(User, data["user_id"])
    if not user:
        return jsonify({"message": "User not found."}), 404

    flock_id = data.get("flock_id")
    if flock_id:
        flock = db.session.get(Flock, flock_id)
        if not flock or not _flock_belongs_to_user(flock, user.id):
            return jsonify({"message": "Flock not found for this user."}), 404

    revenue = Revenue(
        user_id=user.id,
        flock_id=flock_id,
        date=_parse_date(data["date"]) or date.today(),
        amount=float(data["amount"]),
        source=data["source"],
        notes=data.get("notes"),
    )
    db.session.add(revenue)
    db.session.commit()
    return jsonify(_revenue_json(revenue)), 201


@financials_bp.get("/revenue/<int:user_id>")
def revenue_history(user_id):
    if not db.session.get(User, user_id):
        return jsonify({"message": "User not found."}), 404
    start_date, end_date = _request_dates()
    revenues = (
        Revenue.query.filter(Revenue.user_id == user_id, Revenue.date >= start_date, Revenue.date <= end_date)
        .order_by(Revenue.date.desc(), Revenue.id.desc())
        .all()
    )
    return jsonify([_revenue_json(revenue) for revenue in revenues])


def _request_dates():
    default_start, default_end = current_month_range()
    return (
        _parse_date(request.args.get("start_date")) or default_start,
        _parse_date(request.args.get("end_date")) or default_end,
    )


def _parse_date(value):
    if not value:
        return None
    try:
        return date.fromisoformat(value)
    except ValueError:
        return None


def _required(data, fields):
    missing = [field for field in fields if data.get(field) in (None, "")]
    if missing:
        return jsonify({"message": f"Missing required field(s): {', '.join(missing)}"}), 400
    return None


def _flock_belongs_to_user(flock, user_id):
    return flock.breed and flock.breed.animal_class and flock.breed.animal_class.user_id == user_id


def _revenue_json(revenue):
    return {
        "id": revenue.id,
        "user_id": revenue.user_id,
        "flock_id": revenue.flock_id,
        "flock_name": revenue.flock.name if revenue.flock else None,
        "date": revenue.date.isoformat(),
        "amount": round(revenue.amount, 2),
        "source": revenue.source,
        "notes": revenue.notes,
    }
