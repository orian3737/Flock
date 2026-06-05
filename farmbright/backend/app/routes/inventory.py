from datetime import date

from flask import Blueprint, jsonify, request
from flask_cors import CORS

from app.extensions import db
from app.models import Alert, FeedType, InventoryTransaction
from app.utils.cors import allowed_origins
from app.utils.jwt_middleware import require_auth


inventory_bp = Blueprint("inventory", __name__, url_prefix="/api/inventory")
CORS(inventory_bp, origins=allowed_origins())


@inventory_bp.get("/<int:user_id>")
def inventory_index(user_id):
    feed_types = FeedType.query.filter_by(user_id=user_id).order_by(FeedType.name).all()
    return jsonify([_feed_type_json(feed_type) for feed_type in feed_types])


@inventory_bp.get("/feed/<int:feed_id>/transactions")
def feed_transactions(feed_id):
    feed_type = db.session.get(FeedType, feed_id)
    if not feed_type:
        return jsonify({"message": "Feed type not found."}), 404

    start_date = _parse_date(request.args.get("start_date"))
    end_date = _parse_date(request.args.get("end_date"))

    query = InventoryTransaction.query.filter_by(feed_type_id=feed_id)
    if start_date:
        query = query.filter(InventoryTransaction.date >= start_date)
    if end_date:
        query = query.filter(InventoryTransaction.date <= end_date)

    transactions_ascending = query.order_by(InventoryTransaction.date.asc(), InventoryTransaction.id.asc()).all()
    running_balance = _starting_balance(feed_type, transactions_ascending)
    rows = []
    for transaction in transactions_ascending:
        running_balance += transaction.quantity_change
        rows.append(_transaction_json(transaction, running_balance))

    return jsonify(list(reversed(rows)))


@inventory_bp.post("/purchase")
@require_auth
def purchase_feed():
    data = request.get_json(silent=True) or {}
    required_error = _required(data, ["feed_type_id", "num_bags", "bag_weight", "bag_price"])
    if required_error:
        return required_error

    feed_type = db.session.get(FeedType, data["feed_type_id"])
    if not feed_type:
        return jsonify({"message": "Feed type not found."}), 404

    num_bags = float(data["num_bags"])
    bag_weight = float(data["bag_weight"])
    bag_price = float(data["bag_price"])
    transaction_date = _parse_date(data.get("date")) or date.today()

    if num_bags <= 0 or bag_weight <= 0:
        return jsonify({"message": "Number of bags and bag weight must be greater than zero."}), 400

    total_quantity = num_bags * bag_weight
    cost_per_lb = bag_price / bag_weight
    feed_type.current_on_hand += total_quantity
    feed_type.bag_weight = bag_weight
    feed_type.bag_price = bag_price
    feed_type.cost_per_unit = cost_per_lb
    db.session.add(
        InventoryTransaction(
            feed_type_id=feed_type.id,
            date=transaction_date,
            transaction_type="purchase",
            quantity_change=total_quantity,
            unit_cost=cost_per_lb,
            bag_weight=bag_weight,
            bag_price=bag_price,
            cost_per_lb=cost_per_lb,
            notes=f"{num_bags:g} bag(s) @ ${bag_price:g} / {bag_weight:g} {feed_type.unit}"
            + (f" - {data.get('supplier')}" if data.get("supplier") else ""),
        )
    )
    Alert.query.filter_by(feed_type_id=feed_type.id, alert_type="low_feed", is_read=False).update(
        {"is_read": True},
        synchronize_session=False,
    )
    db.session.commit()
    return jsonify(_feed_type_json(feed_type)), 201


@inventory_bp.post("/adjustment")
@require_auth
def adjust_feed():
    data = request.get_json(silent=True) or {}
    required_error = _required(data, ["feed_type_id", "quantity_change", "reason"])
    if required_error:
        return required_error

    feed_type = db.session.get(FeedType, data["feed_type_id"])
    if not feed_type:
        return jsonify({"message": "Feed type not found."}), 404

    quantity_change = float(data["quantity_change"])
    transaction_date = _parse_date(data.get("date")) or date.today()

    feed_type.current_on_hand += quantity_change
    db.session.add(
        InventoryTransaction(
            feed_type_id=feed_type.id,
            date=transaction_date,
            transaction_type="adjustment",
            quantity_change=quantity_change,
            unit_cost=feed_type.cost_per_lb,
            cost_per_lb=feed_type.cost_per_lb,
            notes=data.get("reason"),
        )
    )
    db.session.commit()
    return jsonify(_feed_type_json(feed_type)), 201


@inventory_bp.get("/alerts/<int:user_id>")
def inventory_alerts(user_id):
    alerts = (
        Alert.query.join(FeedType)
        .filter(Alert.user_id == user_id, Alert.alert_type == "low_feed", Alert.is_read.is_(False))
        .order_by(Alert.created_at.desc())
        .all()
    )
    return jsonify([_alert_json(alert) for alert in alerts])


@inventory_bp.patch("/feed/<int:feed_id>")
@require_auth
def update_feed(feed_id):
    feed_type = db.session.get(FeedType, feed_id)
    if not feed_type:
        return jsonify({"message": "Feed type not found."}), 404

    data = request.get_json(silent=True) or {}
    if "name" in data:
        feed_type.name = data["name"]
    if "par_level" in data:
        feed_type.par_level = float(data["par_level"])
    if "bag_weight" in data:
        bag_weight = float(data["bag_weight"])
        if bag_weight <= 0:
            return jsonify({"message": "Bag weight must be greater than zero."}), 400
        feed_type.bag_weight = bag_weight
    if "bag_price" in data:
        feed_type.bag_price = float(data["bag_price"])

    db.session.commit()
    return jsonify(_feed_type_json(feed_type))


@inventory_bp.delete("/alert/<int:alert_id>")
def dismiss_alert(alert_id):
    alert = db.session.get(Alert, alert_id)
    if not alert:
        return jsonify({"message": "Alert not found."}), 404

    alert.is_read = True
    db.session.commit()
    return jsonify({"success": True}), 200


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


def _feed_status(feed_type):
    if feed_type.current_on_hand <= feed_type.par_level:
        return "critical"
    if feed_type.current_on_hand <= feed_type.par_level * 2:
        return "warning"
    return "ok"


def _feed_type_json(feed_type):
    return {
        "id": feed_type.id,
        "user_id": feed_type.user_id,
        "name": feed_type.name,
        "unit": feed_type.unit,
        "cost_per_unit": round(feed_type.cost_per_unit, 4),
        "cost_per_lb": round(feed_type.cost_per_lb, 4),
        "bag_weight": round(feed_type.bag_weight, 2),
        "bag_price": round(feed_type.bag_price, 2),
        "par_level": round(feed_type.par_level, 2),
        "current_on_hand": round(feed_type.current_on_hand, 2),
        "status": _feed_status(feed_type),
    }


def _transaction_json(transaction, running_balance):
    return {
        "id": transaction.id,
        "feed_type_id": transaction.feed_type_id,
        "date": transaction.date.isoformat(),
        "transaction_type": transaction.transaction_type,
        "quantity_change": round(transaction.quantity_change, 2),
        "unit_cost": round(transaction.unit_cost, 4) if transaction.unit_cost is not None else None,
        "bag_weight": round(transaction.bag_weight, 2) if transaction.bag_weight is not None else None,
        "bag_price": round(transaction.bag_price, 2) if transaction.bag_price is not None else None,
        "cost_per_lb": round(transaction.cost_per_lb, 4) if transaction.cost_per_lb is not None else None,
        "notes": transaction.notes,
        "running_balance": round(running_balance, 2),
    }


def _alert_json(alert):
    feed_type = alert.feed_type
    return {
        "alert_id": alert.id,
        "feed_type_id": alert.feed_type_id,
        "feed_name": feed_type.name if feed_type else "Feed",
        "message": alert.message,
        "current_on_hand": round(feed_type.current_on_hand, 2) if feed_type else 0,
        "par_level": round(feed_type.par_level, 2) if feed_type else 0,
        "unit": feed_type.unit if feed_type else "lbs",
        "created_at": alert.created_at.isoformat() if alert.created_at else None,
    }


def _starting_balance(feed_type, transactions):
    return feed_type.current_on_hand - sum(transaction.quantity_change for transaction in transactions)
