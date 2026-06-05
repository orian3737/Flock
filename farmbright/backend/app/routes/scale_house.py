import json
import time
from datetime import date, datetime

from flask import Blueprint, Response, jsonify, request, stream_with_context
from flask_cors import CORS
from sqlalchemy import func

from app.extensions import db
from app.models import (
    Alert,
    AnimalClass,
    CasualtyLog,
    FeedType,
    FeedingEvent,
    Flock,
    InventoryTransaction,
    ProductionLog,
    User,
)
from app.services.scale_service import scale
from app.utils.jwt_middleware import require_auth


scale_house_bp = Blueprint("scale_house", __name__, url_prefix="/api/scale-house")
CORS(scale_house_bp, origins=["http://localhost:5173"])


@scale_house_bp.get("/scale/status")
def scale_status():
    connected = scale.is_connected() or scale.connect()
    return jsonify({"connected": connected, "device": "Dymo S400" if connected else None})


@scale_house_bp.get("/scale/read")
def scale_read():
    reading = scale.get_reading()
    return jsonify({**reading, "timestamp": datetime.utcnow().isoformat()})


@scale_house_bp.get("/scale/stream")
def scale_stream():
    def readings():
        while True:
            reading = scale.get_reading()
            payload = {
                "weight_lbs": reading["weight_lbs"],
                "stable": reading["stable"],
                "unit": reading["unit"],
                "connected": reading["connected"],
                "timestamp": datetime.utcnow().isoformat(),
            }
            yield f"data: {json.dumps(payload)}\n\n"
            time.sleep(0.5)

    return Response(stream_with_context(readings()), mimetype="text/event-stream")


@scale_house_bp.get("/queue/<int:user_id>")
def queue(user_id):
    if not db.session.get(User, user_id):
        return jsonify({"message": "User not found."}), 404

    today = date.today()
    flocks = _user_flocks(user_id)
    return jsonify([_queue_flock_json(flock, today) for flock in flocks])


@scale_house_bp.get("/queue/<int:user_id>/summary")
def queue_summary(user_id):
    if not db.session.get(User, user_id):
        return jsonify({"message": "User not found."}), 404

    today = date.today()
    return jsonify(_summary_json(user_id, today))


@scale_house_bp.post("/session")
@require_auth
def log_session():
    data = request.get_json(silent=True) or {}
    required_error = _required(data, ["user_id", "flock_id", "feeding"])
    if required_error:
        return required_error

    feeding = data.get("feeding") or {}
    required_error = _required(feeding, ["feed_type_id", "total_weight", "input_method"])
    if required_error:
        return required_error

    user_id = int(data["user_id"])
    target_date = _parse_date(data.get("date")) or date.today()
    production = data.get("production") or {}
    headcount_change = int(data.get("headcount_change") or 0)
    total_weight = float(feeding.get("total_weight") or 0)
    low_feed_alert = False

    if total_weight <= 0:
        return jsonify({"message": "Feeding weight must be greater than zero."}), 400

    try:
        flock = db.session.get(Flock, data["flock_id"])
        feed_type = db.session.get(FeedType, feeding["feed_type_id"])
        if not flock or not feed_type or not _flock_belongs_to_user(flock, user_id):
            return jsonify({"message": "Flock or feed type not found for this user."}), 404

        if feed_type.user_id != user_id:
            return jsonify({"message": "Feed type not found for this user."}), 404

        if headcount_change != 0:
            db.session.add(
                CasualtyLog(
                    flock_id=flock.id,
                    date=target_date,
                    change_amount=headcount_change,
                    notes=data.get("casualty_notes"),
                )
            )
            db.session.flush()
            db.session.expire(flock, ["current_headcount"])

        feeding_event = FeedingEvent(
            flock_id=flock.id,
            feed_type_id=feed_type.id,
            date=target_date,
            total_weight=total_weight,
            cost_per_lb_at_time=feed_type.cost_per_lb,
            input_method=feeding["input_method"],
        )
        db.session.add(feeding_event)

        if _has_production_data(production):
            db.session.add(
                ProductionLog(
                    flock_id=flock.id,
                    date=target_date,
                    egg_count=_nullable_int(production.get("egg_count")),
                    water_consumed=_nullable_float(production.get("water_consumed")),
                    notes=production.get("notes"),
                )
            )

        db.session.flush()
        db.session.expire(feed_type, ["current_on_hand"])
        updated_headcount = flock.current_headcount
        feed_remaining = feed_type.current_on_hand
        low_feed_alert = feed_remaining <= feed_type.par_level
        response = {
            "success": True,
            "feeding_event": _feeding_event_json(feeding_event),
            "updated_headcount": updated_headcount,
            "feed_remaining": round(feed_remaining, 2),
            "low_feed_alert": low_feed_alert,
            "next_flock": _next_unfed_flock(user_id, target_date),
        }
        db.session.commit()
        return jsonify(response), 201
    except Exception as exc:
        db.session.rollback()
        return jsonify({"message": "Scale House session could not be saved.", "detail": str(exc)}), 400


@scale_house_bp.get("/events/today/<int:user_id>")
def today_events(user_id):
    if not db.session.get(User, user_id):
        return jsonify({"message": "User not found."}), 404

    today = date.today()
    events = _feeding_events_for_user(user_id, today)
    total_weight = sum(event.total_weight for event in events)
    total_cost = sum(event.cost_total for event in events)
    return jsonify(
        {
            "events": [_feeding_event_json(event, include_names=True) for event in events],
            "breakdown": _events_breakdown(user_id, today, events),
            "totals": {
                "total_weight_today": round(total_weight, 2),
                "total_cost_today": round(total_cost, 2),
                "event_count": len(events),
            },
        }
    )


@scale_house_bp.delete("/event/<int:event_id>")
@require_auth
def delete_event(event_id):
    event = db.session.get(FeedingEvent, event_id)
    if not event:
        return jsonify({"message": "Feeding event not found."}), 404

    feed_type = event.feed_type
    try:
        feed_type.current_on_hand += event.total_weight
        db.session.add(
            InventoryTransaction(
                feed_type_id=feed_type.id,
                date=event.date,
                transaction_type="adjustment",
                quantity_change=event.total_weight,
                unit_cost=event.cost_per_lb_at_time or feed_type.cost_per_lb,
                cost_per_lb=event.cost_per_lb_at_time or feed_type.cost_per_lb,
                notes="Deleted feeding event",
            )
        )
        db.session.delete(event)
        db.session.commit()
        return jsonify({"success": True, "feed_remaining": round(feed_type.current_on_hand, 2)})
    except Exception as exc:
        db.session.rollback()
        return jsonify({"message": "Feeding event could not be deleted.", "detail": str(exc)}), 400


@scale_house_bp.patch("/event/<int:event_id>")
@require_auth
def patch_event(event_id):
    event = db.session.get(FeedingEvent, event_id)
    if not event:
        return jsonify({"message": "Feeding event not found."}), 404

    data = request.get_json(silent=True) or {}
    old_feed = event.feed_type
    old_weight = event.total_weight
    new_feed = db.session.get(FeedType, data.get("feed_type_id")) if data.get("feed_type_id") else old_feed
    new_weight = float(data.get("total_weight", old_weight))
    new_date = _parse_date(data.get("date")) or event.date

    if new_weight <= 0:
        return jsonify({"message": "Feeding weight must be greater than zero."}), 400
    if not new_feed:
        return jsonify({"message": "Feed type not found."}), 404

    try:
        old_feed.current_on_hand += old_weight
        db.session.add(
            InventoryTransaction(
                feed_type_id=old_feed.id,
                date=new_date,
                transaction_type="adjustment",
                quantity_change=old_weight,
                unit_cost=event.cost_per_lb_at_time or old_feed.cost_per_lb,
                cost_per_lb=event.cost_per_lb_at_time or old_feed.cost_per_lb,
                notes=f"Adjusted feeding event {event.id}: restored previous weight",
            )
        )

        new_feed.current_on_hand -= new_weight
        new_cost_per_lb = new_feed.cost_per_lb
        db.session.add(
            InventoryTransaction(
                feed_type_id=new_feed.id,
                date=new_date,
                transaction_type="adjustment",
                quantity_change=-new_weight,
                unit_cost=new_cost_per_lb,
                cost_per_lb=new_cost_per_lb,
                notes=f"Adjusted feeding event {event.id}: applied updated weight",
            )
        )

        event.feed_type_id = new_feed.id
        event.total_weight = new_weight
        event.cost_per_lb_at_time = new_cost_per_lb
        event.date = new_date

        if new_feed.current_on_hand <= new_feed.par_level:
            db.session.add(
                Alert(
                    user_id=new_feed.user_id,
                    feed_type_id=new_feed.id,
                    alert_type="low_feed",
                    message=(
                        f"{new_feed.name} is at or below par level: "
                        f"{new_feed.current_on_hand} on hand, par {new_feed.par_level}."
                    ),
                    is_read=False,
                )
            )

        db.session.commit()
        db.session.refresh(event)
        return jsonify(_feeding_event_json(event, include_names=True))
    except Exception as exc:
        db.session.rollback()
        return jsonify({"message": "Feeding event could not be updated.", "detail": str(exc)}), 400


def _required(data, fields):
    missing = [field for field in fields if data.get(field) in (None, "")]
    if missing:
        return jsonify({"message": f"Missing required field(s): {', '.join(missing)}"}), 400
    return None


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


def _has_production_data(production):
    return any(production.get(field) not in (None, "") for field in ("egg_count", "water_consumed", "notes"))


def _user_flocks(user_id):
    return (
        Flock.query.join(Flock.breed)
        .join(AnimalClass)
        .filter(AnimalClass.user_id == user_id)
        .order_by(Flock.name)
        .all()
    )


def _flock_belongs_to_user(flock, user_id):
    return flock.breed and flock.breed.animal_class and flock.breed.animal_class.user_id == user_id


def _queue_flock_json(flock, target_date):
    today_events = sorted(
        [event for event in flock.feeding_events if event.date == target_date],
        key=lambda event: event.timestamp or datetime.min,
    )
    first_event = today_events[0] if today_events else None
    return {
        "flock_id": flock.id,
        "name": flock.name,
        "breed_name": flock.breed.name,
        "animal_class_name": flock.breed.animal_class.name,
        "designation": flock.designation,
        "pen_name": flock.pen_name,
        "current_headcount": flock.current_headcount,
        "assigned_feeds": [
            {
                "feed_type_id": assignment.feed_type.id,
                "name": assignment.feed_type.name,
                "unit": assignment.feed_type.unit,
                "cost_per_unit": assignment.feed_type.cost_per_unit,
                "cost_per_lb": assignment.feed_type.cost_per_lb,
                "bag_weight": assignment.feed_type.bag_weight,
                "bag_price": assignment.feed_type.bag_price,
                "current_on_hand": assignment.feed_type.current_on_hand,
            }
            for assignment in flock.feed_assignments
            if assignment.feed_type
        ],
        "fed_today": bool(today_events),
        "fed_at": first_event.timestamp.isoformat() if first_event and first_event.timestamp else None,
    }


def _summary_json(user_id, target_date):
    flocks = _user_flocks(user_id)
    flock_ids = {flock.id for flock in flocks}
    events = FeedingEvent.query.filter(FeedingEvent.date == target_date).all()
    user_events = [event for event in events if event.flock_id in flock_ids]
    fed_flock_ids = {event.flock_id for event in user_events}
    total_eggs = (
        db.session.query(func.coalesce(func.sum(ProductionLog.egg_count), 0))
        .join(Flock)
        .join(Flock.breed)
        .join(AnimalClass)
        .filter(AnimalClass.user_id == user_id, ProductionLog.date == target_date)
        .scalar()
        or 0
    )
    casualties = (
        db.session.query(func.coalesce(func.sum(CasualtyLog.change_amount), 0))
        .join(Flock)
        .join(Flock.breed)
        .join(AnimalClass)
        .filter(
            AnimalClass.user_id == user_id,
            CasualtyLog.date == target_date,
            CasualtyLog.change_amount < 0,
        )
        .scalar()
        or 0
    )
    total_headcount = sum(max(flock.current_headcount, 0) for flock in flocks)
    total_feed_cost = sum(event.cost_total for event in user_events)
    return {
        "date": target_date.isoformat(),
        "total_flocks": len(flocks),
        "flocks_fed": len(fed_flock_ids),
        "flocks_pending": max(len(flocks) - len(fed_flock_ids), 0),
        "total_feed_used_lbs": round(sum(event.total_weight for event in user_events), 2),
        "total_feed_cost": round(total_feed_cost, 2),
        "total_eggs": int(total_eggs),
        "cost_per_bird": round(total_feed_cost / total_headcount, 3) if total_headcount else 0.0,
        "casualties": abs(int(casualties)),
        "all_done": bool(flocks) and len(fed_flock_ids) == len(flocks),
    }


def _feeding_events_for_user(user_id, target_date):
    return (
        FeedingEvent.query.join(Flock)
        .join(Flock.breed)
        .join(AnimalClass)
        .filter(AnimalClass.user_id == user_id, FeedingEvent.date == target_date)
        .order_by(FeedingEvent.timestamp.desc())
        .all()
    )


def _feeding_event_json(event, include_names=False):
    payload = {
        "id": event.id,
        "date": event.date.isoformat(),
        "timestamp": event.timestamp.isoformat() if event.timestamp else None,
        "flock_id": event.flock_id,
        "feed_type_id": event.feed_type_id,
        "total_weight": round(event.total_weight, 2),
        "cost_per_lb_at_time": round(event.cost_per_lb_at_time, 4)
        if event.cost_per_lb_at_time is not None
        else None,
        "weight_per_bird": round(event.weight_per_bird, 3),
        "cost_total": round(event.cost_total, 2),
        "cost_per_bird": round(event.cost_per_bird, 3),
        "input_method": event.input_method,
    }

    if include_names:
        payload.update(
            {
                "flock_name": event.flock.name if event.flock else "",
                "feed_name": event.feed_type.name if event.feed_type else "",
            }
        )

    return payload


def _events_breakdown(user_id, target_date, events):
    flocks = _user_flocks(user_id)
    breakdown = []
    for flock in flocks:
        flock_events = [event for event in events if event.flock_id == flock.id]
        eggs = sum(
            log.egg_count or 0
            for log in flock.production_logs
            if log.date == target_date
        )
        breakdown.append(
            {
                "flock_id": flock.id,
                "flock_name": flock.name,
                "feed_used_lbs": round(sum(event.total_weight for event in flock_events), 2),
                "cost": round(sum(event.cost_total for event in flock_events), 2),
                "eggs": int(eggs),
                "final_count": flock.current_headcount,
            }
        )
    return breakdown


def _next_unfed_flock(user_id, target_date):
    for flock in _user_flocks(user_id):
        has_event = any(event.date == target_date for event in flock.feeding_events)
        if not has_event:
            return {"flock_id": flock.id, "name": flock.name}
    return None
