from datetime import date, timedelta

from flask import Blueprint, jsonify
from flask_cors import CORS
from sqlalchemy import func

from app.extensions import db
from app.models import (
    Alert,
    AnimalClass,
    FeedType,
    FeedingEvent,
    Flock,
    ProductionLog,
    Revenue,
    User,
)


dashboard_bp = Blueprint("dashboard", __name__, url_prefix="/api/dashboard")
CORS(dashboard_bp, origins=["http://localhost:5173"])


@dashboard_bp.get("/overview/<int:user_id>")
def dashboard_overview(user_id):
    user = db.session.get(User, user_id)
    if not user:
        return jsonify({"message": "User not found."}), 404

    today = date.today()
    yesterday = today - timedelta(days=1)
    flocks = _user_flocks(user_id)
    flock_ids = {flock.id for flock in flocks}

    today_events = FeedingEvent.query.filter(FeedingEvent.date == today).all()
    today_events_by_flock = {}
    for event in today_events:
        if event.flock_id in flock_ids:
            today_events_by_flock.setdefault(event.flock_id, []).append(event)

    fed_flock_ids = set(today_events_by_flock)
    pending_flocks = [
        _pending_flock_json(flock)
        for flock in sorted(flocks, key=lambda item: item.name.lower())
        if flock.id not in fed_flock_ids
    ]

    today_feed_used = sum(event.total_weight for events in today_events_by_flock.values() for event in events)
    today_feed_cost = sum(event.cost_total for events in today_events_by_flock.values() for event in events)
    today_eggs = _egg_total(user_id, today)
    has_casualties = any(log.date == today and log.change_amount < 0 for flock in flocks for log in flock.casualty_logs)

    yesterday_events = FeedingEvent.query.filter(FeedingEvent.date == yesterday).all()
    yesterday_feed_cost = sum(event.cost_total for event in yesterday_events if event.flock_id in flock_ids)
    yesterday_eggs = _egg_total(user_id, yesterday)
    yesterday_revenue = (
        db.session.query(func.coalesce(func.sum(Revenue.amount), 0))
        .filter(Revenue.user_id == user_id, Revenue.date == yesterday)
        .scalar()
        or 0.0
    )
    yesterday_net_pl = yesterday_revenue - yesterday_feed_cost

    feed_types = FeedType.query.filter_by(user_id=user_id).order_by(FeedType.name).all()

    return jsonify(
        {
            "farm_name": user.farm_name,
            "today": {
                "date": today.isoformat(),
                "flocks_total": len(flocks),
                "flocks_fed": len(fed_flock_ids),
                "flocks_pending": pending_flocks,
                "flocks": [
                    _dashboard_flock_json(flock, today_events_by_flock.get(flock.id, []))
                    for flock in sorted(flocks, key=lambda item: item.name.lower())
                ],
                "total_feed_used_lbs": round(today_feed_used, 2),
                "total_feed_cost": round(today_feed_cost, 2),
                "total_eggs": int(today_eggs),
                "has_casualties": has_casualties,
            },
            "alerts": [_alert_json(alert) for alert in _active_feed_alerts(user_id)],
            "yesterday": {
                "total_feed_cost": round(yesterday_feed_cost, 2),
                "total_eggs": int(yesterday_eggs),
                "net_pl": round(yesterday_net_pl, 2),
            },
            "feed_stocks": [_feed_stock_json(feed_type) for feed_type in feed_types],
        }
    )


def _user_flocks(user_id):
    return (
        Flock.query.join(Flock.breed)
        .join(AnimalClass)
        .filter(AnimalClass.user_id == user_id)
        .all()
    )


def _egg_total(user_id, target_date):
    return (
        db.session.query(func.coalesce(func.sum(ProductionLog.egg_count), 0))
        .join(Flock)
        .join(Flock.breed)
        .join(AnimalClass)
        .filter(AnimalClass.user_id == user_id, ProductionLog.date == target_date)
        .scalar()
        or 0
    )


def _assigned_feed_names(flock):
    return [assignment.feed_type.name for assignment in flock.feed_assignments if assignment.feed_type]


def _pending_flock_json(flock):
    return {
        "flock_id": flock.id,
        "name": flock.name,
        "breed_name": flock.breed.name,
        "designation": flock.designation,
        "assigned_feeds": _assigned_feed_names(flock),
    }


def _dashboard_flock_json(flock, events):
    fed_at = min((event.timestamp for event in events if event.timestamp), default=None)
    return {
        **_pending_flock_json(flock),
        "status": "fed" if events else "pending",
        "fed_at": fed_at.isoformat() if fed_at else None,
    }


def _active_feed_alerts(user_id):
    alerts = (
        Alert.query.join(FeedType)
        .filter(Alert.user_id == user_id, Alert.alert_type == "low_feed", Alert.is_read.is_(False))
        .order_by(Alert.created_at.desc())
        .all()
    )
    seen_feed_ids = set()
    deduped = []
    for alert in alerts:
        if alert.feed_type_id in seen_feed_ids:
            continue
        if alert.feed_type and alert.feed_type.current_on_hand <= alert.feed_type.par_level:
            deduped.append(alert)
            seen_feed_ids.add(alert.feed_type_id)
    return deduped


def _alert_json(alert):
    feed_type = alert.feed_type
    return {
        "alert_id": alert.id,
        "feed_name": feed_type.name if feed_type else "Feed",
        "current_on_hand": feed_type.current_on_hand if feed_type else 0,
        "par_level": feed_type.par_level if feed_type else 0,
        "unit": feed_type.unit if feed_type else "lbs",
    }


def _feed_stock_json(feed_type):
    return {
        "name": feed_type.name,
        "current_on_hand": feed_type.current_on_hand,
        "par_level": feed_type.par_level,
        "unit": feed_type.unit,
        "status": _feed_status(feed_type),
    }


def _feed_status(feed_type):
    if feed_type.current_on_hand <= feed_type.par_level:
        return "critical"
    if feed_type.current_on_hand <= feed_type.par_level * 2:
        return "warning"
    return "ok"
