from datetime import date, timedelta

from flask import Blueprint, jsonify, request
from flask_cors import CORS
from sqlalchemy import func

from app.extensions import db
from app.models import AnimalClass, CasualtyLog, FeedingEvent, Flock, ProductionLog, User
from app.utils.jwt_middleware import require_auth


flocks_bp = Blueprint("flocks", __name__, url_prefix="/api/flocks")
CORS(flocks_bp, origins=["http://localhost:5173"])


@flocks_bp.get("/<int:user_id>")
def list_flocks(user_id):
    if not db.session.get(User, user_id):
        return jsonify({"message": "User not found."}), 404

    flocks = _user_flocks(user_id)
    return jsonify([_flock_list_json(flock) for flock in flocks])


@flocks_bp.get("/<int:flock_id>/detail")
def flock_detail(flock_id):
    flock = db.session.get(Flock, flock_id)
    if not flock:
        return jsonify({"message": "Flock not found."}), 404

    today = date.today()
    start_30 = today - timedelta(days=29)
    start_14 = today - timedelta(days=13)

    recent_feedings = (
        FeedingEvent.query.filter(FeedingEvent.flock_id == flock.id, FeedingEvent.date >= start_14)
        .order_by(FeedingEvent.date.desc(), FeedingEvent.timestamp.desc())
        .all()
    )
    recent_production = (
        ProductionLog.query.filter(ProductionLog.flock_id == flock.id, ProductionLog.date >= start_14)
        .order_by(ProductionLog.date.desc(), ProductionLog.id.desc())
        .all()
    )
    casualty_history = (
        CasualtyLog.query.filter_by(flock_id=flock.id)
        .order_by(CasualtyLog.date.desc(), CasualtyLog.id.desc())
        .all()
    )

    return jsonify(
        {
            "flock": _flock_base_json(flock),
            "assigned_feeds": [
                _assigned_feed_json(assignment)
                for assignment in flock.feed_assignments
                if assignment.feed_type
            ],
            "stats": _flock_stats_json(flock, start_30, today),
            "recent_feedings": [_feeding_json(event) for event in recent_feedings],
            "recent_production": [_production_json(log) for log in recent_production],
            "casualty_history": [_casualty_json(log) for log in casualty_history],
            "headcount_timeline": _headcount_timeline(flock),
        }
    )


@flocks_bp.get("/<int:flock_id>/feeding-history")
def feeding_history(flock_id):
    if not db.session.get(Flock, flock_id):
        return jsonify({"message": "Flock not found."}), 404

    start_date = _parse_date(request.args.get("start_date"))
    end_date = _parse_date(request.args.get("end_date"))
    page = max(int(request.args.get("page", 1)), 1)
    per_page = min(max(int(request.args.get("per_page", 50)), 1), 100)

    query = FeedingEvent.query.filter_by(flock_id=flock_id)
    if start_date:
        query = query.filter(FeedingEvent.date >= start_date)
    if end_date:
        query = query.filter(FeedingEvent.date <= end_date)

    pagination = query.order_by(FeedingEvent.date.desc(), FeedingEvent.timestamp.desc()).paginate(
        page=page,
        per_page=per_page,
        error_out=False,
    )
    return jsonify(_paginated_json(pagination, _feeding_json))


@flocks_bp.get("/<int:flock_id>/production-history")
def production_history(flock_id):
    if not db.session.get(Flock, flock_id):
        return jsonify({"message": "Flock not found."}), 404

    start_date = _parse_date(request.args.get("start_date"))
    end_date = _parse_date(request.args.get("end_date"))
    page = max(int(request.args.get("page", 1)), 1)
    per_page = min(max(int(request.args.get("per_page", 50)), 1), 100)

    query = ProductionLog.query.filter_by(flock_id=flock_id)
    if start_date:
        query = query.filter(ProductionLog.date >= start_date)
    if end_date:
        query = query.filter(ProductionLog.date <= end_date)

    pagination = query.order_by(ProductionLog.date.desc(), ProductionLog.id.desc()).paginate(
        page=page,
        per_page=per_page,
        error_out=False,
    )
    return jsonify(_paginated_json(pagination, _production_json))


@flocks_bp.post("/<int:flock_id>/production")
@require_auth
def log_production(flock_id):
    flock = db.session.get(Flock, flock_id)
    if not flock:
        return jsonify({"message": "Flock not found."}), 404

    data = request.get_json(silent=True) or {}
    production_log = ProductionLog(
        flock_id=flock.id,
        date=_parse_date(data.get("date")) or date.today(),
        egg_count=_nullable_int(data.get("egg_count")),
        water_consumed=_nullable_float(data.get("water_consumed")),
        notes=data.get("notes"),
    )
    db.session.add(production_log)
    db.session.commit()
    return jsonify(_production_json(production_log)), 201


@flocks_bp.post("/<int:flock_id>/casualty")
@require_auth
def log_casualty(flock_id):
    flock = db.session.get(Flock, flock_id)
    if not flock:
        return jsonify({"message": "Flock not found."}), 404

    data = request.get_json(silent=True) or {}
    if data.get("change_amount") in (None, ""):
        return jsonify({"message": "change_amount is required."}), 400

    change_amount = int(data["change_amount"])
    casualty_log = CasualtyLog(
        flock_id=flock.id,
        date=_parse_date(data.get("date")) or date.today(),
        change_amount=change_amount,
        notes=data.get("notes"),
    )
    db.session.add(casualty_log)
    db.session.flush()
    db.session.expire(flock, ["current_headcount"])
    updated_headcount = flock.current_headcount
    db.session.commit()
    return jsonify({"updated_headcount": updated_headcount, "change_amount": change_amount}), 201


def _user_flocks(user_id):
    return (
        Flock.query.join(Flock.breed)
        .join(AnimalClass)
        .filter(AnimalClass.user_id == user_id)
        .order_by(Flock.name)
        .all()
    )


def _flock_list_json(flock):
    latest_feeding = (
        FeedingEvent.query.filter_by(flock_id=flock.id)
        .order_by(FeedingEvent.timestamp.desc())
        .first()
    )
    today_fed = FeedingEvent.query.filter_by(flock_id=flock.id, date=date.today()).first() is not None
    all_feedings = FeedingEvent.query.filter_by(flock_id=flock.id).all()
    total_feed_cost = sum(event.cost_total for event in all_feedings)
    total_eggs = (
        db.session.query(func.coalesce(func.sum(ProductionLog.egg_count), 0))
        .filter(ProductionLog.flock_id == flock.id)
        .scalar()
        or 0
    )

    return {
        **_flock_base_json(flock),
        "assigned_feeds": [
            _assigned_feed_json(assignment)
            for assignment in flock.feed_assignments
            if assignment.feed_type
        ],
        "last_fed": latest_feeding.timestamp.isoformat() if latest_feeding and latest_feeding.timestamp else None,
        "today_fed": today_fed,
        "total_feed_cost_alltime": round(total_feed_cost, 2),
        "total_eggs_alltime": int(total_eggs),
    }


def _flock_base_json(flock):
    return {
        "id": flock.id,
        "name": flock.name,
        "designation": flock.designation,
        "pen_name": flock.pen_name,
        "current_headcount": flock.current_headcount,
        "breed_name": flock.breed.name if flock.breed else "",
        "animal_class_name": flock.breed.animal_class.name if flock.breed and flock.breed.animal_class else "",
        "created_at": flock.created_at.isoformat() if flock.created_at else None,
    }


def _assigned_feed_json(assignment):
    feed_type = assignment.feed_type
    if not feed_type:
        return None
    return {
        "feed_type_id": feed_type.id,
        "name": feed_type.name,
        "cost_per_lb": round(feed_type.cost_per_lb, 4),
        "current_on_hand": round(feed_type.current_on_hand, 2),
        "unit": feed_type.unit,
        "status": _feed_status(feed_type),
    }


def _flock_stats_json(flock, start_date, end_date):
    all_feedings = FeedingEvent.query.filter_by(flock_id=flock.id).all()
    total_feed_cost = sum(event.cost_total for event in all_feedings)
    total_eggs = (
        db.session.query(func.coalesce(func.sum(ProductionLog.egg_count), 0))
        .filter(ProductionLog.flock_id == flock.id)
        .scalar()
        or 0
    )

    last_30_feedings = [
        event for event in all_feedings if start_date <= event.date <= end_date
    ]
    last_30_feed_cost = sum(event.cost_total for event in last_30_feedings)
    last_30_eggs = (
        db.session.query(func.coalesce(func.sum(ProductionLog.egg_count), 0))
        .filter(ProductionLog.flock_id == flock.id, ProductionLog.date >= start_date, ProductionLog.date <= end_date)
        .scalar()
        or 0
    )
    days = max((end_date - start_date).days + 1, 1)
    headcount = max(flock.current_headcount or 0, 1)
    is_layer = flock.designation in {"layer", "breeder", "mixed"}
    cost_per_dozen = (last_30_feed_cost / last_30_eggs * 12) if is_layer and last_30_eggs else None

    return {
        "total_feed_cost_alltime": round(total_feed_cost, 2),
        "total_eggs_alltime": int(total_eggs),
        "avg_cost_per_bird_per_day": round(last_30_feed_cost / headcount / days, 4),
        "avg_eggs_per_day": round(last_30_eggs / days, 2) if is_layer else None,
        "current_cost_per_dozen": round(cost_per_dozen, 2) if cost_per_dozen is not None else None,
    }


def _feeding_json(event):
    return {
        "id": event.id,
        "date": event.date.isoformat(),
        "timestamp": event.timestamp.isoformat() if event.timestamp else None,
        "feed_name": event.feed_type.name if event.feed_type else "",
        "total_weight": round(event.total_weight, 2),
        "weight_per_bird": round(event.weight_per_bird, 3),
        "cost_total": round(event.cost_total, 2),
        "cost_per_bird": round(event.cost_per_bird, 3),
        "input_method": event.input_method,
    }


def _production_json(log):
    return {
        "id": log.id,
        "date": log.date.isoformat(),
        "egg_count": log.egg_count,
        "water_consumed": log.water_consumed,
        "notes": log.notes,
    }


def _casualty_json(log):
    return {
        "id": log.id,
        "date": log.date.isoformat(),
        "change_amount": log.change_amount,
        "notes": log.notes,
    }


def _headcount_timeline(flock):
    logs = (
        CasualtyLog.query.filter_by(flock_id=flock.id)
        .order_by(CasualtyLog.date.asc(), CasualtyLog.id.asc())
        .all()
    )
    starting_headcount = (flock.current_headcount or 0) - sum(log.change_amount for log in logs)
    timeline = [
        {
            "date": flock.created_at.date().isoformat() if flock.created_at else None,
            "headcount": starting_headcount,
        }
    ]
    current = starting_headcount
    for log in logs:
        current += log.change_amount
        timeline.append({"date": log.date.isoformat(), "headcount": current})
    return timeline


def _paginated_json(pagination, serializer):
    return {
        "items": [serializer(item) for item in pagination.items],
        "page": pagination.page,
        "per_page": pagination.per_page,
        "total": pagination.total,
        "pages": pagination.pages,
    }


def _parse_date(value):
    if not value:
        return None
    try:
        return date.fromisoformat(value)
    except ValueError:
        return None


def _nullable_int(value):
    return None if value in (None, "") else int(value)


def _nullable_float(value):
    return None if value in (None, "") else float(value)


def _feed_status(feed_type):
    if feed_type.current_on_hand <= feed_type.par_level:
        return "critical"
    if feed_type.current_on_hand <= feed_type.par_level * 2:
        return "warning"
    return "ok"
